# Changelog

All notable changes to the AWS Pricing Assistant project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-05-18 - Open-Source Release

### 🌐 Public Release on aws-samples
- Repository published at https://github.com/aws-samples/sample-pricing-assistant-for-aws
- Single squashed `Initial commit` on aws-samples/main; full development history retained on the upstream mirrors
- LICENSE switched from MIT to MIT-0 (MIT No Attribution) — Amazon-standard for sample code
- Added `CODE_OF_CONDUCT.md` and `CONTRIBUTING.md` per AWS OSPO conventions
- Added README Disclaimer section: PCSR-style non-production wording plus an AI-accuracy note pointing to the AWS Pricing Calculator

### 🧹 Repo Scrub for Public Distribution
- All prod-specific identifiers parameterized in CloudFormation: `DomainName`, `HostedZoneId`, `ALBCertificateArn`, `CloudFrontCertificateArn`, `ALBLoadBalancerArn`, `GitHubRepo`. Default values are placeholders (`your-domain.example.com`, empty strings) — deployers pass real values via pipeline-stack parameters
- Validation Lambda reads `HEALTH_CHECK_URL` from env (was hardcoded)
- ECS services stack accepts `DomainName` and injects `FRONTEND_ORIGIN` into the backend container; backend CORS allowlist now follows the deployed domain via the new env var
- Backend `config.ts` cleaned of dead Bedrock Agent IDs (legacy from pre-Converse-API era)
- `restart-servers.sh` derives project root from `BASH_SOURCE` so it works wherever cloned
- Internal sprint-planning docs removed (`PROJECT_PLAN.md`, `tasks.md`, `SPRINT_*_SUMMARY.md`, sprint completion plans)
- `.claude/` and `.kiro/` directories gitignored to keep local IDE/agent state out of the repo

### 🛡️ AI Disclosure
- Added a persistent "AI-generated estimates — verify with the AWS Pricing Calculator" banner above every chat session (theme-aware, both light and dark)
- Footer copy rewritten from "Get accurate AWS cost estimates" (overclaim) to honest AI-generated language

### 🔐 Optional Cognito Authentication (from earlier unreleased work)
- New `12-cognito.yaml` CloudFormation stack adds optional Cognito auth, gated by `AuthEnabled` parameter
- Admin-managed users (no public sign-up), FIDO2 passkeys (NIST AAL2) configured via SetUserPoolMfaConfig in a bootstrap Lambda, optional/mandatory TOTP MFA flippable at runtime
- JWT validation on REST and WebSocket endpoints when auth is enabled
- AdminPanel UI for user/MFA management; AuthScreen for sign-in
- `EmailSenderMode` parameter switches between Cognito-managed sender and SES with a verified domain

### 📊 Threat Model and Architecture Diagrams Refresh
- Threat model regenerated through all 10 phases via MCP (10 threats including Cognito-conditional auth threats, 10 mitigations, 9 assumptions)
- Architecture diagrams regenerated using the `aws-architecture-diagram` Agent Skill (replacing the deprecated `awslabs.aws-diagram-mcp-server`)

## [2.5.0] - 2026-02-18 - Converse API Migration & Agent Removal

### 🔧 Architecture Overhaul
- **Converse API with Tool Use**: All pricing queries now use Bedrock Converse API with inline tool definitions
- **Live Pricing Data**: getPricing tool calls AWS Price List API directly from backend (no Lambda)
- **Savings Plans Support**: New getSavingsPlans and getSavingsPlansRates tools
- **Legacy Agents Removed**: All 4 Bedrock Agents and 2 pricing Lambda functions deleted
- **PrepareAgents Stage Removed**: Pipeline simplified from 7 to 6 stages
- **Agent Runtime SDK Removed**: `@aws-sdk/client-bedrock-agent-runtime` dependency dropped

### 🎯 Pricing Improvements
- Filtered queries: model passes specific filters (e.g. instanceType: "t3.micro") for exact results
- Slimmed responses: only attributes + on-demand pricing returned (76% token reduction)
- Tools displayed in UI metadata bar (e.g. "Tools: getPricing, getServiceAttributes")
- Model no longer narrates its process — presents answers directly

## [2.4.0] - 2026-02-17 - Claude Opus 4.6 Default Model

### 🧠 Model Upgrade
- **Claude Opus 4.6**: Now the default model via CRIS inference profile
- **Claude Sonnet 4.5**: Retained as secondary option in model dropdown
- **Multi-Model Support**: Users can switch between Opus 4.6 and Sonnet 4.5

### 🔧 Pipeline & Infrastructure Fixes
- **Cross-Region WAF**: WAF stack now deploys to us-east-1 via cross-region pipeline action
- **New Stack**: `infrastructure/10-us-east-1-prereqs.yaml` for cross-region artifact bucket
- **Multi-Region Pipeline**: Switched from `ArtifactStore` to `ArtifactStores` for us-west-2 + us-east-1
- **Missing Execute Actions**: Added CloudFront and WAF execute changeset actions to pipeline
- **Monitoring Fix**: Resolved changeset race condition that caused monitoring stage failures
- **Full Pipeline Green**: All 10 stacks (8 us-west-2 + 2 us-east-1) deploy successfully

