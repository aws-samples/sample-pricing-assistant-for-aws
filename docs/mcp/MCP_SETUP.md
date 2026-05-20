# AWS Pricing MCP Server Setup

This guide explains how to set up and integrate the AWS Pricing MCP Server for local development.

## Overview

The AWS Pricing MCP Server provides access to AWS pricing data through the Model Context Protocol (MCP). It enables our chatbot to query real-time AWS pricing information for cost estimation.

**Repository:** https://github.com/awslabs/mcp/tree/main/src/aws-pricing-mcp-server

## Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate credentials
- Git

## Installation Steps

### 1. Clone the MCP Repository

```bash
# Navigate to a directory outside your project (e.g., ~/tools)
cd ~/tools
git clone https://github.com/awslabs/mcp.git
cd mcp/src/aws-pricing-mcp-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the MCP Server

```bash
npm run build
```

### 4. Configure AWS Credentials

The MCP server uses your AWS credentials to access the Pricing API:

```bash
# Verify AWS configuration
aws configure list

# Test pricing API access
aws pricing describe-services --region us-east-1
```

**Required IAM Permissions:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "pricing:GetProducts",
                "pricing:DescribeServices",
                "pricing:GetAttributeValues"
            ],
            "Resource": "*"
        }
    ]
}
```

### 5. Test the MCP Server

```bash
# Start the MCP server
npm start

# In another terminal, test basic functionality
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

## Integration with Our Backend

### 1. MCP Client Configuration

Create `backend/src/config/mcp.ts`:

```typescript
export const mcpConfig = {
  serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000',
  timeout: parseInt(process.env.MCP_SERVER_TIMEOUT || '30000'),
  retryAttempts: 3,
  retryDelay: 1000,
};

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
```

### 2. MCP Service Implementation

Create `backend/src/services/mcpService.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';
import { mcpConfig, MCPRequest, MCPResponse } from '@/config/mcp.js';
import { logger } from '@/utils/logger.js';

export class MCPService {
  private client: AxiosInstance;
  private requestId = 0;

  constructor() {
    this.client = axios.create({
      baseURL: mcpConfig.serverUrl,
      timeout: mcpConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async makeRequest(method: string, params?: any): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    try {
      const response = await this.client.post('/mcp', request);
      const mcpResponse: MCPResponse = response.data;

      if (mcpResponse.error) {
        throw new Error(`MCP Error: ${mcpResponse.error.message}`);
      }

      return mcpResponse.result;
    } catch (error) {
      logger.error('MCP request failed:', error);
      throw error;
    }
  }

  async listTools(): Promise<any[]> {
    return this.makeRequest('tools/list');
  }

  async getPricing(params: {
    service: string;
    region?: string;
    filters?: Record<string, any>;
  }): Promise<any> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing',
      arguments: params,
    });
  }

  async getServiceCodes(): Promise<string[]> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing_service_codes',
      arguments: {},
    });
  }

  async getServiceAttributes(serviceCode: string): Promise<string[]> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing_service_attributes',
      arguments: { service_code: serviceCode },
    });
  }

  async getAttributeValues(
    serviceCode: string,
    attributeNames: string[]
  ): Promise<Record<string, string[]>> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing_attribute_values',
      arguments: {
        service_code: serviceCode,
        attribute_names: attributeNames,
      },
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }
}

export const mcpService = new MCPService();
```

### 3. Health Check Endpoint

Add to `backend/src/controllers/healthController.ts`:

```typescript
import { Request, Response } from 'express';
import { mcpService } from '@/services/mcpService.js';

export const healthCheck = async (req: Request, res: Response) => {
  try {
    const mcpHealthy = await mcpService.healthCheck();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        mcp: mcpHealthy ? 'healthy' : 'unhealthy',
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
};
```

## Testing the Integration

### 1. Start Both Servers

```bash
# Terminal 1: Start MCP Server
cd ~/tools/mcp/src/aws-pricing-mcp-server
npm start

# Terminal 2: Start Backend
cd /path/to/aws-pricing-assistant/backend
npm run dev
```

### 2. Test Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-08-07T23:00:00.000Z",
  "services": {
    "mcp": "healthy"
  }
}
```

### 3. Test Pricing Query

```bash
curl -X POST http://localhost:3001/api/pricing/services \
  -H "Content-Type: application/json"
```

### 4. Test Service-Specific Pricing

```bash
curl -X POST http://localhost:3001/api/pricing/query \
  -H "Content-Type: application/json" \
  -d '{
    "service": "AmazonEC2",
    "region": "us-west-2",
    "filters": {
      "instanceType": "t3.micro"
    }
  }'
```

## Sample Pricing Queries

Here are some example queries you can test:

### EC2 Instance Pricing
```json
{
  "service": "AmazonEC2",
  "region": "us-west-2",
  "filters": {
    "instanceType": "t3.micro",
    "tenancy": "Shared",
    "operatingSystem": "Linux"
  }
}
```

### S3 Storage Pricing
```json
{
  "service": "AmazonS3",
  "region": "us-west-2",
  "filters": {
    "storageClass": "Standard"
  }
}
```

### Lambda Pricing
```json
{
  "service": "AWSLambda",
  "region": "us-west-2"
}
```

## Troubleshooting

### Common Issues

#### MCP Server Won't Start
- Check Node.js version (requires 18+)
- Verify all dependencies are installed
- Check for port conflicts (default: 3000)

#### AWS Credentials Error
```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check pricing API access
aws pricing describe-services --region us-east-1
```

#### Connection Timeout
- Increase timeout in backend `.env`:
  ```env
  MCP_SERVER_TIMEOUT=60000
  ```
- Check firewall settings
- Verify MCP server is running and accessible

#### Pricing Data Not Found
- Verify service codes using `get_pricing_service_codes`
- Check attribute names using `get_pricing_service_attributes`
- Ensure filters match available attribute values

### Debug Mode

Enable debug logging for the MCP server:

```bash
DEBUG=* npm start
```

For our backend:
```bash
LOG_LEVEL=debug npm run dev
```

## Production Considerations

For production deployment:

1. **Security**: Use IAM roles instead of access keys
2. **Scaling**: Consider running multiple MCP server instances
3. **Caching**: Implement pricing data caching to reduce API calls
4. **Monitoring**: Add health checks and alerting
5. **Rate Limiting**: Implement rate limiting for pricing queries

## Next Steps

Once MCP integration is working:

1. Test various pricing scenarios
2. Implement error handling and retries
3. Add caching for frequently requested pricing data
4. Create unit tests for MCP service
5. Document common pricing query patterns

---
*Last Updated: 2025-08-07*
