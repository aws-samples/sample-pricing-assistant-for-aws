import { mcpService, PricingQuery } from '@/services/mcpService.js';
import { logger } from '@/utils/logger.js';

export interface PricingContext {
  hasPricingData: boolean;
  services?: string[];
  regions?: string[];
  pricingData?: any[];
  error?: string;
}

/**
 * Service to integrate pricing data with chat responses
 */
export class PricingIntegrationService {
  
  /**
   * Detect if a message contains pricing-related queries
   */
  private detectPricingQuery(message: string): {
    isPricingQuery: boolean;
    services: string[];
    regions: string[];
  } {
    const lowerMessage = message.toLowerCase();
    
    // Common pricing keywords
    const pricingKeywords = [
      'cost', 'price', 'pricing', 'expensive', 'cheap', 'budget',
      'bill', 'charge', 'fee', 'rate', 'estimate', 'calculator',
      'how much', 'what does', 'costs for', 'price of'
    ];

    // AWS service patterns
    const servicePatterns = {
      'ec2': ['ec2', 'instance', 'virtual machine', 'compute'],
      's3': ['s3', 'storage', 'bucket', 'object storage'],
      'lambda': ['lambda', 'function', 'serverless'],
      'rds': ['rds', 'database', 'mysql', 'postgres', 'aurora'],
      'cloudfront': ['cloudfront', 'cdn', 'content delivery'],
      'route53': ['route53', 'dns', 'domain'],
      'elb': ['load balancer', 'elb', 'alb', 'nlb'],
      'vpc': ['vpc', 'network', 'subnet', 'nat gateway'],
    };

    // Region patterns
    const regionPatterns = [
      'us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1',
      'virginia', 'oregon', 'ireland', 'singapore',
      'us east', 'us west', 'europe', 'asia pacific'
    ];

    const isPricingQuery = pricingKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );

    const detectedServices: string[] = [];
    for (const [service, patterns] of Object.entries(servicePatterns)) {
      if (patterns.some(pattern => lowerMessage.includes(pattern))) {
        detectedServices.push(service);
      }
    }

    const detectedRegions = regionPatterns.filter(region => 
      lowerMessage.includes(region.toLowerCase())
    );

    return {
      isPricingQuery,
      services: detectedServices,
      regions: detectedRegions,
    };
  }

  /**
   * Get pricing context for a chat message
   */
  async getPricingContext(message: string): Promise<PricingContext> {
    try {
      const detection = this.detectPricingQuery(message);
      
      if (!detection.isPricingQuery) {
        return { hasPricingData: false };
      }

      logger.info('Pricing query detected', {
        services: detection.services,
        regions: detection.regions,
      });

      // If specific services are detected, try to get pricing data
      if (detection.services.length > 0) {
        const pricingData: any[] = [];
        
        for (const service of detection.services.slice(0, 3)) { // Limit to 3 services
          try {
            // Map common service names to AWS service codes
            const serviceCodeMap: Record<string, string> = {
              'ec2': 'AmazonEC2',
              's3': 'AmazonS3',
              'lambda': 'AWSLambda',
              'rds': 'AmazonRDS',
              'cloudfront': 'AmazonCloudFront',
              'route53': 'AmazonRoute53',
              'elb': 'AWSELB',
              'vpc': 'AmazonVPC',
            };

            const serviceCode = serviceCodeMap[service];
            if (!serviceCode) continue;

            const query: PricingQuery = {
              service: serviceCode,
              region: detection.regions[0] || 'us-west-2',
              filters: this.getDefaultFilters(service) || {},
            };

            const result = await mcpService.getPricing(query);
            pricingData.push({
              service: service,
              serviceCode: serviceCode,
              region: query.region,
              data: result.pricing.slice(0, 5), // Limit results
            });

          } catch (error) {
            logger.warn('Failed to get pricing for service', {
              service,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return {
          hasPricingData: true,
          services: detection.services,
          regions: detection.regions,
          pricingData,
        };
      }

      return {
        hasPricingData: true,
        services: detection.services,
        regions: detection.regions,
      };

    } catch (error) {
      logger.error('Failed to get pricing context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        hasPricingData: false,
        error: 'Failed to retrieve pricing information',
      };
    }
  }

  /**
   * Get default filters for common services
   */
  private getDefaultFilters(service: string): Record<string, any> | undefined {
    const defaultFilters: Record<string, Record<string, any>> = {
      'ec2': {
        'tenancy': 'Shared',
        'operatingSystem': 'Linux',
      },
      's3': {
        'storageClass': 'Standard',
      },
      'lambda': {
        // Lambda doesn't typically need filters for basic pricing
      },
      'rds': {
        'deploymentOption': 'Single-AZ',
      },
    };

    return defaultFilters[service];
  }

  /**
   * Format pricing data for inclusion in chat context
   */
  formatPricingForContext(pricingContext: PricingContext): string {
    if (!pricingContext.hasPricingData || !pricingContext.pricingData) {
      return '';
    }

    let contextString = '\n\n--- CURRENT PRICING DATA ---\n';
    
    for (const serviceData of pricingContext.pricingData) {
      contextString += `\n${serviceData.service.toUpperCase()} (${serviceData.region}):\n`;
      
      if (serviceData.data && serviceData.data.length > 0) {
        for (const item of serviceData.data.slice(0, 3)) {
          if (item.terms && item.terms.OnDemand) {
            const onDemandTerms = Object.values(item.terms.OnDemand)[0] as any;
            if (onDemandTerms && onDemandTerms.priceDimensions) {
              const priceDimension = Object.values(onDemandTerms.priceDimensions)[0] as any;
              if (priceDimension) {
                contextString += `- ${item.product?.attributes?.instanceType || 'Standard'}: ${priceDimension.pricePerUnit?.USD || 'N/A'} USD ${priceDimension.unit || ''}\n`;
              }
            }
          }
        }
      } else {
        contextString += `- No specific pricing data available\n`;
      }
    }

    contextString += '\n--- END PRICING DATA ---\n\n';
    contextString += 'Use this pricing data to provide accurate cost estimates in your response. ';
    contextString += 'Always mention that prices may vary and users should check the AWS Pricing Calculator for the most current information.\n';

    return contextString;
  }

  /**
   * Health check for pricing integration
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await mcpService.healthCheck();
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const pricingIntegrationService = new PricingIntegrationService();
