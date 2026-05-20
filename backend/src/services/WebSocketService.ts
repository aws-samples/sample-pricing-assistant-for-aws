import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { bedrockToolService, BedrockToolMessage } from './bedrockToolService.js';
import { logger } from '@/utils/logger.js';
import { validateChatRequest } from '@/utils/validation.js';
import { parseInfrastructureFile } from './parserService.js';
import { generateCostEstimationPrompt, generateCombinedCostEstimationPrompt } from './costEstimationService.js';
import { s3Service } from './s3Service.js';
import { config } from '@/utils/config.js';
import { authConfig } from '@/config/index.js';
import { verifyWebSocketToken } from '@/middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';

interface WebSocketMessage {
  type: 'chat' | 'ping' | 'pong';
  id?: string;
  data?: any;
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  modelId?: string;
  context?: any;
}

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  conversationHistory: BedrockToolMessage[];
  lastActivity: Date;
  // Per-client chat-message rate limiting (defense against open-auth Bedrock abuse).
  // WAF + Express limiters bound HTTP/upgrade traffic; this caps post-upgrade WS messages.
  chatMessageTimestamps: number[]; // sliding 60s window
  chatMessageDayCount: number;
  chatMessageDayWindowStart: number; // ms since epoch
}

// Per-client rate limits for chat messages over an open WebSocket.
const WS_CHAT_PER_MINUTE = 30;
const WS_CHAT_PER_DAY = 200;
const WS_RATE_WINDOW_MS = 60_000;
const WS_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

// In-memory conversation storage with bounded size (LRU eviction)
const MAX_CONVERSATIONS = 1000;
const conversations = new Map<string, BedrockToolMessage[]>();

