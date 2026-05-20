# API Documentation

This document describes the REST API endpoints for the AWS Pricing Assistant Chatbot backend.

## Base URL

**Development:** `http://localhost:3001`  
**Production:** `https://your-domain.com` (TBD)

## Authentication

**Development:** No authentication required  
**Production:** AWS IAM-based authentication (TBD)

## Common Headers

```http
Content-Type: application/json
Accept: application/json
X-Request-ID: <optional-uuid>
```

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "timestamp": "2025-08-07T23:00:00.000Z",
    "requestId": "uuid"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400): Invalid request data
- `NOT_FOUND` (404): Resource not found
- `RATE_LIMIT_ERROR` (429): Too many requests
- `BEDROCK_ERROR` (502): AWS Bedrock service error
- `MCP_ERROR` (502): MCP server error
- `FILE_PROCESSING_ERROR` (422): File parsing error
- `INTERNAL_ERROR` (500): Unexpected server error

## Endpoints

### Health Check

Check the health status of the API and its dependencies.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-08-07T23:00:00.000Z",
  "services": {
    "mcp": "healthy",
    "bedrock": "healthy"
  },
  "version": "1.0.0",
  "uptime": 3600
}
```

**Status Codes:**
- `200`: Service is healthy
- `503`: Service is degraded or unhealthy

---

### Chat API

#### Send Chat Message

Send a message to the AI chatbot and receive a response with optional pricing information.

```http
POST /api/chat
```

**Request Body:**
```json
{
  "message": "What is the cost of running a t3.micro EC2 instance?",
  "conversationId": "uuid-optional",
  "context": {
    "region": "us-west-2",
    "previousQuestions": []
  }
}
```

**Response:**
```json
{
  "response": "An EC2 t3.micro instance in us-west-2 costs approximately $0.0104 per hour...",
  "conversationId": "uuid",
  "pricing": {
    "service": "AmazonEC2",
    "instanceType": "t3.micro",
    "region": "us-west-2",
    "onDemand": {
      "hourly": 0.0104,
      "monthly": 7.59,
      "currency": "USD"
    }
  },
  "timestamp": "2025-08-07T23:00:00.000Z",
  "metadata": {
    "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "inputTokens": 150,
    "outputTokens": 300,
    "latency": 1250
  }
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid request data
- `502`: Bedrock or MCP service error

---

### File Upload API

#### Upload Infrastructure File

Upload and analyze CloudFormation, Terraform, CDK, or Pulumi files for cost estimation.

```http
POST /api/files/upload
Content-Type: multipart/form-data
```

**Request:**
```
file: <infrastructure-file>
```

**Response:**
```json
{
  "fileId": "uuid",
  "filename": "infrastructure.yaml",
  "fileType": "cloudformation-yaml",
  "resources": [
    {
      "type": "AWS::EC2::Instance",
      "name": "WebServer",
      "properties": {
        "InstanceType": "t3.micro",
        "ImageId": "ami-12345678"
      },
      "estimatedCost": {
        "monthly": 7.59,
        "currency": "USD",
        "breakdown": {
          "compute": 7.59,
          "storage": 0.80
        }
      }
    }
  ],
  "totalCost": {
    "monthly": 8.39,
    "currency": "USD",
    "breakdown": {
      "compute": 7.59,
      "storage": 0.80
    }
  },
  "recommendations": [
    "Consider using t3.nano for development workloads to reduce costs",
    "Enable detailed monitoring for better cost optimization"
  ],
  "timestamp": "2025-08-07T23:00:00.000Z"
}
```

**Supported File Types:**
- CloudFormation: `.json`, `.yaml`, `.yml`
- Terraform: `.tf`, `.tfvars`
- CDK: `.ts`, `.js`
- Pulumi: `.py`, `.ts`, `.go`, `.cs`

**File Size Limit:** 10MB

**Status Codes:**
- `200`: File processed successfully
- `400`: Invalid file or request
- `413`: File too large
- `422`: File processing error

#### Get File Analysis

Retrieve the analysis results for a previously uploaded file.

```http
GET /api/files/{fileId}
```

**Response:** Same as upload response

**Status Codes:**
- `200`: Success
- `404`: File not found

---

### Pricing API

#### List Available Services

Get a list of AWS services available for pricing queries.

```http
GET /api/pricing/services
```

**Response:**
```json
{
  "services": [
    "AmazonEC2",
    "AmazonS3",
    "AWSLambda",
    "AmazonRDS",
    "AmazonDynamoDB"
  ],
  "timestamp": "2025-08-07T23:00:00.000Z"
}
```

#### Query Service Pricing

Get pricing information for a specific AWS service.

```http
POST /api/pricing/query
```

**Request Body:**
```json
{
  "service": "AmazonEC2",
  "region": "us-west-2",
  "filters": {
    "instanceType": "t3.micro",
    "operatingSystem": "Linux",
    "tenancy": "Shared"
  },
  "includeRecommendations": true
}
```

**Response:**
```json
{
  "service": "AmazonEC2",
  "region": "us-west-2",
  "pricing": {
    "onDemand": {
      "hourly": 0.0104,
      "monthly": 7.59,
      "currency": "USD",
      "unit": "per hour"
    },
    "reserved": {
      "1year": {
        "noUpfront": 0.0063,
        "partialUpfront": 0.0061,
        "allUpfront": 0.0059
      },
      "3year": {
        "noUpfront": 0.0042,
        "partialUpfront": 0.0041,
        "allUpfront": 0.0040
      }
    }
  },
  "recommendations": [
    "Consider Reserved Instances for 40% savings on consistent workloads",
    "Use Spot Instances for fault-tolerant workloads to save up to 90%"
  ],
  "lastUpdated": "2025-08-07T23:00:00.000Z"
}
```

#### Get Service Attributes

Get available filter attributes for a specific service.

```http
GET /api/pricing/services/{serviceCode}/attributes
```

**Response:**
```json
{
  "service": "AmazonEC2",
  "attributes": [
    "instanceType",
    "operatingSystem",
    "tenancy",
    "location",
    "preInstalledSw"
  ],
  "timestamp": "2025-08-07T23:00:00.000Z"
}
```

#### Get Attribute Values

Get possible values for specific service attributes.

```http
POST /api/pricing/services/{serviceCode}/attribute-values
```

**Request Body:**
```json
{
  "attributes": ["instanceType", "operatingSystem"]
}
```

**Response:**
```json
{
  "service": "AmazonEC2",
  "attributeValues": {
    "instanceType": [
      "t3.nano",
      "t3.micro",
      "t3.small",
      "t3.medium"
    ],
    "operatingSystem": [
      "Linux",
      "Windows",
      "RHEL",
      "SUSE"
    ]
  },
  "timestamp": "2025-08-07T23:00:00.000Z"
}
```

---

### Conversation API

#### Get Conversation History

Retrieve the history of a conversation.

```http
GET /api/conversations/{conversationId}
```

**Response:**
```json
{
  "conversationId": "uuid",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What is the cost of EC2?",
      "timestamp": "2025-08-07T22:58:00.000Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "EC2 pricing varies by instance type...",
      "timestamp": "2025-08-07T22:58:05.000Z",
      "pricing": {}
    }
  ],
  "createdAt": "2025-08-07T22:58:00.000Z",
  "updatedAt": "2025-08-07T22:58:05.000Z"
}
```

#### Delete Conversation

Delete a conversation and its history.

```http
DELETE /api/conversations/{conversationId}
```

**Status Codes:**
- `204`: Conversation deleted
- `404`: Conversation not found

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Chat API**: 60 requests per minute per IP
- **File Upload**: 10 requests per minute per IP
- **Pricing API**: 100 requests per minute per IP

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1691452800
```

## Pagination

Endpoints that return lists support pagination:

```http
GET /api/endpoint?page=1&limit=20&sort=createdAt&order=desc
```

**Response:**
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## WebSocket API (Future)

Real-time chat functionality will be available via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.send(JSON.stringify({
  type: 'chat',
  message: 'Hello',
  conversationId: 'uuid'
}));

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log(response);
};
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Send chat message
const response = await client.post('/api/chat', {
  message: 'What is the cost of S3 storage?',
});

// Upload file
const formData = new FormData();
formData.append('file', file);

const uploadResponse = await client.post('/api/files/upload', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});
```

### Python

```python
import requests

base_url = 'http://localhost:3001'

# Send chat message
response = requests.post(f'{base_url}/api/chat', json={
    'message': 'What is the cost of Lambda functions?'
})

# Upload file
with open('infrastructure.yaml', 'rb') as f:
    files = {'file': f}
    upload_response = requests.post(f'{base_url}/api/files/upload', files=files)
```

### cURL

```bash
# Send chat message
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the cost of RDS?"}'

# Upload file
curl -X POST http://localhost:3001/api/files/upload \
  -F "file=@infrastructure.yaml"

# Query pricing
curl -X POST http://localhost:3001/api/pricing/query \
  -H "Content-Type: application/json" \
  -d '{
    "service": "AmazonS3",
    "region": "us-west-2",
    "filters": {
      "storageClass": "Standard"
    }
  }'
```

## Testing

Use the provided test scripts to validate API functionality:

```bash
# Run API tests
npm run test:api

# Test specific endpoint
npm run test:api -- --grep "chat"
```

---
*Last Updated: 2025-08-07*
