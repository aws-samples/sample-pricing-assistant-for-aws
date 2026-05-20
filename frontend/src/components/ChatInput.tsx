import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Loader2, X } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../hooks/useTheme';
import { useModel } from '../hooks/useModel';
import FileUpload from './FileUpload';

interface UploadedFileData {
  fileId: string;
  filename: string;
  size: number;
  type: 'cloudformation' | 'terraform' | 'cdk' | 'pulumi' | 'unknown';
  message: string;
  uploadedAt: string;
}

const ChatInput: React.FC = () => {
  const { state, sendMessage } = useChat();
  const { theme } = useTheme();
  const { selectedModel } = useModel();
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isFileUploadOpen, setIsFileUploadOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileData[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Focus input on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || state.isLoading) return;

    let message = input.trim();
    
    // If there are uploaded files, include them in the message
    if (uploadedFiles.length > 0) {
      if (uploadedFiles.length === 1) {
        message = `I've uploaded a ${uploadedFiles[0].type} file called "${uploadedFiles[0].filename}". ${message || 'Please analyze this file and provide cost estimates.'}`;
      } else {
        const fileList = uploadedFiles.map(f => `"${f.filename}" (${f.type})`).join(', ');
        message = `I've uploaded ${uploadedFiles.length} files: ${fileList}. ${message || 'Please analyze these files and provide cost estimates.'}`;
      }
    }
    
    // Extract fileIds before clearing uploadedFiles
    const fileIds = uploadedFiles.map(f => f.fileId);
    
    setInput('');
    setUploadedFiles([]); // Clear uploaded files after sending
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(message, true, selectedModel, fileIds.length > 0 ? fileIds : undefined);
  };

  // Handle file upload completion
  const handleFileUploaded = (fileDataArray: UploadedFileData[]) => {
    setUploadedFiles(prev => [...prev, ...fileDataArray]);
    setIsFileUploadOpen(false);
    
    // Auto-populate input with file analysis request
    if (!input.trim()) {
      if (fileDataArray.length === 1) {
        setInput('Please analyze this infrastructure file and provide cost estimates for the AWS resources.');
      } else {
        setInput('Please analyze these infrastructure files and provide cost estimates for the AWS resources.');
      }
    }
    
    // Focus on textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Handle file upload button click
  const handleFileUploadClick = () => {
    setIsFileUploadOpen(true);
  };

  // Remove uploaded file
  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.fileId !== fileId));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (but not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const isDisabled = state.isLoading || !input.trim();

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
          input: 'bg-dark-surface-primary',
        },
        border: 'border-dark-border',
        placeholder: 'placeholder-dark-text-muted',
        hover: {
          text: 'hover:text-dark-text-primary',
          bg: 'hover:bg-dark-card',
        }
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
          input: 'bg-light-surface-primary',
        },
        border: 'border-light-border',
        placeholder: 'placeholder-light-text-muted',
        hover: {
          text: 'hover:text-light-text-primary',
          bg: 'hover:bg-light-card',
        }
      };
    }
  };

  const classes = getThemeClasses();

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
        {/* Uploaded Files Display */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div key={file.fileId} className={`flex items-center justify-between p-3 ${classes.bg.card} border ${classes.border} rounded-lg`}>
                <div className="flex items-center space-x-3">
                  <Paperclip className={`w-4 h-4 ${classes.text.muted}`} />
                  <div>
                    <p className={`text-sm font-medium ${classes.text.primary}`}>
                      {file.filename}
                    </p>
                    <p className={`text-xs ${classes.text.muted}`}>
                      {file.type} • {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.fileId)}
                  className={`p-1 ${classes.text.muted} ${classes.hover.bg} rounded transition-colors`}
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Container */}
        <div className="relative flex items-end space-x-3">
          {/* File Upload Button */}
          <button
            type="button"
            onClick={handleFileUploadClick}
            className={`flex-shrink-0 p-2 ${classes.text.muted} ${classes.hover.text} ${classes.hover.bg} rounded-lg transition-colors duration-200 focus-ring`}
            title="Upload infrastructure file"
            disabled={state.isLoading}
          >
            <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

        {/* Text Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={window.innerWidth < 640 ? "Ask about AWS pricing..." : "Ask me about AWS pricing... (e.g., 'What does an EC2 t3.micro cost?')"}
            className={`w-full min-h-[44px] max-h-32 px-3 sm:px-4 py-3 pr-10 sm:pr-12 resize-none rounded-lg border transition-colors duration-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm sm:text-base leading-tight ${classes.bg.input} ${classes.border} ${classes.text.primary} ${classes.placeholder}`}
            disabled={state.isLoading}
            rows={1}
          />
          
          {/* Character count (optional) */}
          {input.length > 3000 && (
            <div className={`absolute bottom-1 right-10 sm:right-12 text-xs ${classes.text.muted}`}>
              {input.length}/4000
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={isDisabled}
          className={`
            flex-shrink-0 p-2 rounded-lg transition-all duration-200 focus-ring
            ${isDisabled 
              ? `${classes.text.muted} cursor-not-allowed` 
              : 'text-primary-500 hover:text-primary-400 hover:bg-primary-500/10'
            }
          `}
          title={isDisabled ? 'Enter a message to send' : 'Send message (Enter)'}
        >
          {state.isLoading ? (
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
          ) : (
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>
      </div>

      {/* Helper Text */}
      <div className={`flex items-center justify-between text-xs ${classes.text.muted}`}>
        <div className="flex items-center space-x-4">
          <span>Press Enter to send, Shift+Enter for new line</span>
          {state.isLoading && (
            <span className="flex items-center space-x-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Thinking...</span>
            </span>
          )}
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center space-x-2">
          {state.wsConnected ? (
            <span className="text-green-500 text-xs">● WebSocket Connected</span>
          ) : (
            <span className="text-red-500 text-xs">● WebSocket Disconnected</span>
          )}
        </div>
      </div>

      {/* Suggested Questions (when no conversation) - Hidden on mobile */}
      {state.messages.length === 1 && !state.isLoading && (
        <div className="mt-2 sm:mt-4 hidden sm:block">
          <p className={`text-xs sm:text-sm ${classes.text.muted} mb-1 sm:mb-3`}>Try asking:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2">
            {[
              "What's the cost of running a t3.micro EC2 instance?",
              "How much does S3 Standard storage cost?",
              "Compare Lambda vs EC2 pricing for small workloads",
              "What are the costs for a basic RDS MySQL database?"
            ].map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setInput(suggestion)}
                className={`text-left p-2 sm:p-3 text-xs sm:text-sm ${classes.bg.card} hover:bg-gray-700 border ${classes.border} rounded-lg transition-colors duration-200 focus-ring`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      </form>

      {/* File Upload Modal */}
      <FileUpload
        isOpen={isFileUploadOpen}
        onClose={() => setIsFileUploadOpen(false)}
        onFileUploaded={handleFileUploaded}
      />
    </>
  );
};

export default ChatInput;
