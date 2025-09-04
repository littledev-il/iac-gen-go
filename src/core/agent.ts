import { IaCGenerator, GeneratorConfig, GenerationRequest } from './generator';
import { CodeExecutor } from './executor';
import { MCPServer, MCPServerConfig } from '../ssh/mcp-server';
import * as path from 'path';

export interface AgentConfig {
  generatorConfig: GeneratorConfig;
  mcpServerConfig?: MCPServerConfig;
  maxCycles: number;
  executionMode: 'local' | 'remote';
}

export interface CycleResult {
  cycle: number;
  success: boolean;
  generationResult?: any;
  buildResult?: any;
  deploymentOutputs?: any;
  error?: string;
}

export class IaCAgent {
  private generator: IaCGenerator;
  private executor?: CodeExecutor;
  private mcpServer?: MCPServer;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.generator = new IaCGenerator(config.generatorConfig);
    
    if (config.executionMode === 'local') {
      this.executor = new CodeExecutor(config.generatorConfig.outputPath);
    } else if (config.mcpServerConfig) {
      this.mcpServer = new MCPServer(config.mcpServerConfig);
    }
  }

  async executeAgentCycle(request: GenerationRequest): Promise<CycleResult[]> {
    const results: CycleResult[] = [];
    let currentPrompt = request.prompt;
    
    console.log('🤖 Starting IaC Agent execution cycle...');
    console.log(`📋 Initial prompt: ${currentPrompt.substring(0, 100)}...`);
    console.log(`🔧 Execution mode: ${this.config.executionMode}`);
    console.log(`🔄 Max cycles: ${this.config.maxCycles}`);

    // Setup remote environment if needed
    if (this.config.executionMode === 'remote' && this.mcpServer) {
      console.log('🔗 Setting up remote environment...');
      await this.mcpServer.connect();
      await this.mcpServer.setupRemoteEnvironment();
    }

    for (let cycle = 1; cycle <= this.config.maxCycles; cycle++) {
      console.log(`\n🔄 === CYCLE ${cycle}/${this.config.maxCycles} ===`);
      
      const cycleResult: CycleResult = {
        cycle,
        success: false
      };

      try {
        // Step 1: Generate/Update code
        console.log('\n📝 Step 1: Generate/Update code');
        const generationResult = await this.generator.generateCDKTFGoCode({
          prompt: currentPrompt,
          context: cycle > 1 ? `This is cycle ${cycle}. Previous attempts may have failed. Please address any issues and ensure the code works correctly.` : request.context
        });

        if (!generationResult.success) {
          cycleResult.error = `Code generation failed: ${generationResult.error}`;
          results.push(cycleResult);
          continue;
        }

        cycleResult.generationResult = generationResult;

        // Validate generated code
        const validation = await this.generator.validateGeneratedCode(generationResult.files);
        if (!validation.valid) {
          cycleResult.error = `Generated code validation failed: ${validation.errors.join(', ')}`;
          results.push(cycleResult);
          continue;
        }

        // Write files (locally or upload to remote)
        if (this.config.executionMode === 'local') {
          await this.generator.writeGeneratedFiles(generationResult.files);
        } else if (this.mcpServer) {
          await this.mcpServer.uploadGeneratedCode(generationResult.files);
        }

        // Step 2-5: Execute build cycle
        console.log('\n🔨 Steps 2-5: Execute build cycle (Build → Synth → Lint → Deploy)');
        
        let buildResult;
        if (this.config.executionMode === 'local' && this.executor) {
          buildResult = await this.executor.executeBuildCycle();
        } else if (this.mcpServer) {
          buildResult = await this.mcpServer.executeRemoteBuildCycle();
        }

        cycleResult.buildResult = buildResult;

        if (!buildResult || !buildResult.success) {
          console.log(`❌ Build cycle failed in cycle ${cycle}`);
          
          // Try to fix issues and continue to next cycle
          if (cycle < this.config.maxCycles) {
            console.log('🔧 Preparing for next cycle with error feedback...');
            currentPrompt = this.generateFixPrompt(currentPrompt, buildResult);
          } else {
            cycleResult.error = `Build cycle failed: ${buildResult?.finalError || buildResult?.error || 'Unknown error'}`;
          }
          results.push(cycleResult);
          continue;
        }

        // Step 5a: Check expectations (deploy success)
        console.log('\n✅ Step 5a: Checking deployment expectations');
        
        let deploymentOutputs: any = {};
        if (this.config.executionMode === 'remote' && this.mcpServer) {
          deploymentOutputs = await this.mcpServer.downloadDeploymentOutputs();
        }
        
        cycleResult.deploymentOutputs = deploymentOutputs;
        
        // If we reach here, the cycle was successful
        cycleResult.success = true;
        results.push(cycleResult);
        
        console.log(`🎉 Cycle ${cycle} completed successfully!`);
        
        // Check if deployment meets expectations from prompt
        const expectationsMet = await this.checkDeploymentExpectations(request.prompt, deploymentOutputs);
        if (expectationsMet) {
          console.log('🎯 All expectations met! Agent cycle completed successfully.');
          break;
        } else if (cycle < this.config.maxCycles) {
          console.log('⚠️ Expectations not fully met. Continuing to next cycle for improvements...');
          currentPrompt = this.generateImprovementPrompt(currentPrompt, deploymentOutputs);
        }

      } catch (error) {
        console.error(`❌ Cycle ${cycle} failed with error:`, error);
        cycleResult.error = error instanceof Error ? error.message : 'Unknown error';
        results.push(cycleResult);
        
        if (cycle < this.config.maxCycles) {
          currentPrompt = this.generateErrorRecoveryPrompt(currentPrompt, error);
        }
      }
    }

    // Cleanup
    if (this.config.executionMode === 'remote' && this.mcpServer) {
      await this.mcpServer.disconnect();
    }

    const successfulCycles = results.filter(r => r.success).length;
    console.log(`\n📊 Agent execution completed. ${successfulCycles}/${results.length} cycles successful.`);
    
    return results;
  }

  private generateFixPrompt(originalPrompt: string, buildResult: any): string {
    let fixContext = '';
    
    if (buildResult?.results?.build && !buildResult.results.build.success) {
      fixContext += `Build error: ${buildResult.results.build.error || buildResult.results.build.output}\n`;
    }
    if (buildResult?.results?.synth && !buildResult.results.synth.success) {
      fixContext += `Synth error: ${buildResult.results.synth.error || buildResult.results.synth.output}\n`;
    }
    if (buildResult?.results?.lint && !buildResult.results.lint.success) {
      fixContext += `Lint error: ${buildResult.results.lint.error || buildResult.results.lint.output}\n`;
    }
    if (buildResult?.results?.deploy && !buildResult.results.deploy.success) {
      fixContext += `Deploy error: ${buildResult.results.deploy.error || buildResult.results.deploy.output}\n`;
    }

    return `${originalPrompt}

IMPORTANT: The previous attempt failed with the following errors:
${fixContext}

Please fix these issues and generate corrected code that will build, synth, lint, and deploy successfully.`;
  }

  private generateImprovementPrompt(originalPrompt: string, deploymentOutputs: any): string {
    return `${originalPrompt}

The previous deployment was successful but may not fully meet all requirements. 
Current deployment outputs: ${JSON.stringify(deploymentOutputs, null, 2)}

Please review and improve the infrastructure to better meet the requirements.`;
  }

  private generateErrorRecoveryPrompt(originalPrompt: string, error: any): string {
    return `${originalPrompt}

CRITICAL: The previous attempt failed with an unexpected error: ${error}

Please generate robust code with proper error handling and validation.`;
  }

  private async checkDeploymentExpectations(originalPrompt: string, deploymentOutputs: any): Promise<boolean> {
    // Basic check - if we have deployment outputs, consider it successful
    // This could be enhanced with more sophisticated prompt analysis
    
    if (!deploymentOutputs || Object.keys(deploymentOutputs).length === 0) {
      return false;
    }

    // Check for common success indicators
    const hasOutputs = Object.keys(deploymentOutputs).some(key => 
      key.includes('output') || key.includes('stack') || key.includes('cfn')
    );

    return hasOutputs;
  }
}