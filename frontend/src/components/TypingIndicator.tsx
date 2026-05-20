import React from 'react';
import { Bot } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const TypingIndicator: React.FC = () => {
  const { theme } = useTheme();

  // Theme-aware classes
  const getThemeClasses = () => {
    if (theme === 'dark') {
      return {
        text: {
          muted: 'text-dark-text-muted',
        },
        bg: {
          card: 'bg-dark-card',
        },
        border: 'border-dark-border',
      };
    } else {
      return {
        text: {
          muted: 'text-light-text-muted',
        },
        bg: {
          card: 'bg-light-card',
        },
        border: 'border-light-border',
      };
    }
  };

  const classes = getThemeClasses();

  return (
    <div className="flex items-start space-x-3 animate-slide-up">
      {/* Avatar */}
      <div className="flex items-center justify-center w-8 h-8 bg-chat-assistant rounded-full flex-shrink-0">
        <Bot className="w-5 h-5 text-white" />
      </div>

      {/* Typing Animation */}
      <div className={`${classes.bg.card} border ${classes.border} rounded-2xl rounded-bl-md px-4 py-3`}>
        <div className="flex items-center space-x-2">
          <span className={`text-sm ${classes.text.muted}`}>AWS Pricing Assistant is typing</span>
          <div className="flex space-x-1">
            <div className={`w-2 h-2 ${classes.text.muted} bg-current rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
            <div className={`w-2 h-2 ${classes.text.muted} bg-current rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
            <div className={`w-2 h-2 ${classes.text.muted} bg-current rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
