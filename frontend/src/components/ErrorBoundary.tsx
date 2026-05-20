import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Log error to monitoring service in production
    if (import.meta.env.PROD) {
      // TODO: Send error to monitoring service
      console.error('Production error:', {
        error: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-bg text-dark-text-primary flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center w-16 h-16 bg-chat-error/20 rounded-full">
                <AlertTriangle className="w-8 h-8 text-chat-error" />
              </div>
            </div>

            {/* Error Message */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-dark-text-primary mb-2">
                Something went wrong
              </h1>
              <p className="text-dark-text-secondary">
                We're sorry, but something unexpected happened. The error has been logged and we'll look into it.
              </p>
            </div>

            {/* Error Details (Development Only) */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-4 bg-dark-card border border-dark-border rounded-lg">
                <h3 className="text-sm font-semibold text-dark-text-primary mb-2">
                  Error Details (Development)
                </h3>
                <div className="text-xs text-dark-text-muted space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-1 p-2 bg-gray-900 rounded text-xs overflow-x-auto">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 p-2 bg-gray-900 rounded text-xs overflow-x-auto">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 focus-ring"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Page</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-dark-card hover:bg-gray-700 text-dark-text-primary border border-dark-border rounded-lg transition-colors duration-200 focus-ring"
              >
                <Home className="w-4 h-4" />
                <span>Go Home</span>
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-6 text-center text-sm text-dark-text-muted">
              If this problem persists, please try refreshing the page or contact support.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
