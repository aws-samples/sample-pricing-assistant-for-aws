# System Architecture Overview

This document describes the high-level architecture of the AWS Pricing Assistant Chatbot.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                          │
├─────────────────────────────────────────────────────────────────┤
│  React Frontend (Port 5173)                                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Chat UI       │ │  File Upload    │ │  Cost Display   │   │
│  │   Component     │ │   Component     │ │   Component     │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              HTTP Client (Axios)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ HTTPS/REST API
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API Server                          │
├─────────────────────────────────────────────────────────────────┤
│  Express.js Backend (Port 3001)                                │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │     Chat        │ │   File Parser   │ │    Pricing      │   │
│  │   Controller    │ │   Controller    │ │   Controller    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                           │                       │             │
│                           ▼                       ▼             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Bedrock       │ │   File Parser   │ │      MCP        │   │
│  │   Service       │ │    Service      │ │    Service      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                │                                   │
                ▼ AWS SDK                          ▼ HTTP
┌─────────────────────────┐           ┌─────────────────────────┐
│     AWS Bedrock         │           │   AWS Pricing MCP       │
│                         │           │       Server            │
│ ┌─────────────────────┐ │           │                         │
│ │  Claude Sonnet 4    │ │           │ ┌─────────────────────┐ │
│ │     Model           │ │           │ │   AWS Pricing API   │ │
│ └─────────────────────┘ │           │ │    Integration      │ │
│                         │           │ └─────────────────────┘ │
│ ┌─────────────────────┐ │           └─────────────────────────┘
│ │   Guardrails        │ │
│ │   (Pricing Focus)   │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

## Component Overview

### Frontend Layer (React + TypeScript)

**Technology Stack:**
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling (dark theme)
- Axios for HTTP requests

**Key Components:**
- **Chat Interface**: Real-time messaging UI with dark theme
- **File Upload**: Drag-and-drop interface for infrastructure files
- **Cost Display**: Rich visualization of pricing estimates
- **State Management**: React Context + useReducer pattern

**Responsibilities:**
- User interaction and experience
- File upload and validation
- Real-time chat interface
- Cost visualization and reporting

### Backend Layer (Node.js + Express)

**Technology Stack:**
- Node.js 18+ with TypeScript
- Express.js web framework
- AWS SDK v3
- Zod for validation
- Winston for logging

**Key Services:**
- **Chat Controller**: Handles chat messages and conversation flow
- **File Parser Controller**: Processes uploaded infrastructure files
- **Pricing Controller**: Manages pricing queries and estimates
- **Bedrock Service**: Interfaces with AWS Bedrock API
- **MCP Service**: Communicates with AWS Pricing MCP Server

**Responsibilities:**
- API endpoint management
- Business logic processing
- AWS service integration
- File parsing and analysis
- Error handling and logging

### External Services

#### AWS Bedrock
- **Model**: Claude Sonnet 4 (anthropic.claude-3-5-sonnet-20241022-v2:0)
- **API**: Bedrock Converse API
- **Guardrails**: Custom guardrails to limit responses to AWS pricing topics
- **Region**: us-west-2 (configurable)

#### AWS Pricing MCP Server
- **Purpose**: Provides access to real-time AWS pricing data
- **Protocol**: Model Context Protocol (MCP)
- **API**: RESTful interface over HTTP
- **Data Source**: AWS Pricing API

## Data Flow

### Chat Message Flow
1. User types message in React frontend
2. Frontend sends POST request to `/api/chat`
3. Backend validates and processes message
4. Backend calls Bedrock Converse API with guardrails
5. If pricing data needed, backend queries MCP server
6. Backend combines AI response with pricing data
7. Response sent back to frontend
8. Frontend displays response in chat interface

### File Upload Flow
1. User uploads infrastructure file (CF/Terraform/CDK/Pulumi)
2. Frontend validates file type and size
3. File sent to `/api/files/upload` endpoint
4. Backend parses file to extract AWS resources
5. Backend queries MCP server for pricing of each resource
6. Backend calculates total cost estimate
7. Cost breakdown returned to frontend
8. Frontend displays detailed cost analysis

### Pricing Query Flow
1. User asks pricing question or uploads file
2. Backend identifies required pricing data
3. Backend calls MCP server with specific parameters
4. MCP server queries AWS Pricing API
5. Pricing data returned and processed
6. Backend formats data for user consumption
7. Response includes pricing details and recommendations

## Security Architecture

