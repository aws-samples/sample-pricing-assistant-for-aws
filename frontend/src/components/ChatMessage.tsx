import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from '../hooks/useChat';
import { formatDistanceToNow } from 'date-fns';
import { User, Bot, AlertCircle, Info, Download } from 'lucide-react';
import PricingDisplay from './PricingDisplay';
import { useTheme } from '../hooks/useTheme';

interface ChatMessageProps {
  message: ChatMessageType;
  isTyping?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isTyping = false }) => {
  const { role, content, timestamp, pricing, metadata } = message;
  const { theme } = useTheme();

  // DEBUG: Log the actual values
  console.log('ChatMessage render:', {
    role,
    contentLength: content?.length || 0,
    isTyping,
    messageId: message.id,
    shouldShowTyping: isTyping && role === 'assistant'
  });

  const formatTime = (date: Date) => {
    return formatDistanceToNow(date, { addSuffix: true });
  };

  // Theme-aware classes
  const getThemeClasses = () => {
    if (theme === 'dark') {
      return {
        text: {
          primary: 'text-dark-text-primary',
          secondary: 'text-dark-text-secondary',
          muted: 'text-dark-text-muted',
        },
        bg: {
          card: 'bg-dark-card',
          surface: 'bg-dark-surface-secondary',
        },
        border: 'border-dark-border',
        accent: 'text-dark-accent-primary',
      };
    } else {
      return {
        text: {
          primary: 'text-light-text-primary',
          secondary: 'text-light-text-secondary', 
          muted: 'text-light-text-muted',
        },
        bg: {
          card: 'bg-light-card',
          surface: 'bg-light-surface-secondary',
        },
        border: 'border-light-border',
        accent: 'text-light-accent-primary',
      };
    }
  };

  const classes = getThemeClasses();

  const exportAsMarkdown = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `aws-pricing-response-${timestamp}.md`;
    
    let markdownContent = `# AWS Pricing Response\n\n`;
    markdownContent += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    
    if (metadata?.model) {
      markdownContent += `**Model:** ${metadata.model}\n\n`;
    }
    
    markdownContent += `---\n\n${content}`;
    
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getMessageIcon = () => {
    switch (role) {
      case 'user':
        return <User className="w-5 h-5" />;
      case 'assistant':
        return <Bot className="w-5 h-5" />;
      case 'system':
        return <Info className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Bot className="w-5 h-5" />;
    }
  };

  const getMessageStyles = () => {
    switch (role) {
      case 'user':
        return 'message-user ml-auto';
      case 'assistant':
        return 'message-assistant mr-auto';
      case 'system':
        return 'message-system';
      case 'error':
        return 'message-error';
      default:
        return 'message-assistant mr-auto';
    }
  };

  const getContainerStyles = () => {
    switch (role) {
      case 'user':
        return 'flex justify-end';
      case 'system':
      case 'error':
        return 'flex justify-center';
      default:
        return 'flex justify-start';
    }
  };

  return (
    <div className={`${getContainerStyles()} animate-slide-up`}>
      <div className="flex flex-col max-w-full">
        {/* Message Header (for assistant messages) */}
        {(role === 'assistant' || role === 'system' || role === 'error') && (
          <div className="flex items-center space-x-2 mb-2 px-1">
            <div className={`
              flex items-center justify-center w-8 h-8 rounded-full
              ${role === 'assistant' ? 'bg-chat-assistant text-white' : ''}
              ${role === 'system' ? 'bg-chat-system text-white' : ''}
              ${role === 'error' ? 'bg-chat-error text-white' : ''}
            `}>
              {getMessageIcon()}
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-medium ${classes.text.primary}`}>
                {role === 'assistant' ? 'AWS Pricing Assistant' : 
                 role === 'system' ? 'System' : 'Error'}
              </span>
              <span className={`text-xs ${classes.text.muted}`}>
                {formatTime(timestamp)}
              </span>
            </div>
          </div>
        )}

        {/* Message Content */}
        <div className={getMessageStyles()}>
          {/* Message Text */}
          <div className="prose prose-invert prose-sm max-w-none break-words">
            {role === 'user' ? (
              // User messages don't need markdown parsing, just preserve whitespace
              <div className="whitespace-pre-wrap">{content}</div>
            ) : (
              // Assistant messages should be parsed as markdown
              <>
                {isTyping && (
                  // Show typing indicator when typing (even with content)
                  <div className={`flex items-center space-x-2 ${classes.text.muted} py-2 mb-2`}>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-sm">Generating response...</span>
                  </div>
                )}
                
                {content && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Custom styling for markdown elements
                      h1: ({ children }) => <h1 className={`text-xl font-bold mb-3 ${classes.text.primary}`}>{children}</h1>,
                      h2: ({ children }) => <h2 className={`text-lg font-semibold mb-2 ${classes.text.primary}`}>{children}</h2>,
                      h3: ({ children }) => <h3 className={`text-base font-medium mb-2 ${classes.text.primary}`}>{children}</h3>,
                      p: ({ children }) => <p className={`mb-2 ${classes.text.primary} leading-relaxed`}>{children}</p>,
                      ul: ({ children }) => <ul className={`list-disc list-inside mb-2 space-y-1 ${classes.text.primary}`}>{children}</ul>,
                      ol: ({ children }) => <ol className={`list-decimal list-inside mb-2 space-y-1 ${classes.text.primary}`}>{children}</ol>,
                      li: ({ children }) => <li className={classes.text.primary}>{children}</li>,
                      strong: ({ children }) => <strong className={`font-semibold ${classes.text.primary}`}>{children}</strong>,
                      em: ({ children }) => <em className={`italic ${classes.text.primary}`}>{children}</em>,
                      code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className={`${classes.bg.surface} px-1.5 py-0.5 rounded text-sm font-mono ${classes.accent}`}>
                            {children}
                          </code>
                        ) : (
                          <code className={className}>{children}</code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className={`${classes.bg.surface} p-3 rounded-lg overflow-x-auto mb-3 border ${classes.border}`}>
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className={`border-l-4 border-${theme === 'dark' ? 'dark' : 'light'}-accent-primary pl-4 italic ${classes.text.secondary} mb-3`}>
                          {children}
                        </blockquote>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto mb-3">
                          <table className={`min-w-full border ${classes.border} rounded-lg`}>
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className={classes.bg.surface}>
                          {children}
                        </thead>
                      ),
                      th: ({ children }) => (
                        <th className={`px-3 py-2 text-left text-sm font-medium ${classes.text.primary} border-b ${classes.border}`}>
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className={`px-3 py-2 text-sm ${classes.text.primary} border-b ${classes.border}`}>
                          {children}
                        </td>
                      ),
                      a: ({ children, href }) => (
                        <a 
                          href={href} 
                          className={`${classes.accent} hover:text-${theme === 'dark' ? 'dark' : 'light'}-accent-secondary underline`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                )}
              </>
            )}
          </div>

          {/* User Message Timestamp */}
          {role === 'user' && (
            <div className="text-xs text-white/70 mt-1 text-right">
              {formatTime(timestamp)}
            </div>
          )}
        </div>

        {/* Metadata and Export button (for assistant messages) */}
        {role === 'assistant' && (metadata || !isTyping) && (
          <div className={`flex justify-between items-center mt-2`}>
            {/* Metadata */}
            {metadata && (
              <div className={`text-xs ${classes.text.muted}`}>
                <div className="flex flex-wrap gap-3">
                  {metadata.model && (
                    <span>Model: {metadata.model}</span>
                  )}
                  {metadata.inputTokens && (
                    <span>Input: {metadata.inputTokens} tokens</span>
                  )}
                  {metadata.outputTokens && (
                    <span>Output: {metadata.outputTokens} tokens</span>
                  )}
                  {metadata.latency && (
                    <span>Response: {metadata.latency}ms</span>
                  )}
                  {metadata.toolsUsed && metadata.toolsUsed.length > 0 && (
                    <span>Tools: {[...new Set(metadata.toolsUsed)].join(', ')}</span>
                  )}
                </div>
              </div>
            )}

            {/* Export button */}
            {!isTyping && (
              <button
                onClick={exportAsMarkdown}
                className={`flex items-center space-x-1 px-2 py-1 text-xs rounded-lg transition-colors duration-200 ${classes.text.muted} hover:${classes.text.primary} hover:${classes.bg.surface} ml-auto`}
                title="Export as Markdown"
              >
                <Download className="w-3 h-3" />
                <span>Export</span>
              </button>
            )}
          </div>
        )}

        {/* Pricing Information */}
        {pricing && (
          <div className="mt-3 max-w-full">
            <PricingDisplay pricing={pricing} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
