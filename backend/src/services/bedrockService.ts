import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
  ConverseCommandOutput,
  Message,
  ContentBlock,
  GuardrailConfiguration,
} from '@aws-sdk/client-bedrock-runtime';
import { bedrockConfig, awsConfig } from '@/config/index.js';
import { logger, logBedrockCall } from '@/utils/logger.js';
import { BedrockError } from '@/utils/errors.js';

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;
  metadata?: {
    model: string;
    latency: number;
  };
}

export class BedrockService {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private guardrailConfig?: GuardrailConfiguration;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: awsConfig.region,
      maxAttempts: 3,
      retryMode: 'adaptive',
    });

    this.modelId = bedrockConfig.modelId;

    // Configure guardrails if provided
    if (bedrockConfig.guardrailId) {
      this.guardrailConfig = {
        guardrailIdentifier: bedrockConfig.guardrailId,
        guardrailVersion: bedrockConfig.guardrailVersion,
      };
    }

    logger.info('BedrockService initialized', {
      modelId: this.modelId,
      region: awsConfig.region,
      guardrailsEnabled: !!this.guardrailConfig,
    });
  }

  /**
   * Send a message to Claude Sonnet 4 and get a response
   */
  async sendMessage(
    message: string,
    conversationHistory: BedrockMessage[] = [],
    systemPrompt?: string
  ): Promise<BedrockResponse> {
    const startTime = Date.now();

    try {
      // Build conversation messages
      const messages: Message[] = [
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: [{ text: msg.content }] as ContentBlock[],
        })),
        {
          role: 'user' as const,
          content: [{ text: message }] as ContentBlock[],
        },
      ];

      // Build the request
      const input: ConverseCommandInput = {
        modelId: this.modelId,
        messages,
        inferenceConfig: {
          maxTokens: 10000,
          temperature: 0.1, // Low temperature for consistent pricing responses
          topP: 0.9,
        },
        ...(systemPrompt && {
          system: [{ text: systemPrompt }],
        }),
        ...(this.guardrailConfig && {
          guardrailConfig: this.guardrailConfig,
        }),
      };

      logger.debug('Sending Bedrock request', {
        modelId: this.modelId,
        messageLength: message.length,
        historyLength: conversationHistory.length,
        hasSystemPrompt: !!systemPrompt,
        hasGuardrails: !!this.guardrailConfig,
      });

      // Send request to Bedrock
      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await this.client.send(command);

      const latency = Date.now() - startTime;

      // Extract response content
      const content = this.extractContent(response);
      const usage = response.usage;

      // Log the call
      logBedrockCall(
        this.modelId,
        usage?.inputTokens || 0,
        usage?.outputTokens || 0,
        latency
      );

      logger.info('Bedrock response received', {
        contentLength: content.length,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        latency,
        stopReason: response.stopReason,
      });

      const result: BedrockResponse = {
        content,
        metadata: {
          model: this.modelId,
          latency,
        },
      };

      if (response.stopReason) {
        result.stopReason = response.stopReason;
      }

      if (usage) {
        result.usage = {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
        };
      }

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;
      
      logger.error('Bedrock request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        latency,
        modelId: this.modelId,
      });

      // Handle specific Bedrock errors
      if (error instanceof Error) {
        if (error.name === 'ValidationException') {
          throw new BedrockError('Invalid request parameters', error);
        } else if (error.name === 'ThrottlingException') {
          throw new BedrockError('Request rate limit exceeded. Please try again in a moment.', error);
        } else if (error.name === 'ModelNotReadyException') {
          throw new BedrockError('The AI model is currently unavailable. Please try again later.', error);
        } else if (error.name === 'AccessDeniedException') {
          throw new BedrockError('Access denied to Bedrock service. Please check your AWS permissions.', error);
        } else if (error.name === 'ServiceQuotaExceededException') {
          throw new BedrockError('Service quota exceeded. Please try again later.', error);
        }
      }

      throw new BedrockError('Failed to get response from AI assistant', error as Error);
    }
  }

  /**
   * Extract text content from Bedrock response
   */
  private extractContent(response: ConverseCommandOutput): string {
    if (!response.output?.message?.content) {
      throw new BedrockError('No content in Bedrock response');
    }

    const contentBlocks = response.output.message.content;
    const textBlocks = contentBlocks
      .filter(block => block.text)
      .map(block => block.text);

    if (textBlocks.length === 0) {
      throw new BedrockError('No text content in Bedrock response');
    }

    return textBlocks.join('\n');
  }

  /**
   * Get the system prompt for AWS pricing focus
   */
  getSystemPrompt(): string {
    return `You are the AWS Pricing Assistant, a helpful AI assistant specialized in providing accurate information about AWS service pricing and cost estimation.

Your primary responsibilities:
1. Answer questions about AWS service pricing, including EC2, S3, Lambda, RDS, DynamoDB, and other AWS services
2. Provide cost estimates and comparisons between different AWS services and configurations
3. Explain pricing models (On-Demand, Reserved Instances, Spot Instances, Savings Plans)
4. Help users understand AWS billing and cost optimization strategies
5. Analyze infrastructure files (CloudFormation, Terraform, CDK, Pulumi) for cost estimation

Guidelines:
- Always provide accurate, up-to-date pricing information
- Include relevant details like region, instance types, storage classes, etc.
- Explain pricing factors that affect costs (data transfer, storage, compute time)
- Suggest cost optimization opportunities when appropriate
- Be clear about pricing model assumptions (On-Demand vs Reserved, etc.)
- If you don't have exact pricing information, explain how the user can get accurate quotes
- Focus specifically on AWS pricing topics - politely redirect non-pricing questions

Response format:
- Be conversational and helpful
- Use clear, concise explanations
- Include specific pricing figures when available
- Provide context for pricing decisions
- Suggest next steps or additional considerations

Remember: You are focused specifically on AWS pricing and cost estimation. Stay within this domain of expertise.`;
  }

  /**
   * Check if Bedrock service is properly configured (lightweight check)
   */
  isConfigured(): boolean {
    try {
      return !!(this.client && this.modelId && awsConfig.region);
    } catch (error) {
      logger.error('Bedrock configuration check failed', error);
      return false;
    }
  }

  /**
   * Health check for Bedrock service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), 120000); // 120 second timeout
      });

      const healthCheckPromise = this.sendMessage(
        'Hello, can you confirm you are working?',
        [],
        'You are a health check assistant. Respond with a brief confirmation that you are working properly.'
      );

      const response = await Promise.race([healthCheckPromise, timeoutPromise]);
      
      return response.content.length > 0;
    } catch (error) {
      logger.error('Bedrock health check failed', error);
      return false;
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      modelId: this.modelId,
      region: awsConfig.region,
      guardrailsEnabled: !!this.guardrailConfig,
      guardrailId: this.guardrailConfig?.guardrailIdentifier,
    };
  }
}

// Export singleton instance
export const bedrockService = new BedrockService();
