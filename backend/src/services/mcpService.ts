import axios, { AxiosInstance } from 'axios';
import { mcpConfig } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface PricingQuery {
  service: string;
  region?: string;
  filters?: Record<string, any>;
}

export interface PricingResult {
  service: string;
  region: string;
  pricing: any[];
  metadata?: {
    queryTime: number;
    resultCount: number;
  };
}

/**
 * MCP Service for AWS Pricing integration
 * Connects to the AWS Pricing MCP Server to retrieve pricing data
 */
export class MCPService {
  private client: AxiosInstance;
  private requestId = 0;

  constructor() {
    this.client = axios.create({
      baseURL: mcpConfig.serverUrl,
      timeout: mcpConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use((config) => {
      logger.debug('MCP Request', {
        url: config.url,
        method: config.method,
        data: config.data,
      });
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('MCP Response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('MCP Request Error', {
          message: error.message,
          response: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a request to the MCP server with retry logic
   */
  private async makeRequest(method: string, params?: any): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    let lastError: Error = new Error('No attempts made');

    for (let attempt = 1; attempt <= mcpConfig.retryAttempts; attempt++) {
      try {
        logger.info('MCP request attempt', {
          method,
          attempt,
          requestId: request.id,
        });

        const response = await this.client.post('/mcp', request);
        const mcpResponse: MCPResponse = response.data;

        if (mcpResponse.error) {
          throw new Error(`MCP Error: ${mcpResponse.error.message}`);
        }

        logger.info('MCP request successful', {
          method,
          requestId: request.id,
          resultSize: JSON.stringify(mcpResponse.result).length,
        });

        return mcpResponse.result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown MCP error');
        
        logger.warn('MCP request failed', {
          method,
          attempt,
          error: lastError.message,
          willRetry: attempt < mcpConfig.retryAttempts,
        });

        if (attempt < mcpConfig.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, mcpConfig.retryDelay));
        }
      }
    }

    logger.error('MCP request failed after all retries', {
      method,
      attempts: mcpConfig.retryAttempts,
      error: lastError.message,
    });

    throw lastError;
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<any[]> {
    return this.makeRequest('tools/list');
  }

  /**
   * Get pricing information for a specific service
   */
  async getPricing(query: PricingQuery): Promise<PricingResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.makeRequest('tools/call', {
        name: 'get_pricing',
        arguments: {
          service_code: query.service,
          region: query.region || 'us-west-2',
          filters: query.filters,
        },
      });

      const queryTime = Date.now() - startTime;

      return {
        service: query.service,
        region: query.region || 'us-west-2',
        pricing: Array.isArray(result) ? result : [result],
        metadata: {
          queryTime,
          resultCount: Array.isArray(result) ? result.length : 1,
        },
      };
    } catch (error) {
      logger.error('Pricing query failed', {
        service: query.service,
        region: query.region,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get all available AWS service codes
   */
  async getServiceCodes(): Promise<string[]> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing_service_codes',
      arguments: {},
    });
  }

  /**
   * Get available attributes for a specific service
   */
  async getServiceAttributes(serviceCode: string): Promise<string[]> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing_service_attributes',
      arguments: { service_code: serviceCode },
    });
  }

  /**
   * Get valid values for specific attributes
   */
  async getAttributeValues(
    serviceCode: string,
    attributeNames: string[]
  ): Promise<Record<string, string[]>> {
    return this.makeRequest('tools/call', {
      name: 'get_pricing_attribute_values',
      arguments: {
        service_code: serviceCode,
        attribute_names: attributeNames,
      },
    });
  }

  /**
   * Health check for MCP server connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return Array.isArray(tools) && tools.length > 0;
    } catch (error) {
      logger.error('MCP health check failed', error);
      return false;
    }
  }

  /**
   * Get MCP server information
   */
  getServerInfo() {
    return {
      serverUrl: mcpConfig.serverUrl,
      timeout: mcpConfig.timeout,
      retryAttempts: mcpConfig.retryAttempts,
      retryDelay: mcpConfig.retryDelay,
    };
  }
}

// Export singleton instance
export const mcpService = new MCPService();
