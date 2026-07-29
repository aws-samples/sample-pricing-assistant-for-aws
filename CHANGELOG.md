# Changelog

All notable changes to the AWS Pricing Assistant project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Public releases on `aws-samples` follow their own `v1.x.y` tag track, independent of the internal version numbers above. Entries below are labeled with the public tag where they map to an aws-samples release.

## [v1.2.1] - 2026-07-28 - Pricing Lookup Fixes (public tag)

### 🐛 Pricing Lookups Returned No Rates (critical)
Every pricing question answered "pricing rates are not currently available" — the model received product records with no prices attached, so it correctly declined to quote figures it couldn't verify.

- **Root cause:** the AWS Pricing SDK returns `GetProducts` `PriceList` entries as *boxed* `String` objects (`typeof === 'object'`, `instanceof String`), not primitive strings. The parse guard `typeof p === 'string' ? JSON.parse(p) : p` therefore skipped the parse and treated the raw JSON text as an already-parsed object, so property access produced a char-indexed map (`{'0':'{', '1':'"', ...}`) and `product` / `terms` came back `undefined`. Every product surfaced with `attributes: {}` and `onDemandPricing: []`.
- **Why it was invisible:** no thrown error, no failed request, HTTP 200 throughout — health checks, logs, and ECS status all stayed green.
- **Fix:** normalize with `String(p)` before parsing; only pass an entry through untouched when it is a genuine non-`String` object. Handles primitive strings, boxed `String`s, and already-parsed objects.

### 🔍 Three More Silent Failures (found auditing every AWS SDK call site)
- **Unmapped regions returned zero results.** A hardcoded 15-entry region-name map meant any other region code (`eu-north-1`, `ap-southeast-3`, `me-central-1`, …) was sent as a `location` filter value, matched nothing, and returned empty with no error. Replaced with the API's `regionCode` filter field, which accepts region codes directly — regional pricing is now correctly differentiated (t3.micro: us-east-1 $7.59/mo vs eu-north-1 $7.88/mo).
- **`getSavingsPlans` threw on every service-scoped query.** `DescribeSavingsPlansOfferings` accepts only `instanceFamily` and `region` as filter names; `serviceCode` was passed as a filter, raising a `ValidationException` that failed the whole call. Service scoping now uses the correct `productTypes` parameter, with a service-code → product-type mapping so either form works.
- **Zero-result lookups were indistinguishable from "no pricing exists".** `getPricing` now returns `pricedCount` and a diagnostic warning when nothing matched (or when products matched with no On-Demand dimensions), so the model corrects its filters instead of reporting rates as unavailable. Tool descriptions now also note that EBS bills under `AmazonEC2` (there is no `AmazonEBS` service code) and that any region code is valid.
- Audited clean: S3 (`GetObject`/`Head`/`Put`/`Delete`) async-iterates the body stream into a Buffer; Bedrock Converse handling uses optional chaining with explicit fallbacks.

### 🧪 Tests and Tooling
- Added `backend/scripts/check-pricing-parse.mts`, wired into `npm test`. Dependency-free with no network calls (this repo has no Jest config, so `npm test` previously failed with "0 matches"). Covers all three `PriceList` entry shapes, asserts the old naive `typeof` predicate is still reproducibly broken, and guards savings-plans filter-name validity plus region-code passthrough.
- Added the missing ESLint configs (`backend/.eslintrc.cjs`, `frontend/.eslintrc.cjs`). The repo had no ESLint config at all, so `npm run lint` failed in both workspaces by walking into `dist/`. Lint now passes at `--max-warnings 0`.
- Resolved all 10 pre-existing lint warnings: 4 `react-hooks/exhaustive-deps` and 6 `react-refresh/only-export-components` (each context + hook split into its own module). Also fixed a pre-existing WebSocket leak — the reconnect `setTimeout` was never cancelled on teardown and could open an orphan socket after unmount.
- Typed `asyncHandler`'s `fn: Function` parameter as a real Express handler signature.

## [v1.2.0] - 2026-07-28 - Claude Opus 5 / Sonnet 5 + Dependency Security Update (public tag)

