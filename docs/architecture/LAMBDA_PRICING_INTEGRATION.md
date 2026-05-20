# AWS Lambda Pricing Integration Architecture

This document outlines the Lambda-based approach for AWS Pricing integration in production.

## Why Lambda is the Right Choice

### ✅ **Perfect Fit for MCP Server**
- **Event-driven**: MCP requests are perfect for Lambda's event model
- **Stateless**: MCP server doesn't need persistent connections
- **Scalable**: Automatic scaling for concurrent pricing requests
- **Cost-effective**: Pay only for actual pricing queries

### ✅ **Operational Benefits**
- **No server management**: AWS handles all infrastructure
- **Built-in monitoring**: CloudWatch logs and metrics included
- **Automatic retries**: Lambda handles failures gracefully
- **Version management**: Easy deployments and rollbacks

### ✅ **Performance Advantages**
- **Fast cold starts**: Node.js Lambda starts quickly (~200ms)
- **Provisioned concurrency**: Can eliminate cold starts entirely
- **Regional deployment**: Deploy close to your backend
- **Connection pooling**: Reuse AWS SDK connections across invocations

## Architecture Overview

### Production Architecture
```
Frontend → Backend → Lambda (MCP Server) → AWS Pricing API
                  ↓
              ElastiCache (Redis)
```

### Request Flow
1. User asks pricing question in chat
2. Backend identifies need for pricing data
3. Backend invokes Lambda function with MCP request
4. Lambda checks cache (Redis) first
5. If cache miss, Lambda queries AWS Pricing API
6. Lambda caches result and returns to backend
7. Backend formats response for user

## Lambda Implementation

### Lambda Function Structure
```typescript
// lambda/pricing-mcp/src/index.ts
import { Handler, Context } from 'aws-lambda';
import { createClient } from 'redis';
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

// Global variables for connection reuse
let pricingClient: PricingClient;
let redisClient: any;

const initializeClients = async () => {
  if (!pricingClient) {
    pricingClient = new PricingClient({ 
      region: 'us-east-1', // Pricing API only in us-east-1
      maxAttempts: 3
    });
  }
  
  if (!redisClient) {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_ENDPOINT}:6379`,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true
      }
    });
    await redisClient.connect();
  }
};

export const handler: Handler = async (event: MCPRequest, context: Context): Promise<MCPResponse> => {
  console.log('MCP Request:', JSON.stringify(event, null, 2));
  
  try {
    await initializeClients();
    
    const response = await handleMCPRequest(event);
    
    console.log('MCP Response:', JSON.stringify(response, null, 2));
    return response;
    
  } catch (error) {
    console.error('Lambda error:', error);
    
    return {
      jsonrpc: '2.0',
      id: event.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    };
  }
};

const handleMCPRequest = async (request: MCPRequest): Promise<MCPResponse> => {
  switch (request.method) {
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'get_pricing',
              description: 'Get AWS service pricing information',
              inputSchema: {
                type: 'object',
                properties: {
                  service_code: { type: 'string' },
                  region: { type: 'string' },
                  filters: { type: 'object' }
                },
                required: ['service_code']
              }
            },
            {
              name: 'get_pricing_service_codes',
              description: 'Get list of available AWS service codes'
            }
          ]
        }
      };
      
    case 'tools/call':
      return await handleToolCall(request);
      
    default:
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`
        }
      };
  }
};

const handleToolCall = async (request: MCPRequest): Promise<MCPResponse> => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'get_pricing':
      const pricingResult = await getPricing(args);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: pricingResult
      };
      
    case 'get_pricing_service_codes':
      const serviceCodes = await getServiceCodes();
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: serviceCodes
      };
      
    default:
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Tool not found: ${name}`
        }
      };
  }
};

