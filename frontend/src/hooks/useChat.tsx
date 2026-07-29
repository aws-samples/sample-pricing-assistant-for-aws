import React, { useReducer, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { authFetch, buildWebSocketUrl, useAuth } from './authContext';
import {
  ChatContext,
  type ChatContextType,
  type ChatMessage,
  type ChatState,
} from './chatContext';

// The context object, the useChat hook, and the ChatMessage/ChatState types
// live in ./chatContext so that this file only exports a component — required
// for React Fast Refresh. Import those from './hooks/chatContext', not here.

// Actions
type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_TYPING'; payload: boolean }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_CONVERSATION_ID'; payload: string }
  | { type: 'SET_WS_CONNECTED'; payload: boolean }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } };

// Initial state
const initialState: ChatState = {
  messages: [
    {
      id: uuidv4(),
      role: 'system',
      content: 'Welcome to AWS Pricing Assistant! I can help you estimate costs for AWS services. Ask me about pricing for EC2, S3, Lambda, RDS, and more, or upload your infrastructure files for detailed cost analysis.',
      timestamp: new Date(),
    },
  ],
  conversationId: null,
  isLoading: false,
  error: null,
  isTyping: false,
  wsConnected: false,
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
        error: null,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isTyping: false,
      };

    case 'SET_TYPING':
      return {
        ...state,
        isTyping: action.payload,
      };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [initialState.messages[0]], // Keep welcome message
        conversationId: null,
        error: null,
        isLoading: false,
        isTyping: false,
      };

    case 'SET_CONVERSATION_ID':
      return {
        ...state,
        conversationId: action.payload,
      };

    case 'SET_WS_CONNECTED':
      return {
        ...state,
        wsConnected: action.payload,
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      };

    default:
      return state;
  }
}

// Provider
interface ChatProviderProps {
  children: React.ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const wsRef = React.useRef<WebSocket | null>(null);

  const auth = useAuth();
  const authReady = !auth.config?.enabled || !!auth.user;

  // Initialize persistent WebSocket connection. When auth is enabled, wait for
  // a signed-in user before connecting — otherwise the upgrade is rejected with 4401.
  React.useEffect(() => {
    if (!authReady) return undefined;
    // Guards against a reconnect timer firing after this effect is torn down
    // (auth change or unmount), which would otherwise open an orphan socket.
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connectWebSocket = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = window.location.hostname === 'localhost' ? ':3001' : '';
      const wsUrl = buildWebSocketUrl(`${protocol}//${window.location.hostname}${port}/ws/chat`);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        dispatch({ type: 'SET_WS_CONNECTED', payload: true });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle ping/pong heartbeat
          if (message.type === 'ping') {
            ws.send(JSON.stringify({
              type: 'pong',
              id: message.id,
              data: { timestamp: new Date().toISOString() }
            }));
            return;
          }
          
          // Let other message handlers process chat messages
          // (This will be handled by individual request handlers)
        } catch (error) {
          // Silently ignore unparseable messages
        }
      };

      ws.onclose = (event) => {
        if (disposed) return;
        dispatch({ type: 'SET_WS_CONNECTED', payload: false });

        // Reconnect after 3 seconds if not a normal closure
        if (event.code !== 1000) {
          reconnectTimer = setTimeout(connectWebSocket, 3000);
        }
      };

