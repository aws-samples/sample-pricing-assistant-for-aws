import rateLimit from 'express-rate-limit';

// General API rate limiter - 100 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Chat endpoint rate limiter - 50 messages per minute
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 chat messages per minute
  message: 'Too many chat requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload rate limiter - 20 uploads per hour
export const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: 'Too many file uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