const getPricing = async (params: any) => {
  const cacheKey = `pricing:${JSON.stringify(params)}`;
  
  // Try cache first
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log('Cache hit for:', cacheKey);
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  
  // Query AWS Pricing API
  const command = new GetProductsCommand({
    ServiceCode: params.service_code,
    Filters: buildFilters(params.filters, params.region),
    MaxResults: 100
  });
  
  const response = await pricingClient.send(command);
  const result = processPricingResponse(response);
  
  // Cache the result
  try {
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result)); // 1 hour TTL
    console.log('Cached result for:', cacheKey);
  } catch (error) {
    console.warn('Cache write error:', error);
  }
  
  return result;
};

const getServiceCodes = async () => {
  const cacheKey = 'service-codes';
  
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  
  // Implementation for getting service codes
  const serviceCodes = [
    'AmazonEC2', 'AmazonS3', 'AWSLambda', 'AmazonRDS', 
    'AmazonDynamoDB', 'AmazonCloudFront', 'AmazonVPC'
  ];
  
  try {
    await redisClient.setEx(cacheKey, 86400, JSON.stringify(serviceCodes)); // 24 hours
  } catch (error) {
    console.warn('Cache write error:', error);
  }
  
  return serviceCodes;
};

const buildFilters = (filters: any, region?: string) => {
  const awsFilters = [];
  
  if (region) {
    awsFilters.push({
      Type: 'TERM_MATCH',
      Field: 'location',
      Value: regionToLocation(region)
    });
  }
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      awsFilters.push({
        Type: 'TERM_MATCH',
        Field: key,
        Value: value
      });
    });
  }
  
  return awsFilters;
};

const regionToLocation = (region: string): string => {
  const regionMap: Record<string, string> = {
    'us-east-1': 'US East (N. Virginia)',
    'us-west-2': 'US West (Oregon)',
    'eu-west-1': 'Europe (Ireland)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
  };
  return regionMap[region] || region;
};

const processPricingResponse = (response: any) => {
  const products = response.PriceList?.map((item: string) => JSON.parse(item)) || [];
  
  return {
    products: products.map(product => ({
      sku: product.product.sku,
      productFamily: product.product.productFamily,
      attributes: product.product.attributes,
      pricing: extractPricingTerms(product.terms)
    })),
    totalResults: products.length,
    timestamp: new Date().toISOString()
  };
};

const extractPricingTerms = (terms: any) => {
  const onDemand = terms?.OnDemand || {};
  const reserved = terms?.Reserved || {};
  
  return {
    onDemand: processOnDemandPricing(onDemand),
    reserved: processReservedPricing(reserved)
  };
};

const processOnDemandPricing = (onDemand: any) => {
  // Process on-demand pricing structure
  const pricing: any = {};
  
  Object.values(onDemand).forEach((term: any) => {
    Object.values(term.priceDimensions || {}).forEach((dimension: any) => {
      pricing[dimension.unit] = {
        price: parseFloat(dimension.pricePerUnit?.USD || '0'),
        currency: 'USD',
        description: dimension.description
      };
    });
  });
  
  return pricing;
};

const processReservedPricing = (reserved: any) => {
  // Process reserved instance pricing
  return {}; // Simplified for now
};
```

### Backend Lambda Client
```typescript
// backend/src/services/lambdaMCPService.ts
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { MCPRequest, MCPResponse } from '@/utils/validation.js';
import { logger, logMCPCall } from '@/utils/logger.js';
import { MCPError } from '@/utils/errors.js';

export class LambdaMCPService {
  private lambda: LambdaClient;
  private functionName: string;
  private requestId = 0;

  constructor() {
    this.lambda = new LambdaClient({ 
      region: process.env.AWS_REGION || 'us-west-2',
      maxAttempts: 3
    });
    this.functionName = process.env.MCP_LAMBDA_FUNCTION_NAME || 'aws-pricing-mcp-function';
  }

