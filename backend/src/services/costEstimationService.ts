import { ParsedResource } from './parsers/cloudFormationParser.js';

export interface ResourceCostEstimate {
  resourceId: string;
  resourceType: string;
  estimatedMonthlyCost: number;
  region: string;
  assumptions: string[];
}

export interface FileCostEstimate {
  fileId: string;
  fileName: string;
  totalEstimatedMonthlyCost: number;
  resourceEstimates: ResourceCostEstimate[];
  assumptions: string[];
  estimatedAt: string;
}

/**
 * Generate combined cost estimation prompt for multiple files
 */
export function generateCombinedCostEstimationPrompt(fileData: Array<{resources: ParsedResource[], fileName: string}>): string {
  const allResources = fileData.flatMap(file => 
    file.resources.map(resource => ({...resource, sourceFile: file.fileName}))
  );
  
  const resourceList = allResources.map(resource => {
    const props = Object.entries(resource.properties)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    return `- ${resource.type} (${resource.logicalId}) from "${resource.sourceFile}": ${props}`;
  }).join('\n');

  const fileNames = fileData.map(f => f.fileName).join(', ');

  return `Please provide a COMBINED cost estimate for the following AWS infrastructure from files: ${fileNames}

IMPORTANT: Calculate and display the TOTAL MONTHLY COST for ALL files combined at the beginning of your response.

${resourceList}

For the combined infrastructure, please provide:
1. **TOTAL ESTIMATED MONTHLY COST for all files combined**
2. Cost breakdown by file and resource type
3. Region assumptions (default to us-east-1 if not specified)
4. Key pricing assumptions (instance hours, storage size, etc.)

Additionally, please provide cost optimization suggestions including:
- Right-sizing recommendations for compute resources
- Storage optimization opportunities (lifecycle policies, storage classes)
- Reserved Instance or Savings Plan recommendations where applicable
- Architectural improvements to reduce costs
- Alternative services that could be more cost-effective

Please format the response with the total combined cost prominently displayed first, followed by detailed breakdowns and actionable optimization recommendations.`;
}

/**
 * Generate cost estimation prompt for Bedrock Agent
 */
export function generateCostEstimationPrompt(resources: ParsedResource[], fileName: string): string {
  const resourceList = resources.map(resource => {
    const props = Object.entries(resource.properties)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    return `- ${resource.type} (${resource.logicalId}): ${props}`;
  }).join('\n');

  return `Please provide a cost estimate and optimization recommendations for the following AWS infrastructure from file "${fileName}":

${resourceList}

For each resource, please provide:
1. Estimated monthly cost in USD
2. Region assumptions (default to us-east-1 if not specified)
3. Key pricing assumptions (instance hours, storage size, etc.)

Additionally, please provide cost optimization suggestions including:
- Right-sizing recommendations for compute resources
- Storage optimization opportunities (lifecycle policies, storage classes)
- Reserved Instance or Savings Plan recommendations where applicable
- Architectural improvements to reduce costs
- Alternative services that could be more cost-effective

Please format the response with clear cost breakdowns, total estimated monthly cost, and actionable optimization recommendations.`;
}