### 📊 Updated Architecture Diagrams
- Architecture diagram updated with Opus 4.6, WAF, and cross-region layout
- CI/CD pipeline diagram updated with all 10 stacks and cross-region deployment

## [2.3.0] - 2026-02-02 - CloudFront CDN & Security Hardening

### 🔒 CloudFront CDN Architecture
- **CloudFront Distribution**: Global edge caching for improved performance
- **Security Hardening**: ALB locked to CloudFront prefix list (pl-82a045eb) only
- **HTTPS-Only**: Removed HTTP listener per Amazon security requirements
- **SSL Certificates**: Dual certificates (us-west-2 for ALB, us-east-1 for CloudFront)
- **Custom Domain**: your-domain.example.com via CloudFront

### 🛡️ Security Enhancements
- **CloudFront Prefix List**: ALB security group restricted to pl-82a045eb only
- **No Public Access**: ALB not directly accessible from internet
- **HTTPS Enforcement**: HTTP listener removed, CloudFront handles redirect
- **Origin Request Policy**: Proper header forwarding for all cache behaviors

### 🐛 Critical Fixes
- **CloudFront /assets/* Fix**: Added missing OriginRequestPolicyId
  - Root cause: Without OriginRequestPolicyId, CloudFront didn't forward headers
  - Impact: ALB rejected requests, causing 502 errors
  - Solution: Added AllViewer origin request policy to /assets/* behavior
- **Listener Management**: Moved from ECS stack to CloudFront stack
- **Resource Conflicts**: Eliminated CloudFormation drift and conflicts

### ⚡ Model Updates
- **Claude Sonnet 4.5 Only**: Disabled 4.0 and 3.7 in UI
- **Inference Profiles**: Using Bedrock inference profiles for Sonnet 4.5
- **Simplified UX**: Single model option for consistent experience

### 📋 Infrastructure Changes
- **New Stack**: `aws-pricing-assistant-cloudfront` - CloudFront + ALB listeners
- **Updated Stack**: `aws-pricing-assistant-vpc` - CloudFront prefix list security
- **Updated Stack**: `aws-pricing-assistant-ecs` - Removed listener resources
- **Pipeline Integration**: CloudFront stack added to GitOps deployment

### 🎯 Sprint Achievements
- ✅ CloudFront CDN fully operational
- ✅ ALB locked to CloudFront prefix list only
- ✅ HTTPS-only architecture
- ✅ All resources managed via CloudFormation
- ✅ Site fully functional at https://your-domain.example.com
- ✅ GitOps pipeline includes CloudFront stack

## [2.2.0] - 2025-08-16 - Sprint 8 Complete

### 📱 Mobile Responsiveness
- **Mobile-Optimized UI**: Responsive design for all screen sizes
- **Touch-Friendly Interface**: Optimized buttons and touch targets for mobile
- **Responsive Header**: Adaptive logo, icons, and navigation for mobile devices
- **Mobile Chat Experience**: Optimized chat input and message display
- **Progressive Enhancement**: Mobile-first design with desktop enhancements

### 🎨 UI/UX Improvements
- **Responsive Icons**: Scale from 16px on mobile to 20px on desktop
- **Adaptive Padding**: Reduced padding on mobile for more screen space
- **Smart Hiding**: Non-essential elements hidden on mobile (help button, tooltips, suggestions)
- **Text Scaling**: Responsive text sizes across all breakpoints
- **Better Spacing**: Optimized component spacing for mobile interaction

### 📱 Mobile-Specific Enhancements
- **Sticky Chat Input**: Fixed at bottom of screen on mobile for immediate access
- **Compact Footer**: 70% smaller on mobile with simplified content
- **Hidden Suggestions**: Try asking buttons hidden on mobile to save space
- **Responsive Placeholder**: Shorter placeholder text on mobile devices
- **Touch Optimization**: Larger touch targets and better mobile interaction

### 🔧 Technical Enhancements
- **Architecture Diagrams**: Fixed text overlapping issues with cleaner layouts
- **Documentation Updates**: Updated README with Sprint 7 infrastructure additions
- **Setup Instructions**: Complete deployment guide with monitoring and guardrails
- **Project Completion**: All major features implemented and production-ready

### 🎯 Sprint 8 Achievements
- ✅ Complete mobile responsiveness across all components
- ✅ Touch-friendly interface optimized for mobile devices
- ✅ Production deployment fully operational
- ✅ Comprehensive documentation and setup instructions
- ✅ Architecture diagrams with improved readability
- ✅ PROJECT COMPLETE: All planned features delivered

## [2.1.0] - 2025-08-16 - Sprint 7 Complete

### 🛡️ Bedrock Guardrails Implementation
- **Automated Content Filtering**: Input-only filtering for inappropriate content
- **Version Management**: Automated guardrail version detection and updates
- **Agent Integration**: All Bedrock agents use latest guardrail versions automatically
- **GitOps Integration**: Guardrails deployed through automated pipeline

### 📊 Comprehensive Monitoring & Observability
- **CloudWatch Dashboard**: Complete monitoring with ALB, ECS, Bedrock, Lambda metrics
- **Automated Alerts**: SNS notifications for high error rates, latency, and CPU usage
- **Centralized Logging**: All services log to CloudWatch with structured logging
- **Custom Metrics**: Application-specific metrics for file uploads and backend errors
- **Performance Monitoring**: Real-time visibility into system health and performance

### 🔄 Automated Version Management
- **Guardrail Version Detection**: MD5 hash-based change detection
- **Automatic Version Creation**: New guardrail versions created when configuration changes
- **Agent Updates**: All agents automatically updated to use latest guardrail versions
- **SSM Parameter Integration**: Version management through Systems Manager parameters

### 🚀 Infrastructure Enhancements
- **Docker Hub Rate Limiting Fix**: Migrated to ECR Public Gallery for all base images
- **Agent Preparation Automation**: Fixed IAM permissions and parameter handling
- **Pipeline Reliability**: Improved error handling and deployment validation
- **Production Monitoring**: Complete observability across all AWS services

### 📋 New Infrastructure Stacks
- **Guardrails Stack**: `aws-pricing-assistant-guardrails` - Bedrock Guardrails with automation
- **Monitoring Stack**: `aws-pricing-assistant-monitoring` - CloudWatch dashboard and alerts

### 🎯 Sprint 7 Achievements
- ✅ Complete monitoring dashboard with all widgets working
- ✅ Bedrock Guardrails with automated version management
- ✅ GitOps pipeline integration for monitoring and guardrails
- ✅ Agent preparation automation with proper IAM permissions
- ✅ Performance optimization: Docker Hub rate limiting resolved
- ✅ Production monitoring: Comprehensive observability across all services

## [2.0.0] - 2025-08-16 - Sprint 6 Complete

### 🚀 Major Features Added
- **Complete GitOps CI/CD Pipeline**: Automated infrastructure and application deployment
- **Automated Change Sets**: Production-grade infrastructure updates with validation
- **Automated Agent Preparation**: Bedrock agents prepared automatically after deployment
- **Infrastructure as Code**: All AWS resources managed via CloudFormation templates

### ✅ Infrastructure Automation
- **CodePipeline Integration**: Full GitHub to AWS deployment automation
- **Change Set Validation**: Infrastructure changes validated before execution
- **Zero Downtime Deployment**: ECS services updated with rolling deployments
- **Health Check Validation**: Automated deployment verification

### 🔧 Technical Improvements
- **Production-Grade Safety**: Change sets prevent accidental resource deletion
- **Proper IAM Permissions**: Least privilege access for all pipeline components
- **Error Handling**: Comprehensive error handling and rollback capabilities
- **Audit Trail**: Complete git history of all infrastructure changes

### 📋 Pipeline Stages
1. **Source**: Pull from GitHub repository
2. **CreateChangeSets**: Validate CloudFormation templates
3. **ExecuteChangeSets**: Deploy infrastructure updates (VPC → ECS → Bedrock → Services)
4. **Build**: Docker images for frontend and backend
5. **Deploy**: Update ECS services with new containers
6. **PrepareAgents**: Automatically prepare Bedrock agents
7. **Validate**: Health check confirmation

### 🎯 Sprint 6 Achievements
- ✅ Complete CI/CD pipeline with CodePipeline
- ✅ GitOps infrastructure automation
- ✅ Automated Bedrock agent preparation (solving technical debt)
- ✅ Production-grade change sets for safety
- ✅ Zero manual intervention required
- ✅ Full Infrastructure as Code implementation

### 🔄 Previous Releases

## [1.5.0] - 2025-08-15 - Sprint 5 Complete
### Added
- File upload and analysis functionality
- S3 integration for file storage
- CloudFormation, Terraform, CDK file parsing
- Multiple file combined cost estimation
- WebSocket stability improvements

## [1.4.0] - 2025-08-14 - Sprint 4 Complete  
### Added
- Bedrock Agent integration with AWS Pricing API tools
- Real-time pricing data via automatic tool calling
- Dual agent architecture (simple + complex)
- WebSocket streaming responses
- Dark/light theme toggle

## [1.3.0] - 2025-08-13 - Sprint 3 Complete
### Added
- AWS Bedrock integration with Claude Sonnet models
- Conversation management and context
- Health check endpoints
- Development environment automation

## [1.2.0] - 2025-08-12 - Sprint 2 Complete
### Added
- Responsive web interface with dark theme
- Real-time chat functionality
- Message history and typing indicators
- Mobile-responsive design

## [1.1.0] - 2025-08-11 - Sprint 1 Complete
### Added
- Project foundation and structure
- AWS Pricing API integration
- Basic architecture documentation
- Development environment setup

## [1.0.0] - 2025-08-10 - Project Inception
### Added
- Initial project setup
- Technology stack selection
- Project planning and documentation
