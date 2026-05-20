import * as yaml from 'js-yaml';

export interface ParsedResource {
  type: string;
  properties: Record<string, any>;
  logicalId: string;
}

export interface ParseResult {
  resources: ParsedResource[];
  errors: string[];
}

// Custom YAML schema for CloudFormation intrinsic functions
const cfnSchema = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('!Ref', {
    kind: 'scalar',
    construct: (data) => ({ Ref: data })
  }),
  new yaml.Type('!GetAtt', {
    kind: 'scalar',
    construct: (data) => ({ 'Fn::GetAtt': data.includes('.') ? data.split('.') : data })
  }),
  new yaml.Type('!GetAZs', {
    kind: 'scalar',
    construct: (data) => ({ 'Fn::GetAZs': data || '' })
  }),
  new yaml.Type('!Join', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Join': data })
  }),
  new yaml.Type('!Sub', {
    kind: 'scalar',
    construct: (data) => ({ 'Fn::Sub': data })
  }),
  new yaml.Type('!Sub', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Sub': data })
  }),
  new yaml.Type('!Base64', {
    kind: 'scalar',
    construct: (data) => ({ 'Fn::Base64': data })
  }),
  new yaml.Type('!ImportValue', {
    kind: 'scalar',
    construct: (data) => ({ 'Fn::ImportValue': data })
  }),
  new yaml.Type('!Select', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Select': data })
  }),
  new yaml.Type('!Split', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Split': data })
  }),
  new yaml.Type('!FindInMap', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::FindInMap': data })
  }),
  new yaml.Type('!Equals', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Equals': data })
  }),
  new yaml.Type('!If', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::If': data })
  }),
  new yaml.Type('!Not', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Not': data })
  }),
  new yaml.Type('!And', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::And': data })
  }),
  new yaml.Type('!Or', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Or': data })
  }),
  new yaml.Type('!Condition', {
    kind: 'scalar',
    construct: (data) => ({ Condition: data })
  }),
  new yaml.Type('!Transform', {
    kind: 'mapping',
    construct: (data) => ({ 'Fn::Transform': data })
  }),
  new yaml.Type('!Cidr', {
    kind: 'sequence',
    construct: (data) => ({ 'Fn::Cidr': data })
  })
]);

export function parseCloudFormation(content: string): ParseResult {
  try {
    let template: any;
    
    // Try parsing as YAML with CloudFormation schema first, then JSON
    try {
      template = yaml.load(content, { schema: cfnSchema });
    } catch (yamlError) {
      try {
        template = JSON.parse(content);
      } catch (jsonError) {
        return { 
          resources: [], 
          errors: [`Failed to parse CloudFormation: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`] 
        };
      }
    }
    
    const resources: ParsedResource[] = [];
    const errors: string[] = [];

    if (!template.Resources) {
      return { resources: [], errors: ['No Resources section found'] };
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
      errors: [`Failed to parse CloudFormation: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}
