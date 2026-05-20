import React from 'react';
import { MessageSquare, Moon, Sun, RotateCcw, HelpCircle, Settings, LogOut } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useChat } from '../hooks/useChat';
import { useModel } from '../hooks/useModel';
import { useAuth } from '../hooks/useAuth';
import ModelSelector from './ModelSelector';

interface HeaderProps {
  onOpenAdmin?: (() => void) | undefined;
}

const Header: React.FC<HeaderProps> = ({ onOpenAdmin }) => {
  const { theme, toggleTheme } = useTheme();
  const { clearMessages, state } = useChat();
  const { selectedModel, setSelectedModel } = useModel();
  const { user, signOut, config } = useAuth();

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      clearMessages();
    }
  };

  return (
    <header className={`sticky top-0 z-50 backdrop-blur-sm transition-colors duration-200 border-b ${
      theme === 'dark'
        ? 'bg-dark-surface-primary/95 border-dark-border'
        : 'bg-light-surface-primary/95 border-light-border'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-primary-600 rounded-lg flex-shrink-0">
              <MessageSquare className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className={`text-lg sm:text-xl font-bold truncate ${
                theme === 'dark' ? 'text-dark-text-primary' : 'text-light-text-primary'
              }`}>
                AWS Pricing Assistant
              </h1>
              <p className={`text-xs sm:text-sm hidden sm:block ${
                theme === 'dark' ? 'text-dark-text-muted' : 'text-light-text-muted'
              }`}>
                Get accurate cost estimates for AWS services
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-1 sm:space-x-3 flex-shrink-0">
            {/* Model Selector */}
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              disabled={state.isLoading}
            />

            {/* Help Button - Hidden on mobile */}
            <button
              className={`hidden sm:flex p-2 rounded-lg transition-colors duration-200 focus-ring ${
                theme === 'dark'
                  ? 'text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-card'
                  : 'text-light-text-muted hover:text-light-text-primary hover:bg-light-card'
              }`}
              title="Help & Documentation"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Clear Chat Button */}
            {state.messages.length > 1 && (
              <button
                onClick={handleClearChat}
                className={`p-2 rounded-lg transition-colors duration-200 focus-ring ${
                  theme === 'dark'
                    ? 'text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-card'
                    : 'text-light-text-muted hover:text-light-text-primary hover:bg-light-card'
                }`}
                title="Clear chat history"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors duration-200 focus-ring ${
                theme === 'dark'
                  ? 'text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-card'
                  : 'text-light-text-muted hover:text-light-text-primary hover:bg-light-card'
              }`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>

            {/* Admin Panel — only when auth is enabled and the user is in the Admins group */}
            {onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className={`p-2 rounded-lg transition-colors duration-200 focus-ring ${
                  theme === 'dark'
                    ? 'text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-card'
                    : 'text-light-text-muted hover:text-light-text-primary hover:bg-light-card'
                }`}
                title="User & MFA management"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Sign out — only when auth is enabled */}
            {config?.enabled && user && (
              <div className="flex items-center gap-2">
                <span
                  className={`hidden md:inline text-xs ${
                    theme === 'dark' ? 'text-dark-text-muted' : 'text-light-text-muted'
                  }`}
                  title={user.email || user.username}
                >
                  {user.name || user.email || user.username}
                </span>
                <button
                  onClick={signOut}
                  className={`p-2 rounded-lg transition-colors duration-200 focus-ring ${
                    theme === 'dark'
                      ? 'text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-card'
                      : 'text-light-text-muted hover:text-light-text-primary hover:bg-light-card'
                  }`}
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection Status */}
      {state.conversationId && (
        <div className="bg-green-500/10 border-b border-green-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center py-2">
              <div className="flex items-center space-x-2 text-sm text-green-400">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Connected to AWS Pricing Assistant</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
