import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface GeneratorConfig {
  anthropicApiKey: string;
  templatePath: string;
  outputPath: string;
  repositoryName: string;
}

export interface GenerationRequest {
  prompt: string;
  context?: string;
}

export class IaCGenerator {
  private anthropic: Anthropic;
  private config: GeneratorConfig;

  constructor(config: GeneratorConfig) {
    this.config = config;
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  async generateCDKTFGoCode(request: GenerationRequest): Promise<{ success: boolean; files: Record<string, string>; error?: string }> {
    try {
      console.log('🔄 Generating CDKTF Go code from prompt...');
      
      // Read template structure for context
      const templateContext = await this.readTemplateStructure();
      
      const systemPrompt = `You are an expert in Infrastructure as Code (IaC) using CDKTF (CDK for Terraform) with Go. 
      Your task is to generate complete, production-ready CDKTF Go code based on the user's infrastructure requirements.

      Template structure context:
      ${templateContext}

      Requirements:
      1. Generate complete Go files for CDKTF infrastructure
      2. Follow Go best practices and conventions
      3. Include proper error handling and validation
      4. Use AWS CDK constructs appropriately
      5. Ensure code is ready for build, synth, lint, and deploy
      6. Include proper imports and module structure
      7. Generate lib/tap_stack.go and bin/tap.go files
      8. Include cdk.json configuration
      9. Follow the same structure as the template

      Response format:
      Provide the generated files in a JSON format with file paths as keys and file contents as values.
      Example:
      {
        "lib/tap_stack.go": "package lib\\n\\n...",
        "bin/tap.go": "package main\\n\\n...",
        "cdk.json": "{\\n  \\"app\\": \\"go run bin/tap.go\\"\\n}"
      }`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: `${request.context ? `Context: ${request.context}\n\n` : ''}Infrastructure Requirements:\n${request.prompt}`
          }
        ],
        system: systemPrompt
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Claude response');
      }

      const files = JSON.parse(jsonMatch[0]);
      
      console.log('✅ Successfully generated CDKTF Go code');
      return { success: true, files };
      
    } catch (error) {
      console.error('❌ Error generating code:', error);
      return { 
        success: false, 
        files: {}, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async writeGeneratedFiles(files: Record<string, string>): Promise<void> {
    console.log('📝 Writing generated files to disk...');
    
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(this.config.outputPath, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content, 'utf8');
      console.log(`   ✅ Written: ${filePath}`);
    }
  }

  private async readTemplateStructure(): Promise<string> {
    try {
      const templatePath = this.config.templatePath;
      
      if (!await fs.pathExists(templatePath)) {
        return 'Template not found';
      }

      const structure: string[] = [];
      
      // Read key template files for context
      const keyFiles = [
        'cdk.json',
        'bin/tap.go',
        'lib/tap_stack.go'
      ];

      for (const file of keyFiles) {
        const filePath = path.join(templatePath, file);
        if (await fs.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf8');
          structure.push(`=== ${file} ===\n${content}\n`);
        }
      }

      return structure.join('\n');
    } catch (error) {
      console.warn('Warning: Could not read template structure:', error);
      return 'Template structure unavailable';
    }
  }

  async validateGeneratedCode(files: Record<string, string>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check required files
    const requiredFiles = ['lib/tap_stack.go', 'bin/tap.go', 'cdk.json'];
    for (const file of requiredFiles) {
      if (!files[file]) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    // Basic Go syntax validation
    for (const [filePath, content] of Object.entries(files)) {
      if (filePath.endsWith('.go')) {
        if (!content.includes('package ')) {
          errors.push(`${filePath}: Missing package declaration`);
        }
      }
    }

    // Validate cdk.json
    if (files['cdk.json']) {
      try {
        JSON.parse(files['cdk.json']);
      } catch {
        errors.push('cdk.json: Invalid JSON format');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}