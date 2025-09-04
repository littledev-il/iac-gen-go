# IaC Generator Go

A powerful Infrastructure as Code (IaC) generator tool that uses Claude Code SDK to create CDKTF Go projects. This tool can automatically generate, build, synthesize, lint, and deploy AWS infrastructure based on natural language prompts.

## Features

- 🤖 **AI-Powered Generation**: Uses Claude 3.5 Sonnet to generate infrastructure code from natural language prompts
- 🔄 **Automated Execution Cycle**: Runs build → synth → lint → deploy cycle with automatic error fixing
- 🌐 **Remote Execution**: Supports execution on AWS jump boxes via SSH MCP server
- 🔧 **Error Recovery**: Intelligent error detection and automatic retry with fixes
- 📊 **Output Collection**: Automatically collects and reports deployment outputs
- 🎯 **Expectation Validation**: Checks if deployed infrastructure meets prompt requirements

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up your API key**:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

3. **Initialize configuration**:
   ```bash
   npm run config:init
   ```

4. **Generate infrastructure**:
   ```bash
   npm run generate -- --prompt "Create an S3 bucket with versioning enabled"
   ```

## Installation

```bash
git clone https://github.com/botcheddevil/iac-gen-go.git
cd iac-gen-go
npm install
```

## Configuration

Create a `iac-gen-config.json` file in your project root:

```json
{
  "anthropicApiKey": "your-api-key",
  "templatePath": "/path/to/template",
  "outputPath": "./generated",
  "repositoryName": "iac-gen-go",
  "executionMode": "local",
  "maxCycles": 3,
  "sshConfig": {
    "host": "your-jump-box.amazonaws.com",
    "username": "ec2-user",
    "privateKeyPath": "~/.ssh/id_rsa"
  },
  "remoteConfig": {
    "workingDirectory": "/home/ec2-user/iac-workspace",
    "githubRepoUrl": "https://github.com/botcheddevil/iac-gen-go.git",
    "environmentVariables": {
      "AWS_REGION": "us-east-1",
      "NODE_ENV": "production"
    }
  }
}
```

## Usage

### Command Line Interface

#### Generate Infrastructure

```bash
# Generate from prompt
npm run generate -- --prompt "Create a VPC with public and private subnets"

# Generate from file
npm run generate -- --file infrastructure-prompt.txt

# Remote execution
npm run generate -- --prompt "Create an RDS database" --mode remote

# Multiple cycles
npm run generate -- --prompt "Create a complete web app stack" --cycles 5
```

#### Configuration Management

```bash
# Show current configuration
npm run config:show

# Initialize configuration file
npm run config:init
```

#### Template Management

```bash
# List available templates
npx iac-gen-go template --list

# Copy template to current directory
npx iac-gen-go template --copy cdk-go
```

### Programmatic Usage

```typescript
import { IaCAgent, AgentConfig } from './src/core/agent';
import { GeneratorConfig } from './src/core/generator';

const generatorConfig: GeneratorConfig = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  templatePath: './template',
  outputPath: './generated',
  repositoryName: 'my-iac-project'
};

const agentConfig: AgentConfig = {
  generatorConfig,
  maxCycles: 3,
  executionMode: 'local'
};

const agent = new IaCAgent(agentConfig);

const results = await agent.executeAgentCycle({
  prompt: 'Create an S3 bucket with CloudFront distribution',
  context: 'Production environment for static website hosting'
});

console.log('Generation results:', results);
```

## Execution Modes

### Local Mode
- Generates code locally
- Executes build/deploy cycles on local machine
- Requires AWS credentials and Go/Node.js setup locally

### Remote Mode
- Generates code locally using Claude
- Uploads code to AWS jump box via SSH
- Executes build/deploy cycles remotely
- Ideal for CI/CD pipelines and controlled environments

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Prompt   │───▶│  Claude Code SDK │───▶│  Generated IaC  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ AWS Resources   │◀───│  Deploy Cycle    │◀───│  Build & Synth  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Validation &   │
                       │ Error Recovery   │
                       └──────────────────┘
```

## Supported Infrastructure

- **AWS Services**: S3, VPC, EC2, RDS, Lambda, API Gateway, CloudFront, Route53, and more
- **Infrastructure Patterns**: Web applications, data pipelines, microservices, serverless architectures
- **Security**: IAM roles, security groups, encryption, access policies
- **Networking**: VPCs, subnets, NAT gateways, load balancers

## Error Handling

The tool automatically handles common errors:

- **Build Errors**: Missing dependencies, Go module issues
- **Synth Errors**: CDKTF provider generation, configuration issues
- **Lint Errors**: Go formatting, code quality issues  
- **Deploy Errors**: Resource conflicts, credential issues, cleanup

## Environment Variables

- `ANTHROPIC_API_KEY`: Required for Claude API access
- `AWS_REGION`: AWS region for deployment (default: us-east-1)
- `ENVIRONMENT_SUFFIX`: Environment suffix for resource naming
- `CDK_DEFAULT_ACCOUNT`: AWS account ID
- `CDK_DEFAULT_REGION`: AWS region for CDK

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Clean build artifacts
npm clean
```

## Examples

### Example 1: Simple S3 Bucket

```bash
npm run generate -- --prompt "Create an S3 bucket named 'my-app-storage' with versioning enabled and public access blocked"
```

### Example 2: Web Application Stack

```bash
npm run generate -- --prompt "Create a complete web application stack with:
- VPC with public and private subnets
- Application Load Balancer
- EC2 instances in Auto Scaling Group
- RDS MySQL database
- CloudFront distribution
- Route53 hosted zone"
```

### Example 3: Serverless API

```bash
npm run generate -- --prompt "Create a serverless REST API with:
- API Gateway
- Lambda functions for CRUD operations
- DynamoDB table
- IAM roles with least privilege
- CloudWatch logging"
```

## Troubleshooting

### Common Issues

1. **API Key Issues**
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   ```

2. **AWS Credentials**
   ```bash
   aws configure
   # or
   export AWS_ACCESS_KEY_ID="..."
   export AWS_SECRET_ACCESS_KEY="..."
   ```

3. **Go Module Issues**
   ```bash
   cd generated && go mod tidy
   ```

4. **SSH Connection Issues**
   ```bash
   ssh-add ~/.ssh/id_rsa
   ssh -i ~/.ssh/id_rsa user@host
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Create an issue on GitHub
- 💬 Join our Discord community
- 📖 Check the documentation wiki

---

Built with ❤️ using Claude Code SDK and CDKTF Go