import { createContext, useContext } from 'react';

// Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
  pricing?: any;
  metadata?: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    latency?: number;
    toolsUsed?: string[];
  };
}

export interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
  wsConnected: boolean;
}

export interface ChatContextType {
  state: ChatState;
  sendMessage: (content: string, streaming?: boolean, modelId?: string, fileIds?: string[]) => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setError: (error: string | null) => void;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Custom hook for chat functionality
export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
