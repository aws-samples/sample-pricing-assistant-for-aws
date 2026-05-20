import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { bedrockService } from '@/services/bedrockService.js';
import { bedrockToolService, BedrockToolMessage } from '@/services/bedrockToolService.js';
import { validateChatRequest, ChatResponse } from '@/utils/validation.js';
import { logger } from '@/utils/logger.js';
import { asyncHandler } from '@/utils/errors.js';
import { parseInfrastructureFile } from '../services/parserService.js';
import { generateCostEstimationPrompt, generateCombinedCostEstimationPrompt } from '../services/costEstimationService.js';
import fs from 'fs/promises';
import path from 'path';

// In-memory conversation storage with bounded size (LRU eviction)
const MAX_CONVERSATIONS = 1000;
const conversations = new Map<string, BedrockToolMessage[]>();

function setConversation(id: string, history: BedrockToolMessage[]) {
  if (conversations.size >= MAX_CONVERSATIONS && !conversations.has(id)) {
    const oldest = conversations.keys().next().value;
    if (oldest) conversations.delete(oldest);
  }
  conversations.set(id, history);
}

// Helper function to process multiple files for cost estimation
async function processFilesForCostEstimation(fileIds: string[]): Promise<string> {
  if (fileIds.length === 0) return '';
  
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const fileData: Array<{resources: any[], fileName: string}> = [];
  
  for (const fileId of fileIds) {
    try {
      const metadataPath = path.join(uploadsDir, `${fileId}.meta.json`);
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      const fileContent = await fs.readFile(metadata.filePath, 'utf-8');
      const parseResult = parseInfrastructureFile(metadata.originalName, fileContent);
      
      if (parseResult.resources.length > 0) {
        fileData.push({
          resources: parseResult.resources,
          fileName: metadata.originalName
        });
        
        logger.info('Processed file for cost estimation', {
          fileId,
          fileName: metadata.originalName,
          resourceCount: parseResult.resources.length
        });
      }
    } catch (error) {
      logger.warn('Failed to process file for cost estimation', { fileId, error });
    }
  }
  
  if (fileData.length === 0) return '';
  
  const prompt = fileData.length > 1 
    ? generateCombinedCostEstimationPrompt(fileData)
    : generateCostEstimationPrompt(fileData[0].resources, fileData[0].fileName);
  
  return `\n\nFile Analysis Context:\n${prompt}`;
}

/**
 * Handle chat message requests
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  
  logger.info('Chat request received', {
    requestId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Validate request
  const { message, conversationId, context: _context, modelId, fileId, fileIds } = validateChatRequest(req.body);

  // Get or create conversation ID
  const currentConversationId = conversationId || uuidv4();
  
  // Get conversation history
  const conversationHistory = conversations.get(currentConversationId) || [];

  // Log the request
  logger.info('Processing chat message', {
    requestId,
    conversationId: currentConversationId,
    messageLength: message.length,
    historyLength: conversationHistory.length,
    hasContext: !!_context,
  });

  try {
    // Process files for cost estimation (support both single fileId and multiple fileIds)
    const allFileIds: string[] = [];
    if (fileId) allFileIds.push(fileId);
    if (fileIds) allFileIds.push(...fileIds);
    
    let processedMessage = message;
    
    // Check if message includes fileIds for cost estimation
    if (allFileIds.length > 0) {
      const fileContext = await processFilesForCostEstimation(allFileIds);
      if (fileContext) {
        processedMessage = message + fileContext;
      }
    }

    // Get system prompt for pricing assistance
    const systemPrompt = bedrockToolService.getSystemPrompt();

    // Send message to Bedrock with tool calling capabilities
    const bedrockResponse = await bedrockToolService.sendMessageWithTools(
      processedMessage,
      conversationHistory,
      systemPrompt,
      modelId,
      currentConversationId
    );

    // Update conversation history
    const updatedHistory: BedrockToolMessage[] = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: bedrockResponse.content },
    ];

    // Keep only last 30 messages to prevent memory issues (increased from 10)
    const trimmedHistory = updatedHistory.slice(-30);
    setConversation(currentConversationId, trimmedHistory);

    // Build response
    const response: ChatResponse = {
      response: bedrockResponse.content,
      conversationId: currentConversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        model: bedrockResponse.metadata?.model || 'unknown',
        // Note: Token usage not available for Bedrock Agents
        inputTokens: bedrockResponse.usage?.inputTokens || undefined,
        outputTokens: bedrockResponse.usage?.outputTokens || undefined,
        latency: bedrockResponse.metadata?.latency,
        toolsUsed: bedrockResponse.toolsUsed,
      },
    };

    logger.info('Chat response sent', {
      requestId,
      conversationId: currentConversationId,
      responseLength: bedrockResponse.content.length,
      // Note: Token usage not available for Bedrock Agents
      inputTokens: bedrockResponse.usage?.inputTokens || 'N/A',
      outputTokens: bedrockResponse.usage?.outputTokens || 'N/A',
      latency: bedrockResponse.metadata?.latency,
      toolsUsed: bedrockResponse.toolsUsed,
    });

    res.json(response);

  } catch (error) {
    logger.error('Chat request failed', {
      requestId,
      conversationId: currentConversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Re-throw to be handled by error middleware
    throw error;
  }
});

/**
 * Handle streaming chat message requests using Server-Sent Events
 */
