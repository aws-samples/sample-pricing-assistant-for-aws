# AWS Pricing Integration Architecture

This document outlines how the AWS Pricing integration will work in production AWS deployment.

## Integration Evolution

### Local Development
```
Frontend → Backend → MCP Server (localhost:3000) → AWS Pricing API
```

### AWS Production (Recommended)
```
Frontend → Backend → AWS Pricing Client (SDK) → AWS Pricing API
```

## Production Architecture

### Direct AWS SDK Integration

**Implementation:**
```typescript
// backend/src/services/awsPricingService.ts
import { 
  PricingClient, 
  GetProductsCommand, 
  DescribeServicesCommand,
  GetAttributeValuesCommand 
} from '@aws-sdk/client-pricing';

export class AWSPricingService {
  private pricing: PricingClient;
  private cache: Map<string, any> = new Map();
  private cacheTimeout = 3600000; // 1 hour

  constructor() {
    this.pricing = new PricingClient({ 
      region: 'us-east-1', // Pricing API only available in us-east-1
      maxAttempts: 3,
      retryMode: 'adaptive'
    });
  }

  async getServiceCodes(): Promise<string[]> {
    const cacheKey = 'service-codes';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const command = new DescribeServicesCommand({});
    const response = await this.pricing.send(command);
    
    const serviceCodes = response.Services?.map(s => s.ServiceCode).filter(Boolean) || [];
    this.setCache(cacheKey, serviceCodes);
    
    return serviceCodes;
  }

  async getPricing(params: {
    serviceCode: string;
    region?: string;
    filters?: PricingFilter[];
  }): Promise<PricingData> {
    const cacheKey = `pricing-${JSON.stringify(params)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const command = new GetProductsCommand({
      ServiceCode: params.serviceCode,
      Filters: this.buildFilters(params.filters, params.region),
      MaxResults: 100
    });

    const response = await this.pricing.send(command);
    const pricingData = this.processPricingResponse(response);
    
    this.setCache(cacheKey, pricingData);
    return pricingData;
  }

  private buildFilters(filters?: PricingFilter[], region?: string): any[] {
    const awsFilters = [];

    // Add region filter if specified
    if (region) {
      awsFilters.push({
        Type: 'TERM_MATCH',
        Field: 'location',
        Value: this.regionToLocation(region)
      });
    }

    // Convert custom filters to AWS format
    if (filters) {
      filters.forEach(filter => {
        awsFilters.push({
          Type: filter.type || 'TERM_MATCH',
          Field: filter.field,
          Value: filter.value
        });
      });
    }

    return awsFilters;
  }

  private processPricingResponse(response: any): PricingData {
    const products = response.PriceList?.map((item: string) => JSON.parse(item)) || [];
    
    return {
      products: products.map(product => ({
        sku: product.product.sku,
        productFamily: product.product.productFamily,
        attributes: product.product.attributes,
        pricing: this.extractPricingTerms(product.terms)
      })),
      totalResults: products.length,
      timestamp: new Date().toISOString()
    };
  }

  private extractPricingTerms(terms: any): PricingTerms {
    const onDemand = terms?.OnDemand || {};
    const reserved = terms?.Reserved || {};

    return {
      onDemand: this.processOnDemandPricing(onDemand),
      reserved: this.processReservedPricing(reserved)
    };
  }

  private regionToLocation(region: string): string {
    const regionMap: Record<string, string> = {
      'us-east-1': 'US East (N. Virginia)',
      'us-west-2': 'US West (Oregon)',
      'eu-west-1': 'Europe (Ireland)',
      // Add more mappings as needed
    };
    return regionMap[region] || region;
  }

  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

### CloudFormation Template

```yaml
# infrastructure/templates/pricing-service.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'AWS Pricing Service Integration'

Resources:
  # IAM Role for Backend Service
  BackendServiceRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: 
                - lambda.amazonaws.com
                - ecs-tasks.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
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

  # ElastiCache for pricing data caching
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
      Tags:
        - Key: Name
          Value: aws-pricing-assistant-cache

  CacheSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for pricing cache
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 6379
          ToPort: 6379
          SourceSecurityGroupId: !Ref BackendSecurityGroup

Outputs:
  PricingCacheEndpoint:
    Description: Redis cache endpoint for pricing data
    Value: !GetAtt PricingCache.RedisEndpoint.Address
    Export:
      Name: !Sub '${AWS::StackName}-PricingCacheEndpoint'
```

## Caching Strategy

### Multi-Level Caching

