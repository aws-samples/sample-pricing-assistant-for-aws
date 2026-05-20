import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, serverConfig, authConfig } from './config/index.js';
import { errorHandler, notFoundHandler, setupProcessHandlers, gracefulShutdown } from './utils/errors.js';
import { logger, loggerStream } from './utils/logger.js';
import { webSocketService } from './services/WebSocketService.js';
import { apiLimiter } from './middleware/rateLimiter.js';

// Import routes
import chatRoutes from './routes/chat.js';
import pricingRoutes from './routes/pricing.js';
import fileRoutes from './routes/files.js';
import adminRoutes from './routes/admin.js';
import meRoutes from './routes/me.js';
import { healthCheck, readinessCheck, livenessCheck } from './controllers/healthController.js';

const app = express();

// Setup process handlers
setupProcessHandlers();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: serverConfig.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', { stream: loggerStream }));

// Request ID middleware — always generate server-side, ignore client-supplied values
app.use((req, _res, next) => {
  req.headers['x-request-id'] = crypto.randomUUID();
  next();
});

// Health check endpoints
app.get('/health', healthCheck);
app.get('/ready', readinessCheck);
app.get('/alive', livenessCheck);

// Handle favicon requests to prevent 404 errors
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end(); // No content
});

// API info endpoint
app.get('/api', (_req, res) => {
  res.json({
    message: 'AWS Pricing Assistant API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      chat: '/api/chat',
      pricing: '/api/pricing',
      files: '/api/files',
      config: '/api/config',
      admin: '/api/admin',
    },
    features: {
      bedrock: 'enabled',
      model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      guardrails: 'configurable',
      pricing: 'enabled',
      mcpServer: 'integrated',
      fileUpload: 'enabled',
      auth: authConfig.enabled ? 'enabled' : 'disabled',
    },
  });
});

// Public auth-config endpoint — the SPA fetches this at startup to wire up
// Cognito. Only auth-related identifiers are exposed; all values are public
// (User Pool ID + App Client ID are not secrets).
app.get('/api/config', (_req, res) => {
  res.json({
    auth: {
      enabled: authConfig.enabled,
      userPoolId: authConfig.userPoolId || null,
      clientId: authConfig.clientId || null,
      region: authConfig.region || null,
    },
  });
});

// API routes with rate limiting
app.use('/api', apiLimiter); // Apply rate limiter to all API routes
app.use('/api/chat', chatRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/me', meRoutes);

// Future routes (will be added in upcoming sprints)
// Additional file analysis features will be added as Sprint 5 progresses

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(serverConfig.port, () => {
  logger.info(`🚀 AWS Pricing Assistant Backend started`, {
    port: serverConfig.port,
    nodeEnv: serverConfig.nodeEnv,
    corsOrigin: serverConfig.corsOrigin,
    bedrockModel: config.BEDROCK_MODEL_ID,
    region: config.AWS_REGION,
  });
});

// Initialize WebSocket service
webSocketService.initialize(server);

// Graceful shutdown
gracefulShutdown(server, () => {
  webSocketService.shutdown();
});

export default app;
