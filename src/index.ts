#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import { IaCAgent, AgentConfig } from './core/agent';
import { GeneratorConfig } from './core/generator';
import { MCPServerConfig } from './ssh/mcp-server';

const program = new Command();

interface CliConfig {
  anthropicApiKey: string;
  templatePath: string;
  outputPath: string;
  repositoryName: string;
  executionMode: 'local' | 'remote';
  maxCycles: number;
  sshConfig?: {
    host: string;
    port?: number;
    username: string;
    privateKeyPath: string;
    passphrase?: string;
  };
  remoteConfig?: {
    workingDirectory: string;
    githubRepoUrl: string;
    environmentVariables?: Record<string, string>;
  };
}

async function loadConfig(): Promise<CliConfig> {
  const configPath = path.join(process.cwd(), 'iac-gen-config.json');
  
  if (await fs.pathExists(configPath)) {
    console.log('📄 Loading configuration from iac-gen-config.json');
    return await fs.readJson(configPath);
  }

  // Default configuration
  const defaultConfig: CliConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    templatePath: '/Users/anshukkumar/Projects/fl/iac-test-automations2/templates/cdk-go',
    outputPath: path.join(process.cwd(), 'generated'),
    repositoryName: 'iac-gen-go',
    executionMode: 'local',
    maxCycles: 3,
    sshConfig: {
      host: 'your-jump-box-host.com',
      username: 'ec2-user',
      privateKeyPath: path.join(process.env.HOME || '', '.ssh/id_rsa')
    },
    remoteConfig: {
      workingDirectory: '/home/ec2-user/iac-workspace',
      githubRepoUrl: 'https://github.com/botcheddevil/iac-gen-go.git',
      environmentVariables: {
        'AWS_REGION': 'us-east-1',
        'NODE_ENV': 'production'
      }
    }
  };

  console.log('📄 Using default configuration. Create iac-gen-config.json to customize.');
  return defaultConfig;
}

async function saveConfig(config: CliConfig): Promise<void> {
  const configPath = path.join(process.cwd(), 'iac-gen-config.json');
  await fs.writeJson(configPath, config, { spaces: 2 });
  console.log(`💾 Configuration saved to ${configPath}`);
}

program
  .name('iac-gen-go')
  .description('IaC code generator tool using Claude Code SDK for CDKTF Go projects')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate IaC code from a prompt')
  .option('-p, --prompt <prompt>', 'Infrastructure prompt')
  .option('-f, --file <file>', 'Read prompt from file')
  .option('-m, --mode <mode>', 'Execution mode (local|remote)', 'local')
  .option('-c, --cycles <cycles>', 'Maximum cycles', '3')
  .action(async (options) => {
    try {
      const config = await loadConfig();
      
      if (options.mode) {
        config.executionMode = options.mode as 'local' | 'remote';
      }
      
      if (options.cycles) {
        config.maxCycles = parseInt(options.cycles);
      }

      if (!config.anthropicApiKey) {
        console.error('❌ ANTHROPIC_API_KEY is required. Set it in environment or config file.');
        process.exit(1);
      }

      let prompt = options.prompt;
      if (options.file) {
        if (!await fs.pathExists(options.file)) {
          console.error(`❌ Prompt file not found: ${options.file}`);
          process.exit(1);
        }
        prompt = await fs.readFile(options.file, 'utf8');
      }

      if (!prompt) {
        console.error('❌ Prompt is required. Use -p or -f option.');
        process.exit(1);
      }

      console.log('🚀 Starting IaC generation process...');
      console.log(`📋 Prompt: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);
      console.log(`🔧 Mode: ${config.executionMode}`);
      console.log(`🔄 Max cycles: ${config.maxCycles}`);

      const generatorConfig: GeneratorConfig = {
        anthropicApiKey: config.anthropicApiKey,
        templatePath: config.templatePath,
        outputPath: config.outputPath,
        repositoryName: config.repositoryName
      };

      let mcpServerConfig: MCPServerConfig | undefined;
      if (config.executionMode === 'remote' && config.sshConfig && config.remoteConfig) {
        mcpServerConfig = {
          sshConfig: config.sshConfig,
          workingDirectory: config.remoteConfig.workingDirectory,
          githubRepoUrl: config.remoteConfig.githubRepoUrl,
          environmentVariables: config.remoteConfig.environmentVariables
        };
      }

      const agentConfig: AgentConfig = {
        generatorConfig,
        mcpServerConfig,
        maxCycles: config.maxCycles,
        executionMode: config.executionMode
      };

      const agent = new IaCAgent(agentConfig);
      
      const results = await agent.executeAgentCycle({
        prompt,
        context: 'Generate production-ready CDKTF Go infrastructure code'
      });

      // Display results summary
      console.log('\n📊 === EXECUTION SUMMARY ===');
      results.forEach((result, index) => {
        console.log(`\nCycle ${result.cycle}:`);
        console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
        if (result.deploymentOutputs && Object.keys(result.deploymentOutputs).length > 0) {
          console.log(`  Outputs: ${Object.keys(result.deploymentOutputs).join(', ')}`);
        }
      });

      const successCount = results.filter(r => r.success).length;
      console.log(`\n🎯 Final Result: ${successCount}/${results.length} cycles successful`);
      
      if (successCount > 0) {
        console.log('✅ IaC generation completed successfully!');
        if (config.executionMode === 'local') {
          console.log(`📁 Generated files available in: ${config.outputPath}`);
        }
        process.exit(0);
      } else {
        console.log('❌ IaC generation failed. Check the errors above.');
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configure the tool')
  .option('--init', 'Initialize configuration file')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    try {
      if (options.init) {
        const config = await loadConfig();
        await saveConfig(config);
        return;
      }

      if (options.show) {
        const config = await loadConfig();
        console.log('📄 Current configuration:');
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log('Use --init to create config file or --show to display current config');
    } catch (error) {
      console.error('❌ Configuration error:', error);
      process.exit(1);
    }
  });

program
  .command('template')
  .description('Template management')
  .option('--list', 'List available templates')
  .option('--copy <source>', 'Copy template to current directory')
  .action(async (options) => {
    try {
      if (options.list) {
        console.log('📋 Available templates:');
        console.log('  - cdk-go: CDKTF Go template');
        return;
      }

      if (options.copy) {
        const config = await loadConfig();
        const sourcePath = path.join(config.templatePath);
        const targetPath = path.join(process.cwd(), 'template');
        
        if (!await fs.pathExists(sourcePath)) {
          console.error(`❌ Template not found: ${sourcePath}`);
          process.exit(1);
        }

        await fs.copy(sourcePath, targetPath);
        console.log(`✅ Template copied to: ${targetPath}`);
        return;
      }

      console.log('Use --list to show templates or --copy to copy a template');
    } catch (error) {
      console.error('❌ Template error:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();