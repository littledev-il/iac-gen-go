# Example Infrastructure Prompt

Create a secure, scalable web application infrastructure on AWS with the following requirements:

## Core Infrastructure
- **VPC**: Create a new VPC with CIDR 10.0.0.0/16
- **Subnets**: 
  - 2 public subnets in different AZs for load balancer
  - 2 private subnets in different AZs for application servers
  - 2 private subnets for database
- **Internet Gateway**: For public subnet internet access
- **NAT Gateway**: For private subnet outbound internet access

## Compute & Networking  
- **Application Load Balancer**: Internet-facing ALB in public subnets
- **Auto Scaling Group**: EC2 instances in private subnets
  - Instance type: t3.medium
  - Min: 2, Max: 6, Desired: 2
  - Health checks enabled
- **Security Groups**: 
  - ALB security group (allow HTTP/HTTPS from internet)
  - EC2 security group (allow traffic from ALB only)
  - RDS security group (allow MySQL from EC2 only)

## Database
- **RDS MySQL**: Multi-AZ deployment in private database subnets
  - Instance class: db.t3.micro
  - Encrypted at rest
  - Automated backups enabled (7 days retention)
  - No public access

## Storage & CDN
- **S3 Bucket**: For static assets and application files
  - Versioning enabled
  - Server-side encryption
  - Block all public access
- **CloudFront Distribution**: 
  - Origin: S3 bucket
  - HTTPS redirect
  - Caching optimized for web content

## DNS & SSL
- **Route53 Hosted Zone**: For domain management
- **ACM Certificate**: SSL/TLS certificate for HTTPS
- **DNS Records**: Point domain to CloudFront and ALB

## Security & Monitoring
- **IAM Roles**: 
  - EC2 instance role with S3 and CloudWatch permissions
  - Least privilege principle
- **CloudWatch**: 
  - Log groups for application logs
  - Alarms for high CPU and disk usage
- **Systems Manager**: For EC2 instance management

## Tags
Apply consistent tags to all resources:
- Environment: "production"
- Project: "webapp"
- Owner: "devops-team"

## Output Requirements
After deployment, the infrastructure should provide:
1. ALB DNS name for application access
2. CloudFront distribution domain
3. RDS endpoint for database connection
4. S3 bucket name for file storage
5. Route53 hosted zone ID

## Security Considerations
- No direct SSH access to EC2 instances (use Systems Manager)
- Database accessible only from application tier
- S3 bucket not publicly accessible
- All data encrypted in transit and at rest
- Security groups follow least privilege model

Please generate complete CDKTF Go code that creates this infrastructure following AWS best practices for security, scalability, and cost optimization.