### 🤖 Model Update — Claude Opus 5 and Sonnet 5
- Model dropdown updated to the latest of each family: **Claude Opus 5** (`us.anthropic.claude-opus-5`, default) and **Claude Sonnet 5** (`us.anthropic.claude-sonnet-5`), both via Bedrock cross-region inference profiles (verified ACTIVE in us-west-2)
- Replaces Claude Opus 4.6 (`us.anthropic.claude-opus-4-6-v1`) and Claude Sonnet 4.5 (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- Updated across `ModelSelector.tsx`, `useModel.tsx`, `bedrockToolService.ts`, `bedrockService.ts`, `config/index.ts`, `index.ts`, `04-ecs-services.yaml` (renamed env vars `BEDROCK_INFERENCE_PROFILE_{OPUS,SONNET}_ARN`), `06-monitoring.yaml` dashboard, README, threat model, and issue template
- **Removed `temperature` and `topP` from Bedrock `inferenceConfig`** — Claude Opus 5 / Sonnet 5 reject sampling parameters (`temperature is deprecated for this model`). Both models verified end-to-end against the live Pricing API tool loop after removal
- No fixed model-ID suffix on the new profiles (`claude-opus-5`, not a dated `-vN:0`), matching Anthropic's current CRIS naming

### 🔐 Dependency Security Fixes
- `axios` → 1.18.1 (frontend + backend): fixes 12 advisories incl. GHSA-gcfj-64vw-6mp9 (HIGH — inherited-proxy after interceptor clone), prototype-pollution and DoS advisories
- `js-yaml` → 4.3.0: fixes GHSA-52cp-r559-cp3m (HIGH — quadratic CPU on YAML merge-key chains)
- `morgan` → 1.11.0: fixes GHSA-4vj7-5mj6-jm8m (log forging via control chars in `:remote-user`)
- `shell-quote` → 1.10.0 (override): fixes GHSA-395f-4hp3-45gv (HIGH — quadratic-complexity DoS in `parse()`)
- `brace-expansion` → 5.0.8 (override): fixes GHSA-3jxr-9vmj-r5cp (HIGH) and GHSA-mh99-v99m-4gvg (OOM DoS)
- `postcss` → 8.5.24 (via `npm audit fix`): fixes GHSA-r28c-9q8g-f849 (HIGH — path traversal in source-map auto-loading)
- Removed unused `react-router-dom` dependency from the frontend (no router usage anywhere in `frontend/src`) — eliminates the react-router open-redirect/XSS advisory surface (GHSA-jjmj-jmhj-qwj2) entirely rather than pinning it
- `npm audit` now reports **0 vulnerabilities** across all workspaces
- Closes public Dependabot alerts for axios, brace-expansion, morgan, shell-quote, js-yaml, react-router-dom

## [v1.1.3] - 2026-07-06 - Dependency Security Update (js-yaml) (public tag)

Published to aws-samples as tag `v1.1.3` (public tip `3b805d1`).

### 🔐 Dependency Security Fixes
- `js-yaml` bumped to >= 3.15.0 (transitive via `@istanbuljs/load-nyc-config`, 3.14.2 → 3.15.0): fixes GHSA-h67p-54hq-rp68 (medium)
- `npm audit` now reports 0 vulnerabilities across the affected workspaces
- Dependabot alert #27 (js-yaml, GHSA-h67p-54hq-rp68) auto-closed on the public repo post-publish

## [v1.1.2] - 2026-07-06 - Container and Dependency Security Updates (public tag)

Published to aws-samples as tag `v1.1.2` (public tip `6d8aec5`).

### 🔐 Dependency Security Fixes
- `vite` 7.3.5 → 7.3.6 (frontend)
- `@babel/core` → 7.29.7 (transitive): fixes GHSA-4x5r-pxfx-6jf8
- `esbuild` → 0.28.1 (transitive via vite): fixes GHSA-g7r4-m6w7-qqqr
- `npm audit` now reports 0 vulnerabilities across the frontend and backend workspaces

### 🐳 Container Base-Image Security Updates
- `frontend/Dockerfile`: `apk update && apk upgrade` in the `nginx:alpine` runtime and `node:20-alpine` builder stages
- `backend/Dockerfile`: `apk update && apk upgrade` in the `node:20-alpine` base
- Applies Alpine security updates at build time (recent examples: expat 2.7.5 → 2.8.2, openssl 3.5.6 → 3.5.7)
- Note: the Dockerfile `apk` layers were already present on the previous public tip (`b0b3419`), so this publish carried no net Dockerfile diff — the changes are documented here for release-notes completeness.

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
