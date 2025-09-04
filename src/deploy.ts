#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn } from 'child_process';

async function deployProject(): Promise<void> {
  const generatedPath = path.join(process.cwd(), 'generated');
  
  if (!await fs.pathExists(generatedPath)) {
    console.error('❌ No generated code found. Run generate command first.');
    process.exit(1);
  }

  console.log('🚀 Deploying generated CDKTF Go infrastructure...');
  
  // Change to generated directory
  process.chdir(generatedPath);
  
  // Check for required files
  const cdkJsonExists = await fs.pathExists('cdk.json');
  if (!cdkJsonExists) {
    console.error('❌ cdk.json not found in generated code');
    process.exit(1);
  }

  // Check for cdktf.out directory (should exist after synth)
  if (!await fs.pathExists('cdktf.out')) {
    console.log('⚠️ cdktf.out not found. Running synth first...');
    await executeCommand('npx', ['cdktf', 'synth']);
  }

  // Set environment variables
  const environmentSuffix = process.env.ENVIRONMENT_SUFFIX || 'dev';
  const awsRegion = process.env.AWS_REGION || 'us-east-1';
  
  console.log(`🔧 Environment: ${environmentSuffix}`);
  console.log(`🌍 AWS Region: ${awsRegion}`);

  // Deploy using CDKTF
  console.log('🚀 Running CDKTF deploy...');
  
  const deployArgs = [
    'cdktf',
    'deploy',
    '--auto-approve'
  ];

  // Add environment context
  deployArgs.push('--', '--context', `environmentSuffix=${environmentSuffix}`);

  await executeCommand('npx', deployArgs, {
    env: {
      ...process.env,
      CDK_DEFAULT_REGION: awsRegion,
      ENVIRONMENT_SUFFIX: environmentSuffix
    }
  });

  // Check for deployment outputs
  console.log('📊 Collecting deployment outputs...');
  await collectDeploymentOutputs();

  console.log('✅ Deployment completed successfully');
}

async function collectDeploymentOutputs(): Promise<void> {
  try {
    // Check for terraform state files in cdktf.out
    const cdktfOutPath = 'cdktf.out';
    if (await fs.pathExists(cdktfOutPath)) {
      const stacks = await fs.readdir(cdktfOutPath);
      
      for (const stack of stacks) {
        const stackPath = path.join(cdktfOutPath, stack);
        const statePath = path.join(stackPath, 'terraform.tfstate');
        
        if (await fs.pathExists(statePath)) {
          console.log(`📋 Found state file for stack: ${stack}`);
          
          // Extract outputs from state
          try {
            const stateContent = await fs.readJson(statePath);
            if (stateContent.outputs) {
              console.log(`📊 Outputs for ${stack}:`);
              for (const [key, output] of Object.entries(stateContent.outputs as Record<string, any>)) {
                console.log(`   ${key}: ${output.value}`);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Could not parse state file for ${stack}:`, error);
          }
        }
      }
    }

    // Create outputs directory
    await fs.ensureDir('cfn-outputs');
    
    // Save deployment metadata
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.ENVIRONMENT_SUFFIX || 'dev',
      region: process.env.AWS_REGION || 'us-east-1',
      success: true
    };
    
    await fs.writeJson('cfn-outputs/deployment-info.json', deploymentInfo, { spaces: 2 });
    
  } catch (error) {
    console.warn('⚠️ Could not collect all deployment outputs:', error);
  }
}

function executeCommand(command: string, args: string[], options: any = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Executing: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

deployProject().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});