export const sendMessageStream = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  
  logger.info('Streaming chat request received', {
    requestId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Validate request
  const { message, conversationId, context: _context, modelId, fileId, fileIds } = validateChatRequest(req.body);

  // Get or create conversation ID
  const currentConversationId = conversationId || uuidv4();
  
  // Get conversation history
  const conversationHistory = conversations.get(currentConversationId) || [];

  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial metadata
  const sendSSE = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Process files for cost estimation (support both single fileId and multiple fileIds)
    const allFileIds: string[] = [];
    if (fileId) allFileIds.push(fileId);
    if (fileIds) allFileIds.push(...fileIds);
    
    let processedMessage = message;
    
    // Check if message includes fileIds for cost estimation
    if (allFileIds.length > 0) {
      const fileContext = await processFilesForCostEstimation(allFileIds);
      if (fileContext) {
        processedMessage = message + fileContext;
      }
    }

    // Send conversation ID
    sendSSE('conversationId', { conversationId: currentConversationId });

    // Send start event
    sendSSE('start', { 
      timestamp: new Date().toISOString(),
      requestId 
    });

    // Get system prompt for pricing assistance
    const systemPrompt = bedrockToolService.getSystemPrompt();

    // For now, we'll simulate streaming by getting the full response and chunking it
    // In a real implementation, you'd want to use Bedrock's streaming API
    const bedrockResponse = await bedrockToolService.sendMessageWithTools(
      processedMessage,
      conversationHistory,
      systemPrompt,
      modelId,
      currentConversationId
    );

    // Simulate streaming by sending chunks of the response
    const content = bedrockResponse.content;
    const chunkSize = 10; // Characters per chunk
    let currentIndex = 0;

    const streamInterval = setInterval(() => {
      if (currentIndex >= content.length) {
        clearInterval(streamInterval);
        
        // Send final metadata
        sendSSE('metadata', {
          model: bedrockResponse.metadata?.model || 'unknown',
          // Note: Token usage not available for Bedrock Agents
          inputTokens: bedrockResponse.usage?.inputTokens || undefined,
          outputTokens: bedrockResponse.usage?.outputTokens || undefined,
          latency: bedrockResponse.metadata?.latency,
          toolsUsed: bedrockResponse.toolsUsed,
        });

        // Send completion event
        sendSSE('complete', { 
          timestamp: new Date().toISOString(),
          totalLength: content.length 
        });

        // Update conversation history
        const updatedHistory: BedrockToolMessage[] = [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: bedrockResponse.content },
        ];

        // Keep only last 30 messages to prevent memory issues (increased from 10)
        const trimmedHistory = updatedHistory.slice(-30);
        setConversation(currentConversationId, trimmedHistory);

        logger.info('Streaming chat response completed', {
          requestId,
          conversationId: currentConversationId,
          responseLength: content.length,
          toolsUsed: bedrockResponse.toolsUsed,
        });

        res.end();
        return;
      }

      const chunk = content.slice(currentIndex, currentIndex + chunkSize);
      sendSSE('chunk', { 
        content: chunk,
        index: currentIndex 
      });
      
      currentIndex += chunkSize;
    }, 50); // Send chunk every 50ms

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(streamInterval);
      logger.info('Streaming client disconnected', { requestId });
    });

  } catch (error) {
    logger.error('Streaming chat request failed', {
      requestId,
      conversationId: currentConversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    sendSSE('error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });

    res.end();
  }
});

/**
 * Get conversation history
 */
export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const requestId = req.headers['x-request-id'] as string;

  logger.info('Conversation history requested', {
    requestId,
    conversationId,
  });

  const history = conversations.get(conversationId) || [];

  return res.json({
    conversationId,
    messages: history.map((msg, index) => ({
      id: `${conversationId}-${index}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date().toISOString(), // Placeholder - would be stored in real DB
    })),
    messageCount: history.length,
    createdAt: new Date().toISOString(), // Placeholder
    updatedAt: new Date().toISOString(), // Placeholder
  });
});

/**
 * Delete conversation
 */
export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const requestId = req.headers['x-request-id'] as string;

  logger.info('Conversation deletion requested', {
    requestId,
    conversationId,
  });

  const existed = conversations.has(conversationId);
  conversations.delete(conversationId);

  if (!existed) {
    return res.status(404).json({
      error: {
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  logger.info('Conversation deleted', {
    requestId,
    conversationId,
  });

  return res.status(204).send();
});

/**
 * Clear all conversations (development only)
 */
export const clearAllConversations = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;

  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'This operation is not allowed in production',
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  const conversationCount = conversations.size;
  conversations.clear();

  logger.info('All conversations cleared', {
    requestId,
    conversationCount,
  });

  return res.json({
    message: 'All conversations cleared',
    conversationsDeleted: conversationCount,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get chat statistics
 */
export const getChatStats = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;

  const stats = {
    totalConversations: conversations.size,
    totalMessages: Array.from(conversations.values()).reduce(
      (total, history) => total + history.length,
      0
    ),
    averageMessagesPerConversation: conversations.size > 0 
      ? Array.from(conversations.values()).reduce(
          (total, history) => total + history.length,
          0
        ) / conversations.size
      : 0,
    modelInfo: bedrockService.getModelInfo(),
    timestamp: new Date().toISOString(),
  };

  logger.info('Chat statistics requested', {
    requestId,
    ...stats,
  });

  return res.json(stats);
});