function setConversation(id: string, history: BedrockToolMessage[]) {
  if (conversations.size >= MAX_CONVERSATIONS && !conversations.has(id)) {
    // Evict oldest entry (first key in Map iteration order)
    const oldest = conversations.keys().next().value;
    if (oldest) conversations.delete(oldest);
  }
  conversations.set(id, history);
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private static readonly MAX_CLIENTS = 100;

  // Pull a token off either the Sec-WebSocket-Protocol header (`bearer,<token>`)
  // or a `?token=` query param. Browsers can't set arbitrary headers on the
  // upgrade request, so the protocol-header convention or query string is how
  // SPAs typically authenticate WebSockets.
  private extractToken(request: IncomingMessage): string | null {
    const proto = request.headers['sec-websocket-protocol'];
    if (typeof proto === 'string') {
      const parts = proto.split(',').map((s) => s.trim());
      if (parts[0] === 'bearer' && parts[1]) return parts[1];
    }
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    return url.searchParams.get('token');
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/chat',
      clientTracking: true,
    });

    this.wss.on('connection', async (ws, request) => {
      // Reject new connections if at capacity
      if (this.clients.size >= WebSocketService.MAX_CLIENTS) {
        logger.warn('WebSocket connection rejected — at capacity', {
          maxClients: WebSocketService.MAX_CLIENTS,
        });
        ws.close(1013, 'Server at capacity');
        return;
      }

      // Auth gate. When AUTH_ENABLED=false, verifyWebSocketToken returns null
      // and we proceed exactly like the open-access mode.
      let userSub: string | undefined;
      if (authConfig.enabled) {
        const token = this.extractToken(request);
        try {
          const user = await verifyWebSocketToken(token);
          userSub = user?.sub;
        } catch (err) {
          logger.warn('WebSocket auth rejected', {
            error: err instanceof Error ? err.message : String(err),
            ip: request.socket.remoteAddress,
          });
          // 4401: app-defined "unauthorized" close code (in the 4xxx user range).
          ws.close(4401, 'Unauthorized');
          return;
        }
      }

      const clientId = uuidv4();
      void userSub; // reserved for future per-user accounting
      const client: ConnectedClient = {
        id: clientId,
        ws,
        conversationHistory: [],
        lastActivity: new Date(),
        chatMessageTimestamps: [],
        chatMessageDayCount: 0,
        chatMessageDayWindowStart: Date.now(),
      };

      this.clients.set(clientId, client);

      logger.info('WebSocket client connected', {
        clientId,
        clientsCount: this.clients.size,
        userAgent: request.headers['user-agent'],
        ip: request.socket.remoteAddress,
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'chat',
        id: uuidv4(),
        data: {
          event: 'connected',
          clientId,
          timestamp: new Date().toISOString(),
        },
      });

      // Handle incoming messages
      ws.on('message', async (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          await this.handleMessage(clientId, message);
        } catch (error) {
          logger.error('WebSocket message parsing error', {
            clientId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          this.sendMessage(ws, {
            type: 'chat',
            id: uuidv4(),
            data: {
              event: 'error',
              error: 'Invalid message format',
              timestamp: new Date().toISOString(),
            },
          });
        }
      });

      // Handle client disconnect
      ws.on('close', (code, reason) => {
        this.clients.delete(clientId);
        logger.info('WebSocket client disconnected', {
          clientId,
          code,
          reason: reason.toString(),
          clientsCount: this.clients.size,
        });
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', {
          clientId,
          error: error.message,
        });
        this.clients.delete(clientId);
      });

      // Update last activity
      client.lastActivity = new Date();
    });

    // Start heartbeat to keep connections alive
    this.startHeartbeat();

    logger.info('WebSocket service initialized', {
      path: '/ws/chat',
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn('Message from unknown client', { clientId });
      return;
    }

    client.lastActivity = new Date();

    switch (message.type) {
      case 'ping':
        this.sendMessage(client.ws, {
          type: 'pong',
          ...(message.id && { id: message.id }),
          data: { timestamp: new Date().toISOString() },
        });
        break;

      case 'pong':
        // Client responded to our ping - update last activity
        client.lastActivity = new Date();
        break;

      case 'chat':
        if (!this.checkChatRateLimit(client)) {
          // Tell the client and close — they're abusing the open WS.
          this.sendMessage(client.ws, {
            type: 'chat',
            id: message.id || uuidv4(),
            data: {
              event: 'error',
              error: 'Rate limit exceeded — too many chat messages',
              timestamp: new Date().toISOString(),
            },
          });
          client.ws.close(1008, 'Rate limit exceeded');
          this.clients.delete(clientId);
          return;
        }
        await this.handleChatMessage(client, message);
        break;

      default:
        logger.warn('Unknown message type', {
          clientId,
          type: message.type,
        });
    }
  }

  /**
   * Handle chat messages
   */
  /**
   * Per-client chat-message rate limit. Returns true if the message is allowed,
   * false if the client has exceeded the per-minute or per-day cap.
   *
   * The WAF /ws/* rule rate-limits HTTP upgrade requests but does not see
   * post-upgrade WebSocket frames; without this check, an attacker holding a
   * single connection can flood Bedrock at the speed they can send frames.
   */
  private checkChatRateLimit(client: ConnectedClient): boolean {
    const now = Date.now();

    // Reset the daily window if 24h have elapsed since the window started.
    if (now - client.chatMessageDayWindowStart >= WS_DAY_WINDOW_MS) {
      client.chatMessageDayWindowStart = now;
      client.chatMessageDayCount = 0;
    }
    if (client.chatMessageDayCount >= WS_CHAT_PER_DAY) {
      logger.warn('WS chat rate limit hit (daily)', {
        clientId: client.id,
        dayCount: client.chatMessageDayCount,
      });
      return false;
    }

    // Sliding 60s window for per-minute cap.
    const minuteCutoff = now - WS_RATE_WINDOW_MS;
    client.chatMessageTimestamps = client.chatMessageTimestamps.filter(t => t > minuteCutoff);
    if (client.chatMessageTimestamps.length >= WS_CHAT_PER_MINUTE) {
      logger.warn('WS chat rate limit hit (per-minute)', {
        clientId: client.id,
        recent: client.chatMessageTimestamps.length,
      });
      return false;
    }

    client.chatMessageTimestamps.push(now);
    client.chatMessageDayCount++;
    return true;
  }

  private async handleChatMessage(client: ConnectedClient, message: WebSocketMessage) {
    const requestId = message.id || uuidv4();

    try {
      // Validate chat request
      const chatRequest: ChatRequest = message.data;
      const { message: userMessage, conversationId, modelId, fileId, fileIds, context: _context } = validateChatRequest(chatRequest);
      
      logger.info('WebSocket chat request received', {
        userMessage: userMessage.substring(0, 100),
        conversationId,
        modelId,
        fileId,
        fileIds,
        hasFiles: !!(fileId || (fileIds && fileIds.length > 0))
      });

      // Get or create conversation ID
      const currentConversationId = conversationId || uuidv4();
      
      // Get conversation history
      const conversationHistory = conversations.get(currentConversationId) || [];

      logger.info('WebSocket chat request received', {
        clientId: client.id,
        requestId,
        conversationId: currentConversationId,
        messageLength: userMessage.length,
        historyLength: conversationHistory.length,
      });

      // Send conversation ID
      this.sendMessage(client.ws, {
        type: 'chat',
        id: requestId,
        data: {
          event: 'conversationId',
          conversationId: currentConversationId,
          timestamp: new Date().toISOString(),
        },
      });

      // Send start event
      this.sendMessage(client.ws, {
        type: 'chat',
        id: requestId,
        data: {
          event: 'start',
          timestamp: new Date().toISOString(),
        },
      });

      // Get system prompt for pricing assistance
      const systemPrompt = bedrockToolService.getSystemPrompt();

      let processedMessage = userMessage;
      
      // Process files for cost estimation (support both single fileId and multiple fileIds)
      const allFileIds: string[] = [];
      if (fileId) allFileIds.push(fileId);
      if (fileIds) allFileIds.push(...fileIds);
      
      if (allFileIds.length > 0) {
        try {
          const uploadsDir = path.join(process.cwd(), 'uploads');
          const fileData: Array<{resources: any[], fileName: string}> = [];
          
          for (const currentFileId of allFileIds) {
            try {
              let metadata;
              let fileContent;
              
              if (config.s3.useS3) {
                // Use S3Service
                metadata = await s3Service.getMetadata(currentFileId);
                fileContent = await s3Service.getFile(currentFileId, 'original' + path.extname(metadata.originalName));
              } else {
                // Use local storage
                const metadataPath = path.join(uploadsDir, `${currentFileId}.meta.json`);
                const metadataContent = await fs.readFile(metadataPath, 'utf-8');
                metadata = JSON.parse(metadataContent);
                
                const filePath = path.join(uploadsDir, `${currentFileId}${metadata.fileExtension}`);
                fileContent = await fs.readFile(filePath);
              }
              
              logger.info('Attempting to process file for cost estimation', {
                fileId: currentFileId,
                storage: config.s3.useS3 ? 'S3' : 'local',
                originalName: metadata.originalName
              });
              
              const parseResult = parseInfrastructureFile(metadata.originalName, fileContent.toString());
              
              if (parseResult.resources.length > 0) {
                fileData.push({
                  resources: parseResult.resources,
                  fileName: metadata.originalName
                });
                
                logger.info('Added file data for combined cost estimation', {
                  fileId: currentFileId,
                  fileName: metadata.originalName,
                  resourceCount: parseResult.resources.length
                });
              } else {
                logger.warn('No resources found in parsed file', {
                  fileId: currentFileId,
                  fileName: metadata.originalName,
                  parseErrors: parseResult.errors
                });
              }
            } catch (error) {
              logger.warn('Failed to process individual file for cost estimation in WebSocket', { 
                fileId: currentFileId, 
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined
              });
            }
          }
          
          if (fileData.length > 0) {
            const combinedPrompt = fileData.length > 1 
              ? generateCombinedCostEstimationPrompt(fileData)
              : generateCostEstimationPrompt(fileData[0].resources, fileData[0].fileName);
            
            processedMessage = `${userMessage}\n\n${combinedPrompt}`;
            
            logger.info('Generated combined cost estimation prompt for WebSocket', {
              totalFiles: allFileIds.length,
              processedFiles: fileData.length,
              usedCombinedPrompt: fileData.length > 1
            });
          }
        } catch (error) {
          logger.warn('Failed to process files for cost estimation in WebSocket', { 
            fileIds: allFileIds, 
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }

      // Get response from Bedrock
      const hasFiles = allFileIds.length > 0;
      const bedrockResponse = await bedrockToolService.sendMessageWithTools(
        processedMessage,
        conversationHistory,
        systemPrompt,
        modelId,
        conversationId || undefined,
        hasFiles
      );

      // Stream the response in chunks
      const content = bedrockResponse.content;
      const chunkSize = 15; // Characters per chunk
      let currentIndex = 0;

      // If tools were used, stream a bit faster to show the complete response
      const streamDelay = (bedrockResponse.toolsUsed?.length || 0) > 0 ? 20 : 30;

      const streamChunks = () => {
        if (currentIndex >= content.length) {
          // Send final metadata
          this.sendMessage(client.ws, {
            type: 'chat',
            id: requestId,
            data: {
              event: 'metadata',
              model: bedrockResponse.metadata?.model || 'unknown',
              inputTokens: bedrockResponse.usage?.inputTokens,
              outputTokens: bedrockResponse.usage?.outputTokens,
              latency: bedrockResponse.metadata?.latency,
              toolsUsed: bedrockResponse.toolsUsed,
              timestamp: new Date().toISOString(),
            },
          });

          // Send completion event
          this.sendMessage(client.ws, {
            type: 'chat',
            id: requestId,
            data: {
              event: 'complete',
              totalLength: content.length,
              timestamp: new Date().toISOString(),
            },
          });

          // Update conversation history
          const updatedHistory: BedrockToolMessage[] = [
            ...conversationHistory,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: bedrockResponse.content },
          ];

          // Keep only last 10 messages to prevent memory issues
          const trimmedHistory = updatedHistory.slice(-10);
          setConversation(currentConversationId, trimmedHistory);

          logger.info('WebSocket chat response completed', {
            clientId: client.id,
            requestId,
            conversationId: currentConversationId,
            responseLength: content.length,
            toolsUsed: bedrockResponse.toolsUsed,
          });

          return;
        }

        const chunk = content.slice(currentIndex, currentIndex + chunkSize);
        this.sendMessage(client.ws, {
          type: 'chat',
          id: requestId,
          data: {
            event: 'chunk',
            content: chunk,
            index: currentIndex,
            timestamp: new Date().toISOString(),
          },
        });

        currentIndex += chunkSize;

        // Schedule next chunk
        setTimeout(streamChunks, streamDelay);
      };

      // Start streaming
      streamChunks();

    } catch (error) {
      logger.error('WebSocket chat request failed', {
        clientId: client.id,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.sendMessage(client.ws, {
        type: 'chat',
        id: requestId,
        data: {
          event: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Send message to WebSocket client
   */
  private sendMessage(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = 300000; // 300 seconds (5 minutes)

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastActivity = now.getTime() - client.lastActivity.getTime();

        if (timeSinceLastActivity > timeout) {
          logger.info('WebSocket client timeout', { clientId });
          client.ws.terminate();
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          // Send ping
          this.sendMessage(client.ws, {
            type: 'ping',
            id: uuidv4(),
            data: { timestamp: now.toISOString() },
          });
        }
      }
    }, 15000); // Check every 15 seconds
  }

  /**
   * Get WebSocket statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      totalConversations: conversations.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Shutdown WebSocket service
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.wss) {
      this.wss.close(() => {
        logger.info('WebSocket service shut down');
      });
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.terminate();
    }
    this.clients.clear();
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();