### Authentication & Authorization
- **Development**: No authentication (local development only)
- **Production**: AWS IAM roles and policies
- **API Security**: CORS, Helmet, rate limiting

### Data Protection
- **Input Validation**: Zod schemas for all inputs
- **File Upload Security**: Type validation, size limits, virus scanning
- **Bedrock Guardrails**: Restrict AI responses to AWS pricing topics
- **Logging**: Structured logging with sensitive data redaction

### AWS Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:GetFoundationModel",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    },
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

## Error Handling Strategy

### Frontend Error Handling
- **Network Errors**: Retry logic with exponential backoff
- **Validation Errors**: Real-time form validation
- **User Feedback**: Toast notifications and error states
- **Fallback UI**: Graceful degradation for failed components

### Backend Error Handling
- **Structured Errors**: Consistent error response format
- **Logging**: Comprehensive error logging with context
- **Circuit Breaker**: Prevent cascade failures to external services
- **Graceful Degradation**: Fallback responses when services unavailable

### Error Response Format
```json
{
  "error": {
    "code": "PRICING_SERVICE_UNAVAILABLE",
    "message": "Unable to fetch pricing data at this time",
    "details": {
      "service": "mcp",
      "timestamp": "2025-08-07T23:00:00.000Z"
    }
  }
}
```

## Performance Considerations

### Frontend Optimization
- **Code Splitting**: Lazy loading of components
- **Caching**: HTTP response caching
- **Debouncing**: Input debouncing for search/typing
- **Virtual Scrolling**: For large chat histories

### Backend Optimization
- **Response Caching**: Cache pricing data for common queries
- **Connection Pooling**: Efficient AWS SDK connection management
- **Request Batching**: Batch multiple pricing queries
- **Compression**: Gzip compression for API responses

### Monitoring & Observability
- **Health Checks**: `/health` endpoint for service monitoring
- **Metrics**: Response times, error rates, usage patterns
- **Logging**: Structured JSON logging with correlation IDs
- **Alerting**: Automated alerts for service degradation

## Deployment Architecture

### Local Development
- Frontend: Vite dev server (port 5173)
- Backend: Node.js with hot reload (port 3001)
- MCP Server: Standalone process (port 3000)

### AWS Production (Future)
- **Compute**: AWS Lambda or ECS Fargate
- **API Gateway**: AWS API Gateway for REST endpoints
- **CDN**: CloudFront for frontend assets
- **Monitoring**: CloudWatch for logs and metrics
- **Deployment**: CloudFormation + CodePipeline

## API Contracts

### Chat API
```typescript
POST /api/chat
{
  "message": string,
  "conversationId"?: string,
  "context"?: object
}

Response:
{
  "response": string,
  "conversationId": string,
  "pricing"?: object,
  "timestamp": string
}
```

### File Upload API
```typescript
POST /api/files/upload
Content-Type: multipart/form-data

Response:
{
  "fileId": string,
  "resources": Array<{
    "type": string,
    "name": string,
    "estimatedCost": number
  }>,
  "totalCost": number,
  "breakdown": object
}
```

### Pricing API
```typescript
GET /api/pricing/services
Response: Array<string>

POST /api/pricing/query
{
  "service": string,
  "region"?: string,
  "filters"?: object
}

Response:
{
  "pricing": object,
  "recommendations"?: Array<string>
}
```

## Technology Decisions

### Why React + TypeScript?
- Strong typing for better developer experience
- Large ecosystem and community support
- Excellent tooling and debugging capabilities
- Component-based architecture for reusability

### Why Express.js?
- Lightweight and flexible
- Excellent middleware ecosystem
- Easy integration with AWS SDK
- Strong TypeScript support

### Why AWS Bedrock?
- Managed AI service with enterprise features
- Built-in guardrails for content filtering
- Claude Sonnet 4 provides excellent reasoning capabilities
- Seamless AWS integration

### Why MCP Server?
- Standardized protocol for AI tool integration
- Real-time pricing data access
- Maintained by AWS Labs
- Extensible for future pricing features

## Future Considerations

### Scalability
- Horizontal scaling with load balancers
- Database integration for conversation history
- Caching layer (Redis) for pricing data
- CDN for global content delivery

### Features
- User authentication and personalization
- Conversation history persistence
- Advanced cost optimization recommendations
- Integration with AWS Cost Explorer
- Multi-region pricing comparisons

### Monitoring
- Application Performance Monitoring (APM)
- Real User Monitoring (RUM)
- Business metrics and analytics
- Cost optimization tracking

---
*Last Updated: 2025-08-07*
