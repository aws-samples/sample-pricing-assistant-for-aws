import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger, logError } from './logger.js';

// Custom error classes
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(message: string, statusCode: number = 500, code?: string, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (code) {
      this.code = code;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, _details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class BedrockError extends AppError {
  constructor(message: string, _originalError?: Error) {
    super(message, 502, 'BEDROCK_ERROR');
    this.name = 'BedrockError';
  }
}

export class MCPError extends AppError {
  constructor(message: string, _originalError?: Error) {
    super(message, 502, 'MCP_ERROR');
    this.name = 'MCPError';
  }
}

export class FileProcessingError extends AppError {
  constructor(message: string, _filename?: string) {
    super(message, 422, 'FILE_PROCESSING_ERROR');
    this.name = 'FileProcessingError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

// Error response interface
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

// Create standardized error response
export const createErrorResponse = (
  error: Error,
  requestId?: string,
  details?: any
): ErrorResponse => {
  const isAppError = error instanceof AppError;
  
  const errorResponse: any = {
    error: {
      code: isAppError ? error.code || 'INTERNAL_ERROR' : 'INTERNAL_ERROR',
      message: isAppError ? error.message : 'An unexpected error occurred',
      details,
      timestamp: new Date().toISOString(),
    },
  };

  if (requestId) {
    errorResponse.error.requestId = requestId;
  }

  return errorResponse;
};

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string;

  // Log the error
  logError('Request error', error, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationError = new ValidationError('Invalid request data');
    const errorResponse = createErrorResponse(validationError, requestId, {
      validationErrors: error.errors,
    });
    res.status(400).json(errorResponse);
    return;
  }

  // Handle custom app errors
  if (error instanceof AppError) {
    const errorResponse = createErrorResponse(error, requestId);
    res.status(error.statusCode).json(errorResponse);
    return;
  }

  // Handle unexpected errors
  const internalError = new AppError('Internal server error', 500, 'INTERNAL_ERROR', false);
  const errorResponse = createErrorResponse(internalError, requestId);
  res.status(500).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND');
  next(error);
};

// Graceful shutdown handler
export const gracefulShutdown = (server: any, cleanup?: () => void) => {
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    // Run cleanup function if provided
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during cleanup', error);
      }
    }
    
    server.close((err: Error) => {
      if (err) {
        logError('Error during server shutdown', err);
        process.exit(1);
      }
      
      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

// Unhandled rejection and exception handlers
export const setupProcessHandlers = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection', {
      reason: reason?.toString(),
      stack: reason?.stack,
      promise: promise.toString(),
    });
    
    // Don't exit in development
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logError('Uncaught Exception', error);
    
    // Always exit on uncaught exceptions
    process.exit(1);
  });
};
