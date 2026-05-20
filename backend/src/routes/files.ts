import { Router } from 'express';
import { uploadFile, getFileMetadata, parseFile, estimateFileCost, deleteFile } from '../controllers/fileController.js';
import { fileUploadLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/upload', requireAuth, fileUploadLimiter, uploadFile);
router.get('/:fileId/metadata', requireAuth, getFileMetadata);
router.get('/:fileId/parse', requireAuth, parseFile);
router.get('/:fileId/estimate', requireAuth, estimateFileCost);
router.delete('/:fileId', requireAuth, deleteFile);

export default router;