  private async invokeLambda(method: string, params?: any): Promise<any> {
    const startTime = Date.now();
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    try {
      const command = new InvokeCommand({
        FunctionName: this.functionName,
        Payload: JSON.stringify(request),
        InvocationType: 'RequestResponse'
      });

      const response = await this.lambda.send(command);
      
      if (response.FunctionError) {
        throw new Error(`Lambda function error: ${response.FunctionError}`);
      }

      const payload = JSON.parse(new TextDecoder().decode(response.Payload));
      const mcpResponse: MCPResponse = payload;

      const responseTime = Date.now() - startTime;
      logMCPCall(method, params || {}, responseTime, !mcpResponse.error);

      if (mcpResponse.error) {
        throw new MCPError(`MCP Error: ${mcpResponse.error.message}`);
      }

      return mcpResponse.result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logMCPCall(method, params || {}, responseTime, false);
      
      logger.error('Lambda MCP call failed:', error);
      throw new MCPError('Failed to invoke pricing Lambda function', error as Error);
    }
  }

  async listTools(): Promise<any[]> {
    const result = await this.invokeLambda('tools/list');
    return result.tools || [];
  }

  async getPricing(params: {
    service: string;
    region?: string;
    filters?: Record<string, any>;
  }): Promise<any> {
    return this.invokeLambda('tools/call', {
      name: 'get_pricing',
      arguments: {
        service_code: params.service,
        region: params.region,
        filters: params.filters
      }
    });
  }

