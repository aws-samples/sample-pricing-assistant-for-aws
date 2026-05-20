import { ParsedResource, ParseResult } from './cloudFormationParser.js';

export function parseTerraform(content: string): ParseResult {
  try {
    const config = JSON.parse(content);
    const resources: ParsedResource[] = [];
    const errors: string[] = [];

    if (config.resource) {
      for (const [resourceType, instances] of Object.entries(config.resource)) {
        for (const [logicalId, properties] of Object.entries(instances as Record<string, any>)) {
          resources.push({
            type: resourceType,
            properties: properties || {},
            logicalId
          });
        }
      }
    }

    return { resources, errors };
  } catch (error) {
    return { 
      resources: [], 
      errors: [`Failed to parse Terraform: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}
