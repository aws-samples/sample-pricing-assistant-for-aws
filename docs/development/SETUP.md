# Development Setup Guide

This guide will help you set up the AWS Pricing Assistant Chatbot for local development.

## Prerequisites

### Required Software
- **Node.js 20+** and **npm 9+**
- **Git**
- **AWS CLI** configured with appropriate credentials
- **Code Editor** (VS Code recommended)

### AWS Requirements
- AWS account with access to:
  - Amazon Bedrock (Claude Sonnet 4)
  - AWS Pricing API
- AWS CLI configured with credentials that have permissions for:
  - `bedrock:InvokeModel`
  - `bedrock:GetFoundationModel`
  - `bedrock:ListFoundationModels`
  - `pricing:GetProducts`
  - `pricing:DescribeServices`

## Installation Steps

### 1. Clone the Repository
```bash
git clone <repository-url>
cd aws-pricing-assistant
```

### 2. Install Dependencies
```bash
# Install all dependencies (root, frontend, and backend)
npm run install:all

# Or install individually:
npm install                    # Root dependencies
npm run install:frontend      # Frontend dependencies
npm run install:backend       # Backend dependencies
```

### 3. Configure Environment Variables

#### Backend Environment (.env)
Create `backend/.env` file:
```env
# Server Configuration
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# AWS Configuration
AWS_REGION=us-west-2
AWS_PROFILE=default

# Bedrock Configuration
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_GUARDRAIL_ID=your-guardrail-id
BEDROCK_GUARDRAIL_VERSION=1

# MCP Server Configuration
MCP_SERVER_URL=http://localhost:3000
MCP_SERVER_TIMEOUT=30000

# Logging
LOG_LEVEL=debug
```

#### Frontend Environment (.env)
Create `frontend/.env` file:
```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001
VITE_API_TIMEOUT=30000

# Feature Flags
VITE_ENABLE_FILE_UPLOAD=true
VITE_ENABLE_COST_COMPARISON=true
VITE_MAX_FILE_SIZE=10485760

# Development
VITE_NODE_ENV=development
```

### 4. AWS CLI Configuration

Ensure your AWS CLI is configured:
```bash
# Configure AWS CLI (if not already done)
aws configure

# Test AWS access
aws sts get-caller-identity

# Test Bedrock access
aws bedrock list-foundation-models --region us-west-2
```

### 5. Set Up AWS Pricing MCP Server

Follow the detailed instructions in [MCP_SETUP.md](../mcp/MCP_SETUP.md) to:
1. Clone the AWS Pricing MCP Server
2. Install and configure it locally
3. Test the connection

## Development Workflow

### Starting the Development Servers

#### Option 1: Start Both Servers Concurrently
```bash
npm run dev
```
This starts both frontend (port 5173) and backend (port 3001) servers.

#### Option 2: Start Servers Individually
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend  
npm run dev:frontend
```

### Available Scripts

#### Root Level Scripts
```bash
npm run dev              # Start both frontend and backend
npm run build           # Build both applications
npm run test            # Run all tests
npm run lint            # Lint all code
npm run clean           # Clean all build artifacts and node_modules
```

#### Frontend Scripts
```bash
cd frontend
npm run dev             # Start development server
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Lint TypeScript/React code
npm run type-check      # Type check without emitting
```

#### Backend Scripts
```bash
cd backend
npm run dev             # Start development server with hot reload
npm run build           # Build TypeScript to JavaScript
npm run start           # Start production server
npm run test            # Run Jest tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

## Development Tools

### VS Code Extensions (Recommended)
- ES7+ React/Redux/React-Native snippets
- TypeScript Importer
- Tailwind CSS IntelliSense
- ESLint
- Prettier
- AWS Toolkit

### VS Code Settings
Create `.vscode/settings.json`:
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  }
}
```

## Testing the Setup

### 1. Verify Frontend
- Navigate to http://localhost:5173
- Should see the chat interface with dark theme
- Check browser console for any errors

### 2. Verify Backend
- Navigate to http://localhost:3001/health
- Should return `{"status": "ok", "timestamp": "..."}`

### 3. Test AWS Bedrock Connection
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the cost of an EC2 t3.micro instance?"}'
```

### 4. Test MCP Server Connection
```bash
curl -X GET http://localhost:3001/api/pricing/services
```

## Troubleshooting

### Common Issues

#### AWS Credentials Not Found
```bash
# Check AWS configuration
aws configure list

# Set AWS profile if needed
export AWS_PROFILE=your-profile-name
```

#### Bedrock Access Denied
- Ensure your AWS account has Bedrock access enabled
- Check IAM permissions for Bedrock services
- Verify the model ID is correct for your region

#### MCP Server Connection Failed
- Ensure MCP server is running on the correct port
- Check firewall settings
- Verify MCP server configuration

#### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill process if needed
kill -9 <PID>
```

### Debug Mode

Enable debug logging:
```bash
# Backend
DEBUG=aws-pricing-assistant:* npm run dev:backend

# Frontend (check browser console)
VITE_DEBUG=true npm run dev:frontend
```

## Next Steps

Once your development environment is set up:

1. Review the [Architecture Documentation](../architecture/OVERVIEW.md)
2. Check the [API Documentation](../api/README.md)
3. Start with Sprint 2 tasks in [PROJECT_PLAN.md](../../PROJECT_PLAN.md)

## Getting Help

- Check the [FAQ](FAQ.md) for common questions
- Review existing [GitHub Issues](../../.github/ISSUE_TEMPLATE.md)
- Consult the [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- Reference the [MCP Server Documentation](https://github.com/awslabs/mcp/tree/main/src/aws-pricing-mcp-server)

---
*Last Updated: 2025-08-07*
