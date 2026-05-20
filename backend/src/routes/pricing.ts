import { Router } from 'express';
import {
  getServiceCodes,
  getPricing,
  getServiceAttributes,
  getAttributeValues,
  getMCPStatus,
} from '@/controllers/pricingController.js';

const router = Router();

/**
 * @route GET /api/pricing/services
 * @desc Get all available AWS service codes
 * @access Public
 */
router.get('/services', getServiceCodes);

/**
 * @route POST /api/pricing/query
 * @desc Get pricing information for a specific service
 * @access Public
 * @body {
 *   service: string,
 *   region?: string,
 *   filters?: Record<string, any>
 * }
 */
router.post('/query', getPricing);

/**
 * @route GET /api/pricing/services/:serviceCode/attributes
 * @desc Get available attributes for a specific service
 * @access Public
 */
router.get('/services/:serviceCode/attributes', getServiceAttributes);

/**
 * @route POST /api/pricing/services/:serviceCode/attribute-values
 * @desc Get valid values for specific attributes
 * @access Public
 * @body {
 *   attributeNames: string[]
 * }
 */
router.post('/services/:serviceCode/attribute-values', getAttributeValues);

/**
 * @route GET /api/pricing/status
 * @desc Get MCP server status and information
 * @access Public
 */
router.get('/status', getMCPStatus);

export default router;
