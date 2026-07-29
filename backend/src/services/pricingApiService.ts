import { PricingClient, GetProductsCommand, DescribeServicesCommand } from '@aws-sdk/client-pricing';
import { SavingsplansClient, DescribeSavingsPlansOfferingsCommand, DescribeSavingsPlansOfferingRatesCommand } from '@aws-sdk/client-savingsplans';
import { logger } from '@/utils/logger.js';

// Pricing API must use us-east-1
const pricingClient = new PricingClient({ region: 'us-east-1' });
const savingsPlansClient = new SavingsplansClient({ region: 'us-east-1' });

// The Price List API accepts `regionCode` (e.g. "eu-north-1") as a TERM_MATCH
// filter field, so no region-name lookup table is needed. A previous hardcoded
// map covered only 15 regions; anything outside it was passed through as a
// `location` value, matched no products, and returned an empty result set with
// no error — the same silent-empty failure mode as the PriceList parsing bug.

export async function getPricing(params: { serviceCode: string; region?: string; filters?: Record<string, string>; maxResults?: number }): Promise<any> {
  const { serviceCode, region = 'us-east-1', filters = {}, maxResults = 10 } = params;
  logger.info('getPricing called', { serviceCode, region, filters, maxResults });

  // A caller-supplied regionCode/location filter takes precedence over the
  // `region` parameter, so we don't send two conflicting location filters.
  const callerScopesRegion = Object.keys(filters).some(
    (f) => f === 'regionCode' || f === 'location'
  );

  const apiFilters = callerScopesRegion
    ? []
    : [{ Type: 'TERM_MATCH' as const, Field: 'regionCode', Value: region }];

  // Add user-specified filters (e.g. instanceType: "t3.micro")
  for (const [field, value] of Object.entries(filters)) {
    apiFilters.push({ Type: 'TERM_MATCH' as const, Field: field, Value: value });
  }

  const response = await pricingClient.send(new GetProductsCommand({
    ServiceCode: serviceCode,
    Filters: apiFilters,
    MaxResults: Math.min(maxResults, 100),
  }));

  // Parse and slim down the response to reduce token usage.
  //
  // PriceList entries must be normalized with String(p) before parsing. The
  // Pricing SDK returns them as *boxed* String objects, for which
  // `typeof p === 'string'` is false — a plain typeof check silently skips the
  // parse and spreads the JSON text into a char-indexed object ({'0':'{',...}),
  // so product/terms come back undefined and every price renders as empty.
  // String(p) handles primitive strings, boxed Strings, and Uint8Array alike.
  const products = (response.PriceList || []).map((p: unknown) => {
    const parsed = typeof p === 'object' && p !== null && !(p instanceof String)
      ? (p as any)
      : JSON.parse(String(p));
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

  // Make empty/degraded results self-describing. Previously a zero-result
  // lookup (or one whose prices failed to parse) was indistinguishable from
  // "this service has no pricing", so the model reported that rates were
  // unavailable rather than correcting its filters. Surfacing the reason lets
  // it retry with different filters in the same turn.
  const pricedCount = products.filter((p: { onDemandPricing: unknown[] }) => p.onDemandPricing.length > 0).length;
  const diagnostics: Record<string, unknown> = {};

  if (products.length === 0) {
    diagnostics.warning =
      'No products matched. Check that serviceCode is correct and that every filter field/value is valid for it ' +
      '(field names are case-sensitive). Call getServiceAttributes to list valid filter fields for this service. ' +
      'Note some resources bill under a different service code than expected — e.g. EBS volumes are under AmazonEC2, not AmazonEBS.';
    diagnostics.filtersApplied = apiFilters.map((f) => `${f.Field}=${f.Value}`);
  } else if (pricedCount === 0) {
    diagnostics.warning =
      'Products matched but none carried On-Demand price dimensions. This usually means the match is a ' +
      'non-On-Demand offering; retry with more specific filters rather than reporting prices as unavailable.';
  }

  return {
    serviceCode,
    region,
    products,
    resultCount: products.length,
    pricedCount,
    ...diagnostics,
  };
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

// DescribeSavingsPlansOfferings only accepts `instanceFamily` and `region` as
// filter names (SavingsPlanOfferingFilterAttribute). Passing anything else —
// e.g. `serviceCode` — fails the whole call with a ValidationException, so a
// question like "Savings Plans for EC2" used to error out entirely. Service
// scoping belongs in the separate `productTypes` parameter.
const SAVINGS_PLAN_PRODUCT_TYPES: Record<string, string> = {
  AmazonEC2: 'EC2',
  AWSLambda: 'Lambda',
  AmazonECS: 'Fargate',
  AmazonEKS: 'Fargate',
  AmazonSageMaker: 'SageMaker',
  AmazonRDS: 'RDS',
  AmazonDynamoDB: 'DynamoDB',
  AmazonElastiCache: 'ElastiCache',
  AmazonOpenSearch: 'OpenSearch',
};

export async function getSavingsPlans(params: {
  serviceCode?: string;
  productType?: string;
  planType?: string;
  region?: string;
  instanceFamily?: string;
}): Promise<any> {
  const { serviceCode, productType, planType, region, instanceFamily } = params;
  logger.info('getSavingsPlans called', { serviceCode, productType, planType, region, instanceFamily });

  const filters: Array<{ name: string; values: string[] }> = [];
  if (region) filters.push({ name: 'region', values: [region] });
  if (instanceFamily) filters.push({ name: 'instanceFamily', values: [instanceFamily] });

  // Accept either an explicit productType ("EC2") or an AWS service code
  // ("AmazonEC2") and translate the latter.
  const resolvedProductType =
    productType || (serviceCode ? SAVINGS_PLAN_PRODUCT_TYPES[serviceCode] : undefined);

  const input: any = { maxResults: 25 };
  if (planType) input.planTypes = [planType];
  if (resolvedProductType) input.productTypes = [resolvedProductType];
  if (filters.length > 0) input.filters = filters;

  const response = await savingsPlansClient.send(new DescribeSavingsPlansOfferingsCommand(input));
  return {
    offerings: response.searchResults || [],
    ...(serviceCode && !resolvedProductType
      ? { note: `No Savings Plans product type maps to service code "${serviceCode}"; returned unscoped offerings.` }
      : {}),
  };
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
