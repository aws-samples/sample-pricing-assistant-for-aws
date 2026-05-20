import { PricingClient, GetProductsCommand, DescribeServicesCommand } from '@aws-sdk/client-pricing';
import { SavingsplansClient, DescribeSavingsPlansOfferingsCommand, DescribeSavingsPlansOfferingRatesCommand } from '@aws-sdk/client-savingsplans';
import { logger } from '@/utils/logger.js';

// Pricing API must use us-east-1
const pricingClient = new PricingClient({ region: 'us-east-1' });
const savingsPlansClient = new SavingsplansClient({ region: 'us-east-1' });

// Region display name mapping for Price List API filters
const REGION_MAP: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'eu-west-1': 'EU (Ireland)',
  'eu-west-2': 'EU (London)',
  'eu-west-3': 'EU (Paris)',
  'eu-central-1': 'EU (Frankfurt)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'sa-east-1': 'South America (Sao Paulo)',
  'ca-central-1': 'Canada (Central)',
};

function resolveRegionName(region: string): string {
  return REGION_MAP[region] || region;
}

export async function getPricing(params: { serviceCode: string; region?: string; filters?: Record<string, string>; maxResults?: number }): Promise<any> {
  const { serviceCode, region = 'us-east-1', filters = {}, maxResults = 10 } = params;
  logger.info('getPricing called', { serviceCode, region, filters, maxResults });

  const apiFilters = [
    { Type: 'TERM_MATCH' as const, Field: 'location', Value: resolveRegionName(region) },
  ];

  // Add user-specified filters (e.g. instanceType: "t3.micro")
  for (const [field, value] of Object.entries(filters)) {
    apiFilters.push({ Type: 'TERM_MATCH' as const, Field: field, Value: value });
  }

  const response = await pricingClient.send(new GetProductsCommand({
    ServiceCode: serviceCode,
    Filters: apiFilters,
    MaxResults: Math.min(maxResults, 100),
  }));

  // Parse and slim down the response to reduce token usage
  const products = (response.PriceList || []).map((p: string) => {
    const parsed = typeof p === 'string' ? JSON.parse(p) : p;
    const attrs = parsed.product?.attributes || {};
    const terms = parsed.terms || {};

    // Extract just On-Demand pricing
    const onDemand = terms.OnDemand ? Object.values(terms.OnDemand).map((term: any) => {
      const dims = Object.values(term.priceDimensions || {}) as any[];
      return dims.map((d: any) => ({
        unit: d.unit,
        pricePerUnit: d.pricePerUnit,
        description: d.description,
      }));
    }).flat() : [];

    return {
      attributes: attrs,
      onDemandPricing: onDemand,
    };
  });

  return { serviceCode, region, products, resultCount: products.length };
}

export async function getServiceCodes(params: { maxResults?: number }): Promise<any> {
  const { maxResults = 100 } = params;
  const response = await pricingClient.send(new DescribeServicesCommand({ MaxResults: Math.min(maxResults, 100) }));
  return { services: response.Services || [] };
}

export async function getServiceAttributes(params: { serviceCode: string }): Promise<any> {
  const response = await pricingClient.send(new DescribeServicesCommand({ ServiceCode: params.serviceCode }));
  return {
    serviceCode: params.serviceCode,
    attributes: response.Services?.[0]?.AttributeNames || [],
  };
}

export async function getSavingsPlans(params: { serviceCode?: string; planType?: string; region?: string }): Promise<any> {
  const { serviceCode, planType, region } = params;
  logger.info('getSavingsPlans called', { serviceCode, planType, region });

  const filters: any[] = [];
  if (region) filters.push({ name: 'region', values: [region] });
  if (serviceCode) filters.push({ name: 'serviceCode', values: [serviceCode] });

  const input: any = { maxResults: 25 };
  if (planType) input.planTypes = [planType];
  if (filters.length > 0) input.filters = filters;

  const response = await savingsPlansClient.send(new DescribeSavingsPlansOfferingsCommand(input));
  return { offerings: response.searchResults || [] };
}

export async function getSavingsPlansRates(params: { offeringId: string }): Promise<any> {
  logger.info('getSavingsPlansRates called', { offeringId: params.offeringId });

  const response = await savingsPlansClient.send(new DescribeSavingsPlansOfferingRatesCommand({
    savingsPlanOfferingIds: [params.offeringId],
    maxResults: 25,
  }));
  return { rates: response.searchResults || [] };
}

// Tool executor — called by the tool-use loop
export async function executeTool(toolName: string, input: any): Promise<string> {
  try {
    let result: any;
    switch (toolName) {
      case 'getPricing': result = await getPricing(input); break;
      case 'getServiceCodes': result = await getServiceCodes(input); break;
      case 'getServiceAttributes': result = await getServiceAttributes(input); break;
      case 'getSavingsPlans': result = await getSavingsPlans(input); break;
      case 'getSavingsPlansRates': result = await getSavingsPlansRates(input); break;
      default: result = { error: `Unknown tool: ${toolName}` };
    }
    return JSON.stringify(result);
  } catch (error) {
    logger.error('Tool execution failed', { toolName, error: error instanceof Error ? error.message : String(error) });
    return JSON.stringify({ error: `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}` });
  }
}
