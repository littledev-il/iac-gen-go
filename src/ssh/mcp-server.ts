import { NodeSSH } from 'node-ssh';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  privateKeyPath: string;
  passphrase?: string;
}

export interface MCPServerConfig {
  sshConfig: SSHConfig;
  workingDirectory: string;
  githubRepoUrl: string;
  environmentVariables?: Record<string, string>;
}

export class MCPServer {
  private ssh: NodeSSH;
  private config: MCPServerConfig;
  private connected: boolean = false;

  constructor(config: MCPServerConfig) {
    this.ssh = new NodeSSH();
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      console.log(`🔗 Connecting to SSH server: ${this.config.sshConfig.host}`);
      
      const privateKey = await fs.readFile(this.config.sshConfig.privateKeyPath, 'utf8');
      
      await this.ssh.connect({
        host: this.config.sshConfig.host,
        port: this.config.sshConfig.port || 22,
        username: this.config.sshConfig.username,
        privateKey,
        passphrase: this.config.sshConfig.passphrase,
      });

      this.connected = true;
      console.log('✅ SSH connection established');
    } catch (error) {
      console.error('❌ SSH connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      this.ssh.dispose();
      this.connected = false;
      console.log('🔌 SSH connection closed');
    }
  }

  async executeRemoteCommand(command: string, options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
    if (!this.connected) {
      throw new Error('SSH not connected');
    }

    try {
      console.log(`🖥️ Executing remote command: ${command}`);
      
      const workingDir = options.cwd || this.config.workingDirectory;
      const fullCommand = `cd ${workingDir} && ${command}`;
      
      const result = await this.ssh.execCommand(fullCommand, {
        cwd: workingDir
      });

      if (result.code === 0) {
        console.log(`✅ Remote command succeeded: ${command}`);
      } else {
        console.error(`❌ Remote command failed: ${command} (code: ${result.code})`);
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code || 0
      };
    } catch (error) {
      console.error('❌ Remote command execution error:', error);
      throw error;
    }
  }

  async setupRemoteEnvironment(): Promise<void> {
    console.log('🔧 Setting up remote environment...');

    // Clone or update repository
    await this.cloneRepository();
    
    // Install dependencies
    await this.installDependencies();
    
    // Setup environment variables
    await this.setupEnvironmentVariables();
    
    console.log('✅ Remote environment setup complete');
  }

  private async cloneRepository(): Promise<void> {
    console.log('📥 Cloning/updating repository...');
    
    const checkRepoResult = await this.executeRemoteCommand(`test -d ${this.config.workingDirectory}/.git`);
    
    if (checkRepoResult.code === 0) {
      // Repository exists, update it
      console.log('🔄 Repository exists, pulling latest changes...');
      await this.executeRemoteCommand('git pull origin main', { cwd: this.config.workingDirectory });
    } else {
      // Clone repository
      console.log('📋 Cloning repository...');
      const parentDir = path.dirname(this.config.workingDirectory);
      const repoName = path.basename(this.config.workingDirectory);
      
      await this.executeRemoteCommand(`mkdir -p ${parentDir}`);
      await this.executeRemoteCommand(`git clone ${this.config.githubRepoUrl} ${repoName}`, { cwd: parentDir });
    }
  }

  private async installDependencies(): Promise<void> {
    console.log('📦 Installing dependencies...');
    
    // Check for package.json and install npm dependencies
    const packageJsonExists = await this.executeRemoteCommand('test -f package.json');
    if (packageJsonExists.code === 0) {
      console.log('📦 Installing npm dependencies...');
      await this.executeRemoteCommand('npm install');
    }
    
    // Check for Go modules
    const goModExists = await this.executeRemoteCommand('test -f go.mod');
    if (goModExists.code === 0) {
      console.log('🔧 Setting up Go modules...');
      await this.executeRemoteCommand('go mod tidy');
      await this.executeRemoteCommand('go mod download');
    }
  }

