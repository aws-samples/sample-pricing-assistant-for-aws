import { parseCloudFormation, ParseResult } from './parsers/cloudFormationParser.js';
import { parseTerraform } from './parsers/terraformParser.js';
import { parseCDK } from './parsers/cdkParser.js';
import { parseCDKTypeScript } from './parsers/cdkTypescriptParser.js';

export interface FileParseResult extends ParseResult {
  fileType: string;
}

export function parseInfrastructureFile(filename: string, content: string): FileParseResult {
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
  
  // Terraform configuration
  if ((ext.endsWith('.tf') || ext.endsWith('.json')) && 
      (content.includes('resource ') || content.includes('"resource"'))) {
    const result = parseTerraform(content);
    return { ...result, fileType: 'Terraform' };
  }
  
  return {
    resources: [],
    errors: ['Unsupported file type'],
    fileType: 'Unknown'
  };
}