  async getServiceCodes(): Promise<string[]> {
    return this.invokeLambda('tools/call', {
      name: 'get_pricing_service_codes',
      arguments: {}
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

export const lambdaMCPService = new LambdaMCPService();
```

## CloudFormation Infrastructure

### Lambda Function
```yaml
# infrastructure/templates/lambda-mcp.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'AWS Pricing MCP Lambda Function'

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]

Resources:
  # Lambda Execution Role
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
        - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
      Policies:
        - PolicyName: PricingAPIAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - pricing:GetProducts
                  - pricing:DescribeServices
                  - pricing:GetAttributeValues
                Resource: '*'

  # Lambda Function
  PricingMCPFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub 'aws-pricing-mcp-${Environment}'
      Runtime: nodejs18.x
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Code:
        ZipFile: |
          exports.handler = async (event) => {
            return { statusCode: 200, body: 'Placeholder' };
          };
      Environment:
        Variables:
          NODE_ENV: !Ref Environment
          REDIS_ENDPOINT: !GetAtt PricingCache.RedisEndpoint.Address
      VpcConfig:
        SecurityGroupIds:
          - !Ref LambdaSecurityGroup
        SubnetIds:
          - !Ref PrivateSubnet1
          - !Ref PrivateSubnet2
      Timeout: 30
      MemorySize: 512
      ReservedConcurrencyLimit: 100

  # Provisioned Concurrency (for production)
  ProvisionedConcurrency:
    Type: AWS::Lambda::ProvisionedConcurrencyConfig
    Condition: IsProduction
    Properties:
      FunctionName: !Ref PricingMCPFunction
      ProvisionedConcurrencyCount: 5
      Qualifier: !GetAtt PricingMCPFunction.Version

  # Lambda Security Group
  LambdaSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for pricing MCP Lambda
      VpcId: !Ref VPC
      SecurityGroupEgress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0  # HTTPS to AWS APIs
        - IpProtocol: tcp
          FromPort: 6379
          ToPort: 6379
          DestinationSecurityGroupId: !Ref CacheSecurityGroup

  # ElastiCache for caching
  PricingCacheSubnetGroup:
    Type: AWS::ElastiCache::SubnetGroup
    Properties:
      Description: Subnet group for pricing cache
      SubnetIds:
        - !Ref PrivateSubnet1
        - !Ref PrivateSubnet2

  PricingCache:
    Type: AWS::ElastiCache::CacheCluster
    Properties:
      CacheNodeType: cache.t3.micro
      Engine: redis
      NumCacheNodes: 1
      CacheSubnetGroupName: !Ref PricingCacheSubnetGroup
      VpcSecurityGroupIds:
        - !Ref CacheSecurityGroup

  CacheSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for pricing cache
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 6379
          ToPort: 6379
          SourceSecurityGroupId: !Ref LambdaSecurityGroup

  # CloudWatch Log Group
  LambdaLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/aws/lambda/aws-pricing-mcp-${Environment}'
      RetentionInDays: 14

Conditions:
  IsProduction: !Equals [!Ref Environment, 'prod']

Outputs:
  LambdaFunctionArn:
    Description: ARN of the pricing MCP Lambda function
    Value: !GetAtt PricingMCPFunction.Arn
    Export:
      Name: !Sub '${AWS::StackName}-LambdaFunctionArn'

  LambdaFunctionName:
    Description: Name of the pricing MCP Lambda function
    Value: !Ref PricingMCPFunction
    Export:
      Name: !Sub '${AWS::StackName}-LambdaFunctionName'
```

## Deployment Strategy

### Lambda Package Structure
```
lambda/pricing-mcp/
├── src/
│   ├── index.ts              # Main Lambda handler
│   ├── pricing/              # Pricing logic
│   ├── cache/                # Cache utilities
│   └── utils/                # Helper functions
├── package.json              # Lambda dependencies
├── tsconfig.json             # TypeScript config
├── webpack.config.js         # Bundle configuration
└── deploy.sh                 # Deployment script
```

### Build and Deploy Script
```bash
#!/bin/bash
# lambda/pricing-mcp/deploy.sh

set -e

echo "Building Lambda function..."

# Install dependencies
npm install

# Build TypeScript
npm run build

# Create deployment package
zip -r pricing-mcp.zip dist/ node_modules/

# Deploy to AWS
aws lambda update-function-code \
  --function-name aws-pricing-mcp-${ENVIRONMENT} \
  --zip-file fileb://pricing-mcp.zip

echo "Lambda function deployed successfully!"
```

## Performance Optimization

### Cold Start Mitigation
1. **Provisioned Concurrency**: Keep 5 instances warm in production
2. **Connection Reuse**: Global variables for AWS SDK and Redis clients
3. **Minimal Dependencies**: Only include necessary packages
4. **Bundle Optimization**: Use webpack to minimize package size

### Caching Strategy
1. **Redis Cache**: 1-hour TTL for pricing data
2. **Lambda Memory Cache**: In-memory cache for frequently accessed data
3. **Smart Cache Keys**: Include all relevant parameters in cache key
4. **Cache Warming**: Pre-populate cache with common queries

### Cost Optimization
```typescript
// Estimated costs for 10,000 pricing queries/month:
// - Lambda invocations: $0.20
// - Lambda compute time: $0.83 (512MB, 2s avg)
// - ElastiCache: $15.00 (t3.micro)
// - Total: ~$16/month
```

## Monitoring and Observability

### CloudWatch Metrics
- Lambda duration and error rates
- Cache hit/miss ratios
- Pricing API call counts
- Memory and timeout metrics

### Custom Metrics
```typescript
// Add custom metrics in Lambda
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const putMetric = async (metricName: string, value: number) => {
  const cloudwatch = new CloudWatchClient({});
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'AWS/PricingMCP',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  }));
};
```

### Alerting
- Lambda error rate > 5%
- Cache hit rate < 80%
- Average duration > 5 seconds
- Pricing API throttling

## Testing Strategy

### Unit Tests
```typescript
// lambda/pricing-mcp/tests/handler.test.ts
import { handler } from '../src/index';

describe('Lambda Handler', () => {
  it('should handle get_pricing request', async () => {
    const event = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_pricing',
        arguments: {
          service_code: 'AmazonEC2',
          region: 'us-west-2'
        }
      }
    };

    const result = await handler(event, {} as any);
    
    expect(result.jsonrpc).toBe('2.0');
    expect(result.id).toBe(1);
    expect(result.result).toBeDefined();
  });
});
```

### Integration Tests
- Test against real AWS Pricing API
- Validate cache behavior
- Test error scenarios and timeouts

## Migration Timeline

### Sprint 6: Lambda Implementation
- Week 1: Build Lambda function and infrastructure
- Week 2: Deploy and test Lambda integration
- Week 3: Update backend to use Lambda MCP service

### Sprint 7: Optimization
- Performance tuning and caching
- Monitoring and alerting setup
- Load testing and optimization

This Lambda approach gives us the best of both worlds: the familiar MCP interface for development with the scalability and cost-effectiveness of serverless for production!

---
*Last Updated: 2025-08-07*