  private async setupEnvironmentVariables(): Promise<void> {
    if (!this.config.environmentVariables) return;
    
    console.log('🔧 Setting up environment variables...');
    
    const envVars = Object.entries(this.config.environmentVariables)
      .map(([key, value]) => `export ${key}="${value}"`)
      .join('\n');
    
    await this.executeRemoteCommand(`echo '${envVars}' >> ~/.bashrc`);
  }

  async uploadGeneratedCode(files: Record<string, string>): Promise<void> {
    console.log('📤 Uploading generated code to remote server...');
    
    for (const [filePath, content] of Object.entries(files)) {
      const remotePath = path.join(this.config.workingDirectory, filePath);
      const remoteDir = path.dirname(remotePath);
      
      // Ensure remote directory exists
      await this.executeRemoteCommand(`mkdir -p ${remoteDir}`);
      
      // Create temporary file locally
      const tempFile = path.join('/tmp', path.basename(filePath));
      await fs.writeFile(tempFile, content, 'utf8');
      
      try {
        // Upload file
        await this.ssh.putFile(tempFile, remotePath);
        console.log(`   ✅ Uploaded: ${filePath}`);
        
        // Clean up temporary file
        await fs.remove(tempFile);
      } catch (error) {
        console.error(`   ❌ Failed to upload: ${filePath}`, error);
        await fs.remove(tempFile).catch(() => {}); // Clean up even on error
        throw error;
      }
    }
  }

  async executeRemoteBuildCycle(): Promise<{ success: boolean; results: Record<string, any>; error?: string }> {
    try {
      console.log('🔄 Starting remote build cycle...');
      
      const results: Record<string, any> = {};
      
      // Build
      console.log('\n=== Remote Build ===');
      results.build = await this.executeRemoteCommand('npm run build');
      if (results.build.code !== 0) {
        return { success: false, results, error: 'Remote build failed' };
      }
      
      // Synth
      console.log('\n=== Remote Synth ===');
      results.synth = await this.executeRemoteCommand('npm run synth');
      if (results.synth.code !== 0) {
        return { success: false, results, error: 'Remote synth failed' };
      }
      
      // Lint
      console.log('\n=== Remote Lint ===');
      results.lint = await this.executeRemoteCommand('npm run lint');
      if (results.lint.code !== 0) {
        return { success: false, results, error: 'Remote lint failed' };
      }
      
      // Deploy
      console.log('\n=== Remote Deploy ===');
      results.deploy = await this.executeRemoteCommand('npm run deploy');
      if (results.deploy.code !== 0) {
        return { success: false, results, error: 'Remote deploy failed' };
      }
      
      console.log('✅ Remote build cycle completed successfully');
      return { success: true, results };
      
    } catch (error) {
      console.error('❌ Remote build cycle failed:', error);
      return { 
        success: false, 
        results: {}, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async downloadDeploymentOutputs(): Promise<Record<string, any>> {
    console.log('📥 Downloading deployment outputs...');
    
    try {
      // Check for common output files
      const outputFiles = ['cfn-outputs/', 'cdk-stacks.json', 'terraform.tfstate'];
      const outputs: Record<string, any> = {};
      
      for (const file of outputFiles) {
        const remotePath = path.join(this.config.workingDirectory, file);
        const checkResult = await this.executeRemoteCommand(`test -e ${remotePath}`);
        
        if (checkResult.code === 0) {
          // File/directory exists, download it
          if (file.endsWith('/')) {
            // Directory - get listing
            const listResult = await this.executeRemoteCommand(`ls -la ${remotePath}`);
            outputs[file] = listResult.stdout;
          } else {
            // File - get content
            const catResult = await this.executeRemoteCommand(`cat ${remotePath}`);
            if (catResult.code === 0) {
              try {
                outputs[file] = JSON.parse(catResult.stdout);
              } catch {
                outputs[file] = catResult.stdout;
              }
            }
          }
        }
      }
      
      return outputs;
    } catch (error) {
      console.error('❌ Failed to download deployment outputs:', error);
      return {};
    }
  }
}