      ws.onerror = () => {
        dispatch({ type: 'SET_WS_CONNECTED', payload: false });
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
    // Deliberately mount-only. `authReady` is read once to decide whether to
    // open the socket and is intentionally NOT a dependency: on first render
    // `config` is still null, so `!config?.enabled` is true and we connect
    // right away. Adding `authReady` here would make it flip true -> false ->
    // true once the config fetch resolves on an auth-enabled deployment,
    // tearing down a healthy socket and reconnecting for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: newMessage });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  // Declared before sendMessage so it can be a real dependency. Both response
  // handlers only read state.conversationId (never state.messages), so that is
  // the complete dependency list.
  const handleWebSocketResponse = useCallback(async (content: string, modelId?: string, fileIds?: string[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const assistantMessageId = uuidv4();
      let assistantContent = '';
      let metadata: any = {};
      const messageId = uuidv4();

      // Add initial empty assistant message - typing indicator will show for this
      const initialAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: initialAssistantMessage });
      
      // Ensure typing state is still true after adding the message
      dispatch({ type: 'SET_TYPING', payload: true });

      // Set up message handler for this specific request
      const messageHandler = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'chat' && message.id === messageId) {
            const { event: eventType, ...data } = message.data;

            switch (eventType) {
              case 'connected':
                break;

              case 'conversationId':
                if (data.conversationId && !state.conversationId) {
                  dispatch({ type: 'SET_CONVERSATION_ID', payload: data.conversationId });
                }
                break;

              case 'start':
                break;

              case 'chunk':
                assistantContent += data.content;
                // Clear typing indicator on first chunk
                if (assistantContent === data.content) {
                  dispatch({ type: 'SET_TYPING', payload: false });
                }
                dispatch({ 
                  type: 'UPDATE_MESSAGE', 
                  payload: { 
                    id: assistantMessageId, 
                    updates: { content: assistantContent } 
                  } 
                });
                break;

              case 'metadata':
                metadata = data;
                break;

              case 'complete':
                // Update final message with metadata
                dispatch({ 
                  type: 'UPDATE_MESSAGE', 
                  payload: { 
                    id: assistantMessageId, 
                    updates: { 
                      content: assistantContent,
                      metadata 
                    } 
                  } 
                });
                // Typing should already be cleared by first chunk
                ws.removeEventListener('message', messageHandler);
                resolve();
                break;

              case 'error':
                ws.removeEventListener('message', messageHandler);
                reject(new Error(data.error));
                break;
            }
          }
        } catch (parseError) {
          // Silently ignore unparseable WebSocket messages
        }
      };

      // Add message handler
      ws.addEventListener('message', messageHandler);

      // Send chat message
      ws.send(JSON.stringify({
        type: 'chat',
        id: messageId,
        data: {
          message: content,
          conversationId: state.conversationId,
          modelId,
          fileIds: fileIds && fileIds.length > 0 ? fileIds : undefined,
        },
      }));

      // Cleanup on timeout
      setTimeout(() => {
        ws.removeEventListener('message', messageHandler);
        reject(new Error('WebSocket timeout'));
      }, 300000); // 300 second timeout (5 minutes)
    });
  }, [state.conversationId]);

  const handleRegularResponse = useCallback(async (content: string, modelId?: string, fileIds?: string[]) => {
    // Make API call to backend (authFetch attaches the bearer token when auth is enabled)
    const response = await authFetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: content,
        conversationId: state.conversationId,
        modelId,
        fileIds: fileIds && fileIds.length > 0 ? fileIds : undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Set conversation ID if not already set
    if (data.conversationId && !state.conversationId) {
      dispatch({ type: 'SET_CONVERSATION_ID', payload: data.conversationId });
    }

    // Add assistant response
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: data.response,
      timestamp: new Date(),
      pricing: data.pricing,
      metadata: data.metadata,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
  }, [state.conversationId]);

  const sendMessage = useCallback(async (content: string, streaming: boolean = true, modelId?: string, fileIds?: string[]) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    // Set loading states
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_TYPING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (streaming) {
        // Handle WebSocket streaming response
        await handleWebSocketResponse(content, modelId, fileIds);
      } else {
        // Handle regular response
        await handleRegularResponse(content, modelId, fileIds);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });

      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        id: uuidv4(),
        role: 'error',
        content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: errorChatMessage });

      // Clear typing state on error
      setTimeout(() => {
        dispatch({ type: 'SET_TYPING', payload: false });
      }, 100);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [handleWebSocketResponse, handleRegularResponse]);

  const value: ChatContextType = {
    state,
    sendMessage,
    clearMessages,
    addMessage,
    setError,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

// Add displayName for better debugging and Fast Refresh compatibility
ChatProvider.displayName = 'ChatProvider';