1. **In-Memory Cache** (Application Level)
   - Cache frequently requested pricing data
   - TTL: 1 hour
   - Size limit: 100MB

2. **Redis Cache** (Distributed)
   - Share cache across multiple backend instances
   - TTL: 4 hours
   - Persistent across deployments

3. **CloudFront Cache** (CDN Level)
   - Cache static pricing responses
   - TTL: 1 hour
   - Reduce API Gateway costs

### Cache Implementation

```typescript
// backend/src/services/cacheService.ts
import { createClient } from 'redis';

export class CacheService {
  private redis = createClient({
    url: `redis://${process.env.REDIS_ENDPOINT}:6379`
  });
  private memoryCache = new Map<string, any>();

  async get(key: string): Promise<any> {
    // Try memory cache first
    const memoryResult = this.memoryCache.get(key);
    if (memoryResult && !this.isExpired(memoryResult)) {
      return memoryResult.data;
    }

    // Try Redis cache
    const redisResult = await this.redis.get(key);
    if (redisResult) {
      const parsed = JSON.parse(redisResult);
      // Update memory cache
      this.memoryCache.set(key, {
        data: parsed,
        timestamp: Date.now()
      });
      return parsed;
    }

    return null;
  }

  async set(key: string, data: any, ttl: number = 3600): Promise<void> {
    // Set in memory cache
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Set in Redis with TTL
    await this.redis.setEx(key, ttl, JSON.stringify(data));
  }
}
```

## Migration Strategy

### Phase 1: Dual Mode (Sprint 6)
- Keep MCP server for development
- Add direct AWS SDK integration for production
- Use feature flag to switch between modes

```typescript
// backend/src/services/pricingServiceFactory.ts
export function createPricingService(): PricingServiceInterface {
  if (process.env.NODE_ENV === 'production') {
    return new AWSPricingService();
  } else {
    return new MCPPricingService(); // Current MCP implementation
  }
}
```

### Phase 2: Production Optimization (Sprint 7)
- Add Redis caching
- Implement request batching
- Add pricing data preprocessing

### Phase 3: Advanced Features (Future)
- Cost optimization recommendations
- Historical pricing trends
- Budget alerts and forecasting

## Performance Considerations

### Request Optimization
- **Batch Requests**: Combine multiple pricing queries
- **Parallel Processing**: Query multiple services simultaneously
- **Smart Filtering**: Reduce API response size with targeted filters

### Cost Optimization
- **Request Caching**: Reduce AWS Pricing API calls (charged per request)
- **Response Compression**: Reduce data transfer costs
- **Regional Optimization**: Use closest AWS region for API calls

### Monitoring
- **API Metrics**: Track pricing API usage and costs
- **Cache Hit Rates**: Monitor cache effectiveness
- **Response Times**: Track pricing query performance

## Error Handling

### Retry Strategy
```typescript
const retryConfig = {
  maxAttempts: 3,
  retryDelayOptions: {
    base: 300,
    customBackoff: (attempt: number) => Math.pow(2, attempt) * 100
  }
};
```

### Fallback Mechanisms
1. **Cached Data**: Return stale data if API fails
2. **Estimated Pricing**: Use historical averages
3. **Graceful Degradation**: Show pricing unavailable message

## Security Considerations

### IAM Permissions
- Minimal permissions (only pricing API access)
- Resource-based policies where possible
- Regular permission audits

### Data Protection
- No sensitive data in pricing responses
- Encrypt cache data at rest
- Use VPC endpoints for AWS API calls

## Cost Analysis

### Direct Integration Costs
- **AWS Pricing API**: ~$0.0001 per request
- **ElastiCache**: ~$15/month (t3.micro)
- **Data Transfer**: Minimal (same region)

### Compared to MCP Server on ECS
- **ECS Fargate**: ~$30/month (0.25 vCPU, 0.5GB)
- **Load Balancer**: ~$20/month
- **Total Savings**: ~$35/month with direct integration

## Testing Strategy

### Unit Tests
```typescript
describe('AWSPricingService', () => {
  it('should fetch EC2 pricing', async () => {
    const service = new AWSPricingService();
    const pricing = await service.getPricing({
      serviceCode: 'AmazonEC2',
      region: 'us-west-2',
      filters: [{ field: 'instanceType', value: 't3.micro' }]
    });
    
    expect(pricing.products).toBeDefined();
    expect(pricing.products.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests
- Test against real AWS Pricing API
- Validate cache behavior
- Test error scenarios and fallbacks

---
*Last Updated: 2025-08-07*
