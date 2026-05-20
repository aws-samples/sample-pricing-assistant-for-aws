import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { authFetch } from '../hooks/useAuth';

interface FileUploadProps {
  onFileUploaded: (fileData: UploadedFileData[]) => void;
  onClose: () => void;
  isOpen: boolean;
}

interface UploadedFileData {
  fileId: string;
  filename: string;
  size: number;
  type: 'cloudformation' | 'terraform' | 'cdk' | 'pulumi' | 'unknown';
  message: string;
  uploadedAt: string;
}

interface UploadError {
  message: string;
  code: string;
  details?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded, onClose, isOpen }) => {
  const { theme } = useTheme();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<UploadedFileData[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supported file extensions
  const supportedExtensions = [
    '.json', '.yaml', '.yml', '.tf', '.tfvars', 
    '.ts', '.js', '.py', '.go', '.cs'
  ];

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
          overlay: 'bg-black/50',
          modal: 'bg-dark-surface-primary',
          card: 'bg-dark-card',
          surface: 'bg-dark-surface-secondary',
        },
        border: 'border-dark-border',
        hover: {
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
          overlay: 'bg-black/30',
          modal: 'bg-light-surface-primary',
          card: 'bg-light-card',
          surface: 'bg-light-surface-secondary',
        },
        border: 'border-light-border',
        hover: {
          bg: 'hover:bg-light-card',
        }
      };
    }
  };

  const classes = getThemeClasses();

  // File validation
  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return { isValid: false, error: 'File size must be less than 10MB' };
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!supportedExtensions.includes(extension)) {
      return { 
        isValid: false, 
        error: `Unsupported file type. Supported: ${supportedExtensions.join(', ')}` 
      };
    }

    return { isValid: true };
  };

  // Upload file to backend
  const uploadFile = async (file: File): Promise<UploadedFileData> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await authFetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Upload failed');
    }

    return result;
  };

  // Handle file selection/drop
  // Handle multiple files selection/drop
  const handleFiles = useCallback(async (files: File[]) => {
    setUploadError(null);
    setUploadSuccess(null);

    // Validate all files first
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.isValid) {
        setUploadError({
          message: `${file.name}: ${validation.error!}`,
          code: 'VALIDATION_ERROR'
        });
        return;
      }
    }

    setIsUploading(true);

    try {
      const uploadPromises = files.map(file => uploadFile(file));
      const results = await Promise.all(uploadPromises);
      setUploadSuccess(results);
      onFileUploaded(results);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError({
        message: error instanceof Error ? error.message : 'Upload failed',
        code: 'UPLOAD_ERROR'
      });
    } finally {
      setIsUploading(false);
    }
  }, [onFileUploaded]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  // File input change handler
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  }, [handleFiles]);

  // Click to select file
  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Reset state when closing
  const handleClose = useCallback(() => {
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(false);
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${classes.bg.overlay}`}>
      <div className={`relative w-full max-w-md ${classes.bg.modal} rounded-lg shadow-xl border ${classes.border}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-lg font-semibold ${classes.text.primary}`}>
            Upload Infrastructure File
          </h2>
          <button
            onClick={handleClose}
            className={`p-1 ${classes.text.muted} ${classes.hover.bg} rounded transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload Area */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragOver 
                ? 'border-primary-500 bg-primary-500/10' 
                : `${classes.border} ${classes.bg.surface}`
              }
              ${!isUploading && !uploadSuccess ? 'cursor-pointer hover:border-primary-400' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={!isUploading && !uploadSuccess ? handleSelectFile : undefined}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={supportedExtensions.join(',')}
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              disabled={isUploading || !!uploadSuccess}
            />

            {/* Upload States */}
            {isUploading ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-primary-500 animate-spin" />
                <div>
                  <p className={`font-medium ${classes.text.primary}`}>Uploading...</p>
                  <p className={`text-sm ${classes.text.muted}`}>
                    Validating and processing your file
                  </p>
                </div>
              </div>
            ) : uploadSuccess ? (
              <div className="space-y-4">
                <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
                <div>
                  <p className={`font-medium ${classes.text.primary}`}>
                    {uploadSuccess.length === 1 ? 'Upload Successful!' : `${uploadSuccess.length} Files Uploaded!`}
                  </p>
                  {uploadSuccess.map((file) => (
                    <div key={file.fileId} className="mt-2">
                      <p className={`text-sm ${classes.text.secondary}`}>
                        {file.filename}
                      </p>
                      <p className={`text-xs ${classes.text.muted}`}>
                        Detected as {file.type} file
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : uploadError ? (
              <div className="space-y-4">
                <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
                <div>
                  <p className={`font-medium text-red-500`}>Upload Failed</p>
                  <p className={`text-sm ${classes.text.secondary}`}>
                    {uploadError.message}
                  </p>
                  {uploadError.details && (
                    <p className={`text-xs ${classes.text.muted} mt-1`}>
                      {uploadError.details}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setUploadError(null)}
                  className="text-sm text-primary-500 hover:text-primary-400 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className={`w-12 h-12 mx-auto ${classes.text.muted}`} />
                <div>
                  <p className={`font-medium ${classes.text.primary}`}>
                    Drop your file here or click to browse
                  </p>
                  <p className={`text-sm ${classes.text.muted} mt-2`}>
                    Supports CloudFormation, Terraform, CDK, and Pulumi files
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Supported File Types */}
          {!uploadSuccess && !uploadError && (
            <div className="mt-6">
              <h3 className={`text-sm font-medium ${classes.text.primary} mb-2`}>
                Supported File Types:
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`flex items-center space-x-2 ${classes.text.muted}`}>
                  <FileText className="w-3 h-3" />
                  <span>CloudFormation (.json, .yaml, .yml)</span>
                </div>
                <div className={`flex items-center space-x-2 ${classes.text.muted}`}>
                  <FileText className="w-3 h-3" />
                  <span>Terraform (.tf, .tfvars)</span>
                </div>
                <div className={`flex items-center space-x-2 ${classes.text.muted}`}>
                  <FileText className="w-3 h-3" />
                  <span>CDK (.ts, .js, .py)</span>
                </div>
                <div className={`flex items-center space-x-2 ${classes.text.muted}`}>
                  <FileText className="w-3 h-3" />
                  <span>Pulumi (.py, .go, .cs)</span>
                </div>
              </div>
              <p className={`text-xs ${classes.text.muted} mt-3`}>
                Maximum file size: 10MB
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={handleClose}
              className={`px-4 py-2 text-sm font-medium ${classes.text.secondary} ${classes.hover.bg} border ${classes.border} rounded-lg transition-colors`}
            >
              {uploadSuccess ? 'Done' : 'Cancel'}
            </button>
            {uploadSuccess && (
              <button
                onClick={() => {
                  setUploadSuccess(null);
                  setUploadError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
              >
                Upload Another
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
