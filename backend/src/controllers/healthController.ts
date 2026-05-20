import { Request, Response } from 'express';
import { bedrockService } from '@/services/bedrockService.js';
import { bedrockToolService } from '@/services/bedrockToolService.js';
import { webSocketService } from '@/services/WebSocketService.js';
import { logger } from '@/utils/logger.js';
import { asyncHandler } from '@/utils/errors.js';

/**
 * Health check endpoint
 */
export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const startTime = Date.now();

  logger.info('Health check requested', { requestId });

  try {
    // For now, just check if Bedrock services are configured properly
    const bedrockConfigured = bedrockService.isConfigured();
    const bedrockToolsConfigured = bedrockToolService.getModelInfo().toolsEnabled;
    
    const responseTime = Date.now() - startTime;
    const status = (bedrockConfigured && bedrockToolsConfigured) ? 'ok' : 'degraded';

    const healthResponse = {
      status,
      timestamp: new Date().toISOString(),
      services: {
        bedrock: bedrockConfigured ? 'configured' : 'not_configured',
        bedrock_tools: bedrockToolsConfigured ? 'configured' : 'not_configured',
        websocket: 'configured',
      },
      version: '1.0.0',
      uptime: process.uptime(),
      responseTime,
      modelInfo: bedrockService.getModelInfo(),
      toolInfo: bedrockToolService.getModelInfo(),
      websocketStats: webSocketService.getStats(),
    };

    logger.info('Health check completed', {
      requestId,
      status,
      responseTime,
      bedrockConfigured,
    });

    // Always return 200 for basic health check - detailed checks can be done via /ready
    res.status(200).json(healthResponse);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Health check failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    });

    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      services: {
        bedrock: 'error',
      },
      version: '1.0.0',
      uptime: process.uptime(),
      responseTime,
      error: 'Health check failed',
    });
  }
});

/**
 * Readiness check (for Kubernetes/container orchestration)
 * This performs actual connectivity tests and may take longer
 */
export const readinessCheck = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const startTime = Date.now();

  logger.info('Readiness check requested', { requestId });

  try {
    // Perform actual Bedrock connectivity tests
    const bedrockHealthy = await bedrockService.healthCheck();
    const bedrockToolsHealthy = await bedrockToolService.healthCheck();
    const responseTime = Date.now() - startTime;

    const allHealthy = bedrockHealthy && bedrockToolsHealthy;

    const readinessResponse = {
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      services: {
        bedrock: bedrockHealthy ? 'healthy' : 'unhealthy',
        bedrock_tools: bedrockToolsHealthy ? 'healthy' : 'unhealthy',
      },
      version: '1.0.0',
      responseTime,
      checks: {
        bedrock_connectivity: bedrockHealthy,
        bedrock_tools_connectivity: bedrockToolsHealthy,
      },
    };

    logger.info('Readiness check completed', {
      requestId,
      bedrockHealthy,
      bedrockToolsHealthy,
      responseTime,
    });

    // Return 503 if not ready
    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(readinessResponse);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Readiness check failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    });

    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      services: {
        bedrock: 'error',
        bedrock_tools: 'error',
      },
      version: '1.0.0',
      responseTime,
      error: 'Readiness check failed',
    });
  }
});

/**
 * Liveness check (for Kubernetes/container orchestration)
 */
export const livenessCheck = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;

  // Simple liveness check - just verify the process is running
  logger.info('Liveness check requested', { requestId });

  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});
