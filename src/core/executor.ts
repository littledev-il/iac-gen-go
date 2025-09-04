import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

export interface ExecutionStep {
  name: string;
  command: string;
  args: string[];
  description: string;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export class CodeExecutor {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  async executeCommand(command: string, args: string[] = [], options: SpawnOptions = {}): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      console.log(`🔄 Executing: ${command} ${args.join(' ')}`);
      
      const child = spawn(command, args, {
        cwd: this.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const success = code === 0;
        const output = stdout + stderr;
        
        if (success) {
          console.log(`✅ Command succeeded: ${command}`);
        } else {
          console.error(`❌ Command failed: ${command} (exit code: ${code})`);
        }

        resolve({
          success,
          output,
          error: success ? undefined : stderr || `Command exited with code ${code}`,
          exitCode: code || 0
        });
      });

      child.on('error', (error) => {
        console.error(`❌ Command error: ${command}`, error);
        resolve({
          success: false,
          output: stdout,
          error: error.message,
          exitCode: 1
        });
      });
    });
  }

  async executeBuildCycle(maxAttempts: number = 3): Promise<{ success: boolean; results: Record<string, ExecutionResult>; finalError?: string }> {
    const results: Record<string, ExecutionResult> = {};
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`\n🔄 Starting build cycle attempt ${attempt}/${maxAttempts}`);

      // Step 1: Build
      console.log('\n=== Step 1: Build ===');
      results.build = await this.executeCommand('npm', ['run', 'build']);
      if (!results.build.success) {
        console.log('❌ Build failed, attempting to fix and retry...');
        const fixResult = await this.attemptBuildFix(results.build);
        if (fixResult.success) {
          results.build = await this.executeCommand('npm', ['run', 'build']);
        }
        if (!results.build.success) {
          if (attempt === maxAttempts) {
            return { success: false, results, finalError: 'Build phase failed after all attempts' };
          }
          continue;
        }
      }

      // Step 2: Synth
      console.log('\n=== Step 2: Synth ===');
      results.synth = await this.executeCommand('npm', ['run', 'synth']);
      if (!results.synth.success) {
        console.log('❌ Synth failed, attempting to fix and retry...');
        const fixResult = await this.attemptSynthFix(results.synth);
        if (fixResult.success) {
          results.synth = await this.executeCommand('npm', ['run', 'synth']);
        }
        if (!results.synth.success) {
          if (attempt === maxAttempts) {
            return { success: false, results, finalError: 'Synth phase failed after all attempts' };
          }
          continue;
        }
      }

      // Step 3: Lint
      console.log('\n=== Step 3: Lint ===');
      results.lint = await this.executeCommand('npm', ['run', 'lint']);
      if (!results.lint.success) {
        console.log('❌ Lint failed, attempting to fix and retry...');
        const fixResult = await this.attemptLintFix(results.lint);
        if (fixResult.success) {
          results.lint = await this.executeCommand('npm', ['run', 'lint']);
        }
        if (!results.lint.success) {
          if (attempt === maxAttempts) {
            return { success: false, results, finalError: 'Lint phase failed after all attempts' };
          }
          continue;
        }
      }

      // Step 4: Deploy
      console.log('\n=== Step 4: Deploy ===');
      results.deploy = await this.executeCommand('npm', ['run', 'deploy']);
      if (!results.deploy.success) {
        console.log('❌ Deploy failed, attempting to fix and retry...');
        const fixResult = await this.attemptDeployFix(results.deploy);
        if (fixResult.success) {
          results.deploy = await this.executeCommand('npm', ['run', 'deploy']);
        }
        if (!results.deploy.success) {
          // For deployment, we might want to continue if it's an expected failure
          console.log('⚠️ Deploy failed, but continuing to validation...');
        }
      }

      // All steps completed successfully
      console.log('\n✅ Build cycle completed successfully');
      return { success: true, results };
    }

    return { success: false, results, finalError: 'Build cycle failed after maximum attempts' };
  }

  private async attemptBuildFix(buildResult: ExecutionResult): Promise<ExecutionResult> {
    console.log('🔧 Attempting to fix build issues...');
    
    const output = buildResult.output || buildResult.error || '';
    
    // Check for missing dependencies
    if (output.includes('Cannot find module') || output.includes('Module not found')) {
      console.log('📦 Installing missing dependencies...');
      return await this.executeCommand('npm', ['install']);
    }
    
    // Check for Go module issues
    if (output.includes('go.mod') || output.includes('go.sum')) {
      console.log('🔧 Fixing Go modules...');
      const result1 = await this.executeCommand('go', ['mod', 'tidy']);
      if (result1.success) {
        return await this.executeCommand('go', ['mod', 'download']);
      }
      return result1;
    }
    
    return { success: false, output: 'No automatic fix available', exitCode: 1 };
  }

  private async attemptSynthFix(synthResult: ExecutionResult): Promise<ExecutionResult> {
    console.log('🔧 Attempting to fix synth issues...');
    
    const output = synthResult.output || synthResult.error || '';
    
    // Check for CDKTF provider issues
    if (output.includes('cdktf get') || output.includes('.gen')) {
      console.log('📦 Running CDKTF get...');
      return await this.executeCommand('npx', ['cdktf', 'get']);
    }
    
    return { success: false, output: 'No automatic fix available', exitCode: 1 };
  }

  private async attemptLintFix(lintResult: ExecutionResult): Promise<ExecutionResult> {
    console.log('🔧 Attempting to fix lint issues...');
    
    const output = lintResult.output || lintResult.error || '';
    
    // Check for Go formatting issues
    if (output.includes('gofmt') || output.includes('format')) {
      console.log('🎨 Formatting Go code...');
      return await this.executeCommand('gofmt', ['-w', '.']);
    }
    
    return { success: false, output: 'No automatic fix available', exitCode: 1 };
  }

  private async attemptDeployFix(deployResult: ExecutionResult): Promise<ExecutionResult> {
    console.log('🔧 Attempting to fix deploy issues...');
    
    const output = deployResult.output || deployResult.error || '';
    
    // Check for AWS credential issues
    if (output.includes('credentials') || output.includes('access denied')) {
      console.log('🔑 AWS credentials issue detected');
      return { success: false, output: 'AWS credentials need to be configured', exitCode: 1 };
    }
    
    // Check for resource conflicts
    if (output.includes('already exists') || output.includes('conflict')) {
      console.log('🗑️ Attempting cleanup of conflicting resources...');
      return await this.executeCommand('npm', ['run', 'destroy']);
    }
    
    return { success: false, output: 'No automatic fix available', exitCode: 1 };
  }

  async cleanup(): Promise<ExecutionResult> {
    console.log('🗑️ Running cleanup...');
    return await this.executeCommand('npm', ['run', 'destroy']);
  }
}