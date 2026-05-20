import winston from 'winston';
import { logConfig } from '@/config/index.js';

// Custom log format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// JSON format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: logConfig.level,
  format: logConfig.format === 'json' ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'aws-pricing-assistant-backend',
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
    
    // File transport for errors (production)
    ...(logConfig.format === 'json' ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        handleExceptions: true,
        handleRejections: true,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        handleExceptions: true,
        handleRejections: true,
      }),
    ] : []),
  ],
  exitOnError: false,
});

// Create a stream for Morgan HTTP logging
export const loggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Helper functions for structured logging
export const logError = (message: string, error: Error, meta?: object) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...meta,
  });
};

export const logRequest = (method: string, url: string, statusCode: number, responseTime: number, meta?: object) => {
  logger.info('HTTP Request', {
    method,
    url,
    statusCode,
    responseTime,
    ...meta,
  });
};

export const logBedrockCall = (modelId: string, inputTokens: number, outputTokens: number, latency: number) => {
  logger.info('Bedrock API Call', {
    modelId,
    inputTokens,
    outputTokens,
    latency,
    service: 'bedrock',
  });
};

export const logMCPCall = (method: string, params: object, responseTime: number, success: boolean) => {
  logger.info('MCP Server Call', {
    method,
    params,
    responseTime,
    success,
    service: 'mcp',
  });
};

export const logFileUpload = (filename: string, fileSize: number, fileType: string, processingTime: number) => {
  logger.info('File Upload Processed', {
    filename,
    fileSize,
    fileType,
    processingTime,
    service: 'file-parser',
  });
};
