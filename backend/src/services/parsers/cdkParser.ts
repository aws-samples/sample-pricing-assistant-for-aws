import { ParsedResource, ParseResult } from './cloudFormationParser.js';

export function parseCDK(content: string): ParseResult {
  try {
    // CDK synthesized output is CloudFormation JSON
    const template = JSON.parse(content);
    const resources: ParsedResource[] = [];
    const errors: string[] = [];

    if (!template.Resources) {
      return { resources: [], errors: ['No Resources section found in CDK output'] };
    }

    for (const [logicalId, resource] of Object.entries(template.Resources)) {
      const res = resource as any;
      if (res.Type) {
        resources.push({
          type: res.Type,
          properties: res.Properties || {},
          logicalId
        });
      }
    }

    return { resources, errors };
  } catch (error) {
    return { 
      resources: [], 
      errors: [`Failed to parse CDK: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}
