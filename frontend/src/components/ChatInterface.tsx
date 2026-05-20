import React, { useRef, useEffect } from 'react';
import { Info } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../hooks/useTheme';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ErrorMessage from './ErrorMessage';

const ChatInterface: React.FC = () => {
  const { state } = useChat();
  const { theme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [state.messages, state.isTyping]);

  const disclosureClasses = theme === 'dark'
    ? 'bg-dark-surface-secondary border-dark-border text-dark-text-muted'
    : 'bg-light-surface-secondary border-light-border text-light-text-muted';

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* AI disclosure banner */}
      <div
        role="note"
        className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs sm:text-sm border-b ${disclosureClasses}`}
      >
        <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          AI-generated estimates — verify with the{' '}
          <a
            href="https://calculator.aws/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            AWS Pricing Calculator
          </a>{' '}
          before purchasing decisions.
        </span>
      </div>

      {/* Messages Container */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 sm:py-6 space-y-4 scroll-smooth pb-20 sm:pb-4"
        style={{ 
          scrollbarGutter: 'stable',
          minHeight: 0 // Important for flex child to shrink
        }}
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Render Messages */}
          {state.messages.map((message, index) => {
            // Check if this is the last assistant message and we're typing
            const isLastAssistantMessage = message.role === 'assistant' && 
              index === state.messages.length - 1;
            const isCurrentlyTyping = state.isTyping && isLastAssistantMessage;
            
            // DEBUG: Log the typing logic
            if (message.role === 'assistant') {
              console.log('ChatInterface typing logic:', {
                messageId: message.id,
                index,
                totalMessages: state.messages.length,
                isLastAssistantMessage,
                stateIsTyping: state.isTyping,
                isCurrentlyTyping,
                messageContent: message.content.substring(0, 50) + '...'
              });
            }
            
            return (
              <ChatMessage 
                key={message.id} 
                message={message} 
                isTyping={isCurrentlyTyping}
              />
            );
          })}

          {/* Typing Indicator - Removed, now handled in ChatMessage */}

          {/* Error Message */}
          {state.error && (
            <ErrorMessage error={state.error} />
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input */}
      <div className="fixed sm:relative bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto border-t border-dark-border bg-dark-surface/95 sm:bg-dark-surface/50 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <ChatInput />
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
