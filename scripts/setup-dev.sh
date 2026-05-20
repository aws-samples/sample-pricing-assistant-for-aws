#!/bin/bash

# AWS Pricing Assistant - Development Setup Script
# This script helps set up the development environment

set -e

echo "🚀 Setting up AWS Pricing Assistant development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI is not installed. You'll need it for Bedrock integration."
    echo "   Install from: https://aws.amazon.com/cli/"
else
    echo "✅ AWS CLI detected"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm run install:all

# Create logs directory for backend
mkdir -p backend/logs

# Check AWS credentials
echo "🔐 Checking AWS credentials..."
if aws sts get-caller-identity &> /dev/null; then
    echo "✅ AWS credentials are configured"
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(aws configure get region || echo "us-west-2")
    echo "   Account: $ACCOUNT_ID"
    echo "   Region: $REGION"
else
    echo "⚠️  AWS credentials not configured or invalid"
    echo "   Run 'aws configure' to set up your credentials"
    echo "   You'll need permissions for Amazon Bedrock"
fi

# Check Bedrock access
echo "🤖 Checking Amazon Bedrock access..."
if aws bedrock list-foundation-models --region us-west-2 &> /dev/null; then
    echo "✅ Amazon Bedrock access confirmed"
    
    # Check if Claude Sonnet 4 is available
    if aws bedrock list-foundation-models --region us-west-2 --query 'modelSummaries[?contains(modelId, `claude-sonnet-4`)]' --output text | grep -q "claude-sonnet-4"; then
        echo "✅ Claude Sonnet 4 model available"
    else
        echo "⚠️  Claude Sonnet 4 model not found. Check model availability in your region."
    fi
else
    echo "⚠️  Cannot access Amazon Bedrock. Check your permissions and region."
    echo "   Required permissions:"
    echo "   - bedrock:InvokeModel"
    echo "   - bedrock:GetFoundationModel"
    echo "   - bedrock:ListFoundationModels"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev              # Start both frontend and backend"
echo "  npm run dev:frontend     # Start frontend only (http://localhost:5173)"
echo "  npm run dev:backend      # Start backend only (http://localhost:3001)"
echo ""
echo "Useful endpoints:"
echo "  http://localhost:3001/health     # Backend health check"
echo "  http://localhost:3001/api        # API information"
echo ""
echo "For more information, see docs/development/SETUP.md"
