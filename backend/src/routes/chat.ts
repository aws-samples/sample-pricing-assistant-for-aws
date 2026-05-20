import { Router } from 'express';
import {
  sendMessage,
  sendMessageStream,
  getConversation,
  deleteConversation,
  clearAllConversations,
  getChatStats,
} from '@/controllers/chatController.js';
import { validateRequest, chatRequestSchema } from '@/utils/validation.js';
import { chatLimiter } from '../middleware/rateLimiter.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/chat
 * Send a message to the AI assistant
 */
router.post('/', requireAuth, chatLimiter, validateRequest(chatRequestSchema), sendMessage);

/**
 * POST /api/chat/stream
 * Send a message to the AI assistant with streaming response
 */
router.post('/stream', requireAuth, chatLimiter, validateRequest(chatRequestSchema), sendMessageStream);

/**
 * GET /api/chat/stats
 * Get chat statistics (development/monitoring)
 */
router.get('/stats', requireAuth, requireAdmin, getChatStats);

/**
 * DELETE /api/chat/conversations
 * Clear all conversations (admin only)
 */
router.delete('/conversations', requireAuth, requireAdmin, clearAllConversations);

/**
 * GET /api/chat/conversations/:conversationId
 * Get conversation history
 */
router.get('/conversations/:conversationId', requireAuth, getConversation);

/**
 * DELETE /api/chat/conversations/:conversationId
 * Delete a specific conversation
 */
router.delete('/conversations/:conversationId', requireAuth, deleteConversation);

export default router;
