import { z } from 'zod';

// Common validation schemas
export const uuidSchema = z.string().uuid();
export const timestampSchema = z.string().datetime();

// Chat API schemas
export const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional().nullable(),
  context: z.record(z.any()).optional(),
  modelId: z.string().optional(),
  fileId: z.string().uuid().optional(), // Keep for backward compatibility
  fileIds: z.array(z.string().uuid()).optional(), // New field for multiple files
});

export const chatResponseSchema = z.object({
  response: z.string(),
  conversationId: z.string().uuid(),
  pricing: z.record(z.any()).optional(),
  timestamp: timestampSchema,
  metadata: z.object({
    model: z.string(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    latency: z.number().optional(),
    toolsUsed: z.array(z.string()).optional(),
    pricingContext: z.object({
      servicesDetected: z.array(z.string()).optional(),
      regionsDetected: z.array(z.string()).optional(),
      hasPricingData: z.boolean(),
      pricingDataCount: z.number(),
    }).optional(),
  }).optional(),
});

// File upload schemas
export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.enum([
    'cloudformation-json',
    'cloudformation-yaml',
    'terraform',
    'cdk-typescript',
    'cdk-javascript',
    'pulumi-python',
    'pulumi-typescript',
    'pulumi-go',
    'pulumi-csharp',
  ]),
  content: z.string().optional(), // For text files
});

export const fileAnalysisResponseSchema = z.object({
  fileId: z.string().uuid(),
  filename: z.string(),
  fileType: z.string(),
  resources: z.array(z.object({
    type: z.string(),
    name: z.string(),
    properties: z.record(z.any()),
    estimatedCost: z.object({
      monthly: z.number(),
      currency: z.string().default('USD'),
      breakdown: z.record(z.number()).optional(),
    }),
  })),
  totalCost: z.object({
    monthly: z.number(),
    currency: z.string().default('USD'),
    breakdown: z.record(z.number()),
  }),
  recommendations: z.array(z.string()).optional(),
  timestamp: timestampSchema,
});

// Pricing API schemas
export const pricingQuerySchema = z.object({
  service: z.string().min(1),
  region: z.string().optional(),
  filters: z.record(z.any()).optional(),
  includeRecommendations: z.boolean().default(false),
});

export const pricingResponseSchema = z.object({
  service: z.string(),
  region: z.string().optional(),
  pricing: z.object({
    onDemand: z.record(z.any()).optional(),
    reserved: z.record(z.any()).optional(),
    spot: z.record(z.any()).optional(),
  }),
  recommendations: z.array(z.string()).optional(),
  lastUpdated: timestampSchema,
});

// Health check schema
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: timestampSchema,
  services: z.record(z.enum(['healthy', 'unhealthy', 'unknown'])),
  version: z.string().optional(),
  uptime: z.number().optional(),
});

// MCP request/response schemas
export const mcpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.any().optional(),
});

export const mcpResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
});

// AWS resource schemas for file parsing
export const awsResourceSchema = z.object({
  type: z.string(),
  name: z.string(),
  properties: z.record(z.any()),
  dependencies: z.array(z.string()).optional(),
  tags: z.record(z.string()).optional(),
});

export const infrastructureFileSchema = z.object({
  format: z.enum(['cloudformation', 'terraform', 'cdk', 'pulumi']),
  version: z.string().optional(),
  resources: z.array(awsResourceSchema),
  parameters: z.record(z.any()).optional(),
  outputs: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

// Error response schema
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    timestamp: timestampSchema,
    requestId: z.string().optional(),
  }),
});

// Type exports for TypeScript
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type FileUpload = z.infer<typeof fileUploadSchema>;
export type FileAnalysisResponse = z.infer<typeof fileAnalysisResponseSchema>;
export type PricingQuery = z.infer<typeof pricingQuerySchema>;
export type PricingResponse = z.infer<typeof pricingResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type MCPRequest = z.infer<typeof mcpRequestSchema>;
export type MCPResponse = z.infer<typeof mcpResponseSchema>;
export type AWSResource = z.infer<typeof awsResourceSchema>;
export type InfrastructureFile = z.infer<typeof infrastructureFileSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Validation middleware factory
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: any, _res: any, next: any) => {
    try {
      req.validatedData = schema.parse(req.body);
      next();
    } catch (error) {
      next(error); // Will be handled by error middleware
    }
  };
};

// Validation helper functions
export const validateChatRequest = (data: unknown): ChatRequest => {
  return chatRequestSchema.parse(data);
};

export const validatePricingQuery = (data: unknown): PricingQuery => {
  return pricingQuerySchema.parse(data);
};

export const validateFileUpload = (data: unknown): FileUpload => {
  return fileUploadSchema.parse(data);
};

// File type detection helpers
export const detectFileType = (filename: string, _mimeType?: string): string => {
  const extension = filename.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'json':
      return 'cloudformation-json';
    case 'yaml':
    case 'yml':
      return 'cloudformation-yaml';
    case 'tf':
    case 'tfvars':
      return 'terraform';
    case 'ts':
      return 'cdk-typescript';
    case 'js':
      return 'cdk-javascript';
    case 'py':
      return 'pulumi-python';
    case 'go':
      return 'pulumi-go';
    case 'cs':
      return 'pulumi-csharp';
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
};

export const isValidFileType = (filename: string): boolean => {
  try {
    detectFileType(filename);
    return true;
  } catch {
    return false;
  }
};
