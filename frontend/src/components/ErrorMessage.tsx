import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useChat } from '../hooks/useChat';

interface ErrorMessageProps {
  error: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
  const { setError } = useChat();

  const handleDismiss = () => {
    setError(null);
  };

  const handleRetry = () => {
    setError(null);
    // Could implement retry logic here if needed
  };

  return (
    <div className="flex justify-center animate-slide-up">
      <div className="bg-chat-error/10 border border-chat-error/20 rounded-lg p-4 max-w-md w-full">
        <div className="flex items-start space-x-3">
          {/* Error Icon */}
          <div className="flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-chat-error" />
          </div>

          {/* Error Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-chat-error mb-1">
              Something went wrong
            </h3>
            <p className="text-sm text-dark-text-secondary">
              {error}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 mt-4">
          <button
            onClick={handleRetry}
            className="flex items-center space-x-1 px-3 py-1.5 text-sm text-chat-error hover:bg-chat-error/10 rounded transition-colors duration-200 focus-ring"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-sm text-dark-text-muted hover:text-dark-text-primary rounded transition-colors duration-200 focus-ring"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;
