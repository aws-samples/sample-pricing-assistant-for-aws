import { parse as hcl2json } from '@cdktf/hcl2json';
import { ParsedResource, ParseResult } from './cloudFormationParser.js';

// hcl2json wraps each resource instance in a single-element array
// (`aws_instance.web` becomes `[{...}]`), while Terraform's JSON syntax uses
// a bare object. unwrapInstance handles both shapes.
function unwrapInstance(value: unknown): Record<string, any> {
  if (Array.isArray(value)) {
    return (value[0] && typeof value[0] === 'object' ? value[0] : {}) as Record<string, any>;
  }
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}

function extractResources(config: any): ParsedResource[] {
  const resources: ParsedResource[] = [];
  if (!config?.resource || typeof config.resource !== 'object') return resources;

  for (const [resourceType, instances] of Object.entries(config.resource)) {
    if (!instances || typeof instances !== 'object') continue;
    for (const [logicalId, properties] of Object.entries(instances as Record<string, unknown>)) {
      resources.push({
        type: resourceType,
        properties: unwrapInstance(properties),
        logicalId,
      });
    }
  }
  return resources;
}

export async function parseTerraform(content: string): Promise<ParseResult> {
  const trimmed = content.trim();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');

  // Try the format the content looks like first; fall back to the other.
  // .tf files are HCL; .tf.json files are Terraform JSON syntax.
  if (looksLikeJson) {
    try {
      return { resources: extractResources(JSON.parse(content)), errors: [] };
    } catch {
      // fall through to HCL
    }
  }

  try {
    const config = await hcl2json('main.tf', content);
    return { resources: extractResources(config), errors: [] };
  } catch (hclError) {
    if (!looksLikeJson) {
      // Last-resort JSON attempt for files that don't start with { but
      // happen to be JSON anyway.
      try {
        return { resources: extractResources(JSON.parse(content)), errors: [] };
      } catch {
        // fall through
      }
    }
    return {
      resources: [],
      errors: [`Failed to parse Terraform: ${hclError instanceof Error ? hclError.message : 'Unknown error'}`],
    };
  }
}
