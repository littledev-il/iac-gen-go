#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn } from 'child_process';

async function synthProject(): Promise<void> {
  const generatedPath = path.join(process.cwd(), 'generated');
  
  if (!await fs.pathExists(generatedPath)) {
    console.error('❌ No generated code found. Run generate command first.');
    process.exit(1);
  }

  console.log('🔄 Running CDKTF synth on generated code...');
  
  // Change to generated directory
  process.chdir(generatedPath);
  
  // Check if it's a CDKTF Go project
  const cdkJsonExists = await fs.pathExists('cdk.json');
  if (!cdkJsonExists) {
    console.error('❌ cdk.json not found in generated code');
    process.exit(1);
  }

  // Read cdk.json to determine the app command
  const cdkJson = await fs.readJson('cdk.json');
  const appCommand = cdkJson.app || 'go run bin/tap.go';
  
  console.log(`📋 App command: ${appCommand}`);
  
  // Check for .gen directory (CDKTF providers)
  if (!await fs.pathExists('.gen')) {
    console.log('📦 Running cdktf get to generate providers...');
    await executeCommand('npx', ['cdktf', 'get']);
  }

  // Run Go mod tidy if go.mod exists
  if (await fs.pathExists('go.mod')) {
    console.log('🔧 Running go mod tidy...');
    await executeCommand('go', ['mod', 'tidy']);
  }

  // Run the synth command
  console.log('🔄 Running synth...');
  if (appCommand.includes('go run')) {
    // For Go projects, run the app directly which will call app.Synth()
    const [, , ...args] = appCommand.split(' ');
    await executeCommand('go', ['run', ...args]);
  } else {
    // For other projects, use cdktf synth
    await executeCommand('npx', ['cdktf', 'synth']);
  }

  console.log('✅ Synth completed successfully');
}

function executeCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
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

synthProject().catch((error) => {
  console.error('❌ Synth failed:', error);
  process.exit(1);
});