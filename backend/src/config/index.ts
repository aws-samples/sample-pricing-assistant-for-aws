import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // AWS Configuration
  AWS_REGION: z.string().default('us-west-2'),
  AWS_PROFILE: z.string().optional(),

  // Bedrock Configuration
  BEDROCK_MODEL_ID: z.string().default('us.anthropic.claude-sonnet-4-20250514-v1:0'),
  BEDROCK_GUARDRAIL_ID: z.string().optional(),
  BEDROCK_GUARDRAIL_VERSION: z.string().default('1'),

  // MCP Server Configuration
  MCP_SERVER_URL: z.string().default('http://localhost:3000'),
  MCP_SERVER_TIMEOUT: z.string().default('30000').transform(Number),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // File Upload
  MAX_FILE_SIZE: z.string().default('10485760').transform(Number), // 10MB
  UPLOAD_DIR: z.string().default('./uploads'),

  // Auth (Cognito)
  AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
  COGNITO_USER_POOL_ID: z.string().default(''),
  COGNITO_CLIENT_ID: z.string().default(''),
  COGNITO_REGION: z.string().default(''),
  COGNITO_ADMIN_GROUP: z.string().default('Admins'),

  // Passkey nicknames table — used by /api/me/passkeys to store
  // user-friendly names alongside Cognito's WebAuthn credentials.
  // Empty when not deployed yet; routes degrade gracefully.
  PASSKEY_NICKNAMES_TABLE: z.string().default(''),
});

// Validate and export configuration
export const config = envSchema.parse(process.env);

// Type-safe configuration object
export type Config = z.infer<typeof envSchema>;

// Export individual config sections for convenience
export const serverConfig = {
  port: config.PORT,
  nodeEnv: config.NODE_ENV,
  corsOrigin: config.CORS_ORIGIN,
};

export const awsConfig = {
  region: config.AWS_REGION,
  profile: config.AWS_PROFILE,
};

export const bedrockConfig = {
  modelId: config.BEDROCK_MODEL_ID,
  guardrailId: config.BEDROCK_GUARDRAIL_ID,
  guardrailVersion: config.BEDROCK_GUARDRAIL_VERSION,
};

export const mcpConfig = {
  serverUrl: config.MCP_SERVER_URL,
  timeout: config.MCP_SERVER_TIMEOUT,
  retryAttempts: 3,
  retryDelay: 1000,
};

export const fileConfig = {
  maxFileSize: config.MAX_FILE_SIZE,
  uploadDir: config.UPLOAD_DIR,
  allowedTypes: [
    'application/json',           // CloudFormation JSON
    'text/yaml',                  // CloudFormation YAML
    'application/x-yaml',         // CloudFormation YAML
    'text/x-yaml',               // CloudFormation YAML
    'application/octet-stream',   // Terraform .tf files
    'text/plain',                // Various text files
    'application/typescript',     // CDK TypeScript
    'text/typescript',           // CDK TypeScript
    'application/javascript',     // CDK JavaScript
    'text/javascript',           // CDK JavaScript
    'text/x-python',             // Pulumi Python
    'application/x-python-code', // Pulumi Python
  ],
  allowedExtensions: [
    '.json', '.yaml', '.yml',     // CloudFormation
    '.tf', '.tfvars',             // Terraform
    '.ts', '.js',                 // CDK
    '.py',                        // Pulumi Python
    '.go',                        // Pulumi Go
    '.cs',                        // Pulumi C#
  ],
};

export const logConfig = {
  level: config.LOG_LEVEL,
  format: config.NODE_ENV === 'production' ? 'json' : 'simple',
};

export const authConfig = {
  enabled: config.AUTH_ENABLED === 'true',
  userPoolId: config.COGNITO_USER_POOL_ID,
  clientId: config.COGNITO_CLIENT_ID,
  region: config.COGNITO_REGION || config.AWS_REGION,
  adminGroup: config.COGNITO_ADMIN_GROUP,
};

export const passkeyNicknamesConfig = {
  tableName: config.PASSKEY_NICKNAMES_TABLE,
};
