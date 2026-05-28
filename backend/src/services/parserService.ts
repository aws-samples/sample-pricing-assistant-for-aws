import { parseCloudFormation, ParseResult } from './parsers/cloudFormationParser.js';
import { parseTerraform } from './parsers/terraformParser.js';
import { parseCDK } from './parsers/cdkParser.js';
import { parseCDKTypeScript } from './parsers/cdkTypescriptParser.js';

export interface FileParseResult extends ParseResult {
  fileType: string;
}

export async function parseInfrastructureFile(filename: string, content: string): Promise<FileParseResult> {
  const ext = filename.toLowerCase();
  
  // CDK TypeScript source files
  if (ext.endsWith('.ts') && (content.includes('aws-cdk-lib') || content.includes('@aws-cdk'))) {
    const result = parseCDKTypeScript(content);
    return { ...result, fileType: 'CDK TypeScript' };
  }
  
  // CDK JavaScript source files
  if (ext.endsWith('.js') && (content.includes('aws-cdk-lib') || content.includes('@aws-cdk'))) {
    const result = parseCDKTypeScript(content); // Can reuse same parser logic
    return { ...result, fileType: 'CDK JavaScript' };
  }
  
  // CloudFormation template (JSON or YAML)
  if ((ext.endsWith('.json') || ext.endsWith('.yaml') || ext.endsWith('.yml')) && 
      (content.includes('AWSTemplateFormatVersion') || content.includes('Resources'))) {
    const result = parseCloudFormation(content);
    return { ...result, fileType: 'CloudFormation' };
  }
  
  // CDK synthesized output (CloudFormation-like with CDK metadata)
  if (ext.endsWith('.json') && (content.includes('"CDKMetadata"') || content.includes('aws-cdk'))) {
    const result = parseCDK(content);
    return { ...result, fileType: 'CDK Synthesized' };
  }
  
  // Terraform configuration. Native HCL (`.tf`) is parsed via @cdktf/hcl2json;
  // Terraform JSON syntax (`.tf.json` and rare `.json`) parses directly. We
  // also accept `.tfvars` here so plumbed files don't silently drop — the
  // parser will return errors (no `resource` block) which the chat controller
  // surfaces upstream.
  if (ext.endsWith('.tf') || ext.endsWith('.tfvars') ||
      (ext.endsWith('.json') && (content.includes('resource ') || content.includes('"resource"')))) {
    const result = await parseTerraform(content);
    return { ...result, fileType: 'Terraform' };
  }
  
  return {
    resources: [],
    errors: ['Unsupported file type'],
    fileType: 'Unknown'
  };
}
