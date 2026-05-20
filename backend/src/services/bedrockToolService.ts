import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { awsConfig } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { BedrockError } from '@/utils/errors.js';
import { executeTool } from './pricingApiService.js';

export interface BedrockToolMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockToolResponse {
  content: string;
  toolsUsed?: string[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;
  metadata?: {
    model: string;
    latency: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

/**
 * Bedrock Agent Service with built-in AWS pricing tools
 */
export class BedrockToolService {
  private runtimeClient: BedrockRuntimeClient;
  private sonnet45InferenceProfileArn: string;
  private opus46InferenceProfileArn: string;

  constructor() {
    this.runtimeClient = new BedrockRuntimeClient({
      region: awsConfig.region,
      maxAttempts: 3,
      retryMode: 'adaptive',
    });

    this.sonnet45InferenceProfileArn = process.env.BEDROCK_INFERENCE_PROFILE_SONNET45_ARN || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
    this.opus46InferenceProfileArn = process.env.BEDROCK_INFERENCE_PROFILE_OPUS46_ARN || 'us.anthropic.claude-opus-4-6-v1';

    logger.info('Bedrock inference profiles configured', {
      sonnet45: this.sonnet45InferenceProfileArn,
      opus46: this.opus46InferenceProfileArn,
    });
  }

  /**
   * Get model name for display
   */
  private getModelDisplayName(modelId?: string): string {
    if (modelId === 'us.anthropic.claude-opus-4-6-v1') return 'Claude Opus 4.6';
    if (modelId === 'us.anthropic.claude-sonnet-4-5-20250929-v1:0') return 'Claude 4.5 Sonnet';
    return 'Claude Opus 4.6';
  }

  /**
   * Send message with pricing tools via Converse API
   */
  async sendMessageWithTools(
    message: string,
    conversationHistory: BedrockToolMessage[] = [],
    _systemPrompt?: string,
    modelId?: string,
    conversationId?: string,
    _hasFiles: boolean = false
  ): Promise<BedrockToolResponse> {
    return this.sendMessageWithInferenceProfile(message, conversationHistory, modelId || 'us.anthropic.claude-opus-4-6-v1', conversationId);
  }

  /**
   * Get enhanced system prompt for pricing assistance
   */
  getSystemPrompt(): string {
    return `You are an AWS pricing expert. 

CRITICAL: Always start your response with the TOTAL MONTHLY COST prominently displayed at the very beginning, like this:
**TOTAL ESTIMATED MONTHLY COST: $X,XXX.XX**

Then provide the detailed breakdown.

For pricing questions:
- MUST call getPricing function for ANY pricing question
- Do not answer from memory - always use getPricing with serviceCode and region parameters
- Always calculate and display total monthly cost first
- Default to us-east-1 region when not specified
- Provide detailed cost breakdowns after the total`;
  }

  /**
   * Pricing tool definitions for Converse API toolConfig
   */
  private getToolConfig() {
    return {
      tools: [
        {
          toolSpec: {
            name: 'getPricing',
            description: 'REQUIRED: Get real-time AWS On-Demand and Reserved Instance pricing from the AWS Price List API. MUST be called for any pricing question. Use filters to get specific products (e.g. instanceType for EC2, volumeType for EBS).',
            inputSchema: { json: { type: 'object', properties: {
              serviceCode: { type: 'string', description: 'AWS service code (e.g. AmazonEC2, AmazonS3, AmazonRDS)' },
              region: { type: 'string', description: 'AWS region code (e.g. us-east-1, us-west-2). Default: us-east-1' },
              filters: { type: 'object', description: 'Key-value filters to narrow results. For EC2 use: instanceType (e.g. "t3.micro"), operatingSystem ("Linux"), tenancy ("Shared"), capacitystatus ("Used"), preInstalledSw ("NA"). For RDS: databaseEngine ("MySQL"), instanceType ("db.t3.micro"). For S3: volumeType ("Standard"). Filter field names are case-sensitive and must match exactly.' },
              maxResults: { type: 'number', description: 'Max results to return (1-100). Default: 10' },
            }, required: ['serviceCode'] } },
          },
        },
        {
          toolSpec: {
            name: 'getServiceCodes',
            description: 'List available AWS service codes for use with getPricing',
            inputSchema: { json: { type: 'object', properties: {
              maxResults: { type: 'number', description: 'Max results (1-100). Default: 100' },
            } } },
          },
        },
        {
          toolSpec: {
            name: 'getServiceAttributes',
            description: 'Get filterable attributes for a specific AWS service',
            inputSchema: { json: { type: 'object', properties: {
              serviceCode: { type: 'string', description: 'AWS service code' },
            }, required: ['serviceCode'] } },
          },
        },
        {
          toolSpec: {
            name: 'getSavingsPlans',
            description: 'Get AWS Savings Plans offerings and pricing. Use for Savings Plans comparisons.',
            inputSchema: { json: { type: 'object', properties: {
              serviceCode: { type: 'string', description: 'AWS service code (e.g. AmazonEC2)' },
              planType: { type: 'string', description: 'Savings Plan type: Compute, EC2Instance, or SageMaker' },
              region: { type: 'string', description: 'AWS region code' },
            } } },
          },
        },
        {
          toolSpec: {
            name: 'getSavingsPlansRates',
            description: 'Get specific rate details for a Savings Plans offering',
            inputSchema: { json: { type: 'object', properties: {
              offeringId: { type: 'string', description: 'Savings Plan offering ID from getSavingsPlans results' },
            }, required: ['offeringId'] } },
          },
        },
      ],
    };
  }

  /**
   * Send message using Bedrock Inference Profile with tool use
   */
  async sendMessageWithInferenceProfile(
    message: string,
    conversationHistory: BedrockToolMessage[] = [],
    modelId: string,
    _conversationId?: string
  ): Promise<BedrockToolResponse> {
    const startTime = Date.now();
    
    const inferenceProfileArn = modelId === 'us.anthropic.claude-opus-4-6-v1'
      ? this.opus46InferenceProfileArn
      : this.sonnet45InferenceProfileArn;

    logger.info('Inference profile call with tools', { modelId: inferenceProfileArn, messageLength: message.length });

    const systemMessage = `You are an AWS pricing expert.

CRITICAL: Always start your response with the TOTAL MONTHLY COST prominently displayed at the very beginning, like this:
**TOTAL ESTIMATED MONTHLY COST: $X,XXX.XX**

Rules:
- MUST call getPricing with specific filters for ANY pricing question - do NOT answer from memory
- For EC2, always pass filters like {"instanceType": "t3.micro"} to get exact pricing
- Default to us-east-1 if no region specified
- Use getSavingsPlans when users ask about Savings Plans or cost optimization
- Provide detailed cost breakdowns after the total
- NEVER mention the API, tool calls, data retrieval, or your process — present answers as if you simply know them
- NEVER say "The API returned", "I have the data", "Based on the pricing data", or similar phrases`;

    // Build messages with conversation history (summarize long assistant messages to save tokens)
    const messages: any[] = [];
    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      for (const msg of recent) {
        let text = msg.content;
        if (msg.role === 'assistant' && text.length > 800) {
          // Keep first 400 chars (key answer) + last 400 chars (follow-up questions)
          text = text.substring(0, 400) + '\n[...middle truncated...]\n' + text.substring(text.length - 400);
        }
        messages.push({ role: msg.role, content: [{ text }] });
      }
    }
    messages.push({ role: 'user', content: [{ text: message }] });

    const toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const maxToolRounds = 10;

    try {
      for (let round = 0; round < maxToolRounds; round++) {
        const response = await this.runtimeClient.send(new ConverseCommand({
          modelId: inferenceProfileArn,
          messages,
          system: [{ text: systemMessage }],
          toolConfig: this.getToolConfig(),
          inferenceConfig: { maxTokens: 10000, temperature: 0.1 },
        }));

        totalInputTokens += response.usage?.inputTokens || 0;
        totalOutputTokens += response.usage?.outputTokens || 0;

        // Add assistant response to messages for next round
        if (response.output?.message) {
          messages.push(response.output.message);
        }

        // If model is done (no tool use), extract text and return
        if (response.stopReason !== 'tool_use') {
          const textBlocks = response.output?.message?.content?.filter((b: any) => b.text) || [];
          const content = textBlocks.map((b: any) => b.text).join('');
          const latency = Date.now() - startTime;

          logger.info('Inference profile response complete', {
            modelId: inferenceProfileArn, latency, toolsUsed, rounds: round + 1,
            inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
          });

          return {
            content: content.trim(),
            toolsUsed,
            usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
            stopReason: response.stopReason || 'end_turn',
            metadata: {
              model: this.getModelDisplayName(modelId),
              latency,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          };
        }

        // Handle tool use — execute each tool call and send results back
        const toolUseBlocks = response.output?.message?.content?.filter((b: any) => b.toolUse) || [];
        const toolResults: any[] = [];

        for (const block of toolUseBlocks) {
          const tu = block.toolUse!;
          const toolUseId = tu.toolUseId!;
          const name = tu.name!;
          const input = tu.input as Record<string, any>;
          logger.info('Executing tool', { name, input });
          toolsUsed.push(name);

          const result = await executeTool(name, input);
          toolResults.push({
            toolResult: { toolUseId, content: [{ text: result }] },
          });
        }

        // Add tool results as user message for next round
        messages.push({ role: 'user', content: toolResults });
      }

      // If we exhausted rounds, return the last text content we got
      const lastAssistant = [...messages].reverse().find((m: any) => m.role === 'assistant');
      const lastText = lastAssistant?.content?.filter((b: any) => b.text).map((b: any) => b.text).join('') || '';
      const latency = Date.now() - startTime;

      logger.warn('Tool use loop exhausted max rounds', { rounds: maxToolRounds, toolsUsed, hasContent: !!lastText });

      return {
        content: lastText || 'I was unable to complete the pricing lookup. Please try a more specific question.',
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        stopReason: 'max_rounds',
        metadata: { model: this.getModelDisplayName(modelId), latency, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    } catch (error) {
      if (error instanceof BedrockError) throw error;
      logger.error('Inference profile error', {
        error: error instanceof Error ? error.message : String(error),
        modelId: inferenceProfileArn,
        latency: Date.now() - startTime,
      });
      throw new BedrockError(
        `Bedrock error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.sendMessageWithTools(
        'Hello, can you confirm you are working?',
        [],
        'You are a health check assistant. Respond briefly that you are working properly.'
      );
      
      return response.content.length > 0;
    } catch (error) {
      logger.error('Bedrock Agent health check failed', error);
      return false;
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      opus46: this.opus46InferenceProfileArn,
      sonnet45: this.sonnet45InferenceProfileArn,
      region: awsConfig.region,
      toolsEnabled: true,
      availableTools: ['getPricing', 'getServiceCodes', 'getServiceAttributes', 'getSavingsPlans', 'getSavingsPlansRates'],
    };
  }
}

// Export singleton instance
export const bedrockToolService = new BedrockToolService();
