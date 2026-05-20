import { Request, Response } from 'express';
import { z } from 'zod';
import { mcpService, PricingQuery } from '@/services/mcpService.js';
import { logger } from '@/utils/logger.js';
import { asyncHandler } from '@/utils/errors.js';

// Validation schemas
const pricingQuerySchema = z.object({
  service: z.string().min(1, 'Service code is required'),
  region: z.string().optional(),
  filters: z.record(z.any()).optional(),
});

const serviceAttributesSchema = z.object({
  serviceCode: z.string().min(1, 'Service code is required'),
});

const attributeValuesSchema = z.object({
  serviceCode: z.string().min(1, 'Service code is required'),
  attributeNames: z.array(z.string()).min(1, 'At least one attribute name is required'),
});

/**
 * Get all available AWS service codes
 */
export const getServiceCodes = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  
  logger.info('Getting AWS service codes', { requestId });

  try {
    const serviceCodes = await mcpService.getServiceCodes();
    
    logger.info('Service codes retrieved successfully', {
      requestId,
      count: serviceCodes.length,
    });

    return res.json({
      success: true,
      data: {
        serviceCodes,
        count: serviceCodes.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get service codes', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve service codes',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get pricing information for a specific service
 */
export const getPricing = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  
  logger.info('Pricing query requested', { requestId, body: req.body });

  try {
    // Validate request body
    const validatedData = pricingQuerySchema.parse(req.body);
    
    const query: PricingQuery = {
      service: validatedData.service,
      region: validatedData.region || 'us-west-2',
      filters: validatedData.filters || {},
    };

    const result = await mcpService.getPricing(query);
    
    logger.info('Pricing query completed', {
      requestId,
      service: query.service,
      region: query.region,
      resultCount: result.metadata?.resultCount,
      queryTime: result.metadata?.queryTime,
    });

    return res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid pricing query request', {
        requestId,
        errors: error.errors,
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
        timestamp: new Date().toISOString(),
      });
    }

    logger.error('Pricing query failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve pricing information',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get available attributes for a specific service
 */
export const getServiceAttributes = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const { serviceCode } = req.params;
  
  logger.info('Getting service attributes', { requestId, serviceCode });

  try {
    // Validate parameters
    const validatedData = serviceAttributesSchema.parse({ serviceCode });
    
    const attributes = await mcpService.getServiceAttributes(validatedData.serviceCode);
    
    logger.info('Service attributes retrieved', {
      requestId,
      serviceCode: validatedData.serviceCode,
      count: attributes.length,
    });

    return res.json({
      success: true,
      data: {
        serviceCode: validatedData.serviceCode,
        attributes,
        count: attributes.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid service attributes request', {
        requestId,
        errors: error.errors,
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors,
        timestamp: new Date().toISOString(),
      });
    }

    logger.error('Failed to get service attributes', {
      requestId,
      serviceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve service attributes',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get valid values for specific attributes
 */
export const getAttributeValues = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const { serviceCode } = req.params;
  
  logger.info('Getting attribute values', { requestId, serviceCode, body: req.body });

  try {
    // Validate request
    const validatedData = attributeValuesSchema.parse({
      serviceCode,
      attributeNames: req.body.attributeNames,
    });
    
    const attributeValues = await mcpService.getAttributeValues(
      validatedData.serviceCode,
      validatedData.attributeNames
    );
    
    logger.info('Attribute values retrieved', {
      requestId,
      serviceCode: validatedData.serviceCode,
      attributeCount: validatedData.attributeNames.length,
    });

    return res.json({
      success: true,
      data: {
        serviceCode: validatedData.serviceCode,
        attributeValues,
        requestedAttributes: validatedData.attributeNames,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid attribute values request', {
        requestId,
        errors: error.errors,
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
        timestamp: new Date().toISOString(),
      });
    }

    logger.error('Failed to get attribute values', {
      requestId,
      serviceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve attribute values',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get MCP server status and information
 */
export const getMCPStatus = asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  
  logger.info('MCP status requested', { requestId });

  try {
    const isHealthy = await mcpService.healthCheck();
    const serverInfo = mcpService.getServerInfo();
    
    logger.info('MCP status check completed', {
      requestId,
      isHealthy,
    });

    return res.json({
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        serverInfo,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('MCP status check failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to check MCP server status',
      timestamp: new Date().toISOString(),
    });
  }
});
