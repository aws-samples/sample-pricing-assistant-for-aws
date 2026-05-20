import { ParsedResource, ParseResult } from './cloudFormationParser.js';

export function parseCDKTypeScript(content: string): ParseResult {
  const resources: ParsedResource[] = [];
  const errors: string[] = [];

  try {
    // Extract EC2 instances
    const ec2Matches = content.match(/new\s+ec2\.Instance\s*\(\s*this,\s*['"`]([^'"`]+)['"`]\s*,\s*\{([^}]+)\}/gs);
    if (ec2Matches) {
      ec2Matches.forEach((match) => {
        const nameMatch = match.match(/['"`]([^'"`]+)['"`]/);
        const instanceTypeMatch = match.match(/instanceType:\s*ec2\.InstanceType\.of\s*\(\s*ec2\.InstanceClass\.([A-Z0-9]+),\s*ec2\.InstanceSize\.([A-Z0-9]+)\s*\)/);
        
        if (nameMatch && instanceTypeMatch) {
          const instanceClass = instanceTypeMatch[1].toLowerCase();
          const instanceSize = instanceTypeMatch[2].toLowerCase();
          resources.push({
            type: 'AWS::EC2::Instance',
            logicalId: nameMatch[1],
            properties: {
              InstanceType: `${instanceClass}.${instanceSize}`,
              ImageId: 'ami-latest-amazon-linux-2'
            }
          });
        }
      });
    }

    // Extract Application Load Balancer
    const albMatch = content.match(/new\s+elbv2\.ApplicationLoadBalancer\s*\(\s*this,\s*['"`]([^'"`]+)['"`]/);
    if (albMatch) {
      resources.push({
        type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
        logicalId: albMatch[1],
        properties: {
          Type: 'application',
          Scheme: content.includes('internetFacing: true') ? 'internet-facing' : 'internal'
        }
      });
    }

    // Extract Target Group
    const tgMatch = content.match(/new\s+elbv2\.ApplicationTargetGroup\s*\(\s*this,\s*['"`]([^'"`]+)['"`]/);
    if (tgMatch) {
      resources.push({
        type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        logicalId: tgMatch[1],
        properties: {
          Port: 80,
          Protocol: 'HTTP',
          TargetType: 'instance'
        }
      });
    }

    // Extract RDS Database
    const rdsMatch = content.match(/new\s+rds\.DatabaseInstance\s*\(\s*this,\s*['"`]([^'"`]+)['"`]\s*,\s*\{([^}]+)\}/gs);
    if (rdsMatch) {
      rdsMatch.forEach(match => {
        const nameMatch = match.match(/['"`]([^'"`]+)['"`]/);
        const instanceTypeMatch = match.match(/instanceType:\s*ec2\.InstanceType\.of\s*\(\s*ec2\.InstanceClass\.([A-Z0-9]+),\s*ec2\.InstanceSize\.([A-Z0-9]+)\s*\)/);
        const storageMatch = match.match(/allocatedStorage:\s*(\d+)/);
        const engineMatch = match.match(/engine:\s*rds\.DatabaseInstanceEngine\.(\w+)/);
        
        if (nameMatch) {
          const instanceClass = instanceTypeMatch ? instanceTypeMatch[1].toLowerCase() : 't3';
          const instanceSize = instanceTypeMatch ? instanceTypeMatch[2].toLowerCase() : 'micro';
          const storage = storageMatch ? parseInt(storageMatch[1]) : 20;
          const engine = engineMatch ? engineMatch[1] : 'mysql';
          
          resources.push({
            type: 'AWS::RDS::DBInstance',
            logicalId: nameMatch[1],
            properties: {
              DBInstanceClass: `db.${instanceClass}.${instanceSize}`,
              Engine: engine,
              AllocatedStorage: storage,
              StorageType: 'gp2',
              MultiAZ: match.includes('multiAz: true')
            }
          });
        }
      });
    }

    // Extract VPC
    const vpcMatch = content.match(/new\s+ec2\.Vpc\s*\(\s*this,\s*['"`]([^'"`]+)['"`]/);
    if (vpcMatch) {
      const natGatewaysMatch = content.match(/natGateways:\s*(\d+)/);
      
      resources.push({
        type: 'AWS::EC2::VPC',
        logicalId: vpcMatch[1],
        properties: {
          CidrBlock: '10.0.0.0/16',
          EnableDnsHostnames: true,
          EnableDnsSupport: true
        }
      });

      // Add NAT Gateways if specified
      if (natGatewaysMatch && parseInt(natGatewaysMatch[1]) > 0) {
        for (let i = 1; i <= parseInt(natGatewaysMatch[1]); i++) {
          resources.push({
            type: 'AWS::EC2::NatGateway',
            logicalId: `NatGateway${i}`,
            properties: {
              AllocationId: `eip-${i}`
            }
          });
        }
      }

      // Add Internet Gateway
      resources.push({
        type: 'AWS::EC2::InternetGateway',
        logicalId: 'InternetGateway',
        properties: {}
      });
    }

    // Extract Security Groups
    const sgMatches = content.match(/new\s+ec2\.SecurityGroup\s*\(\s*this,\s*['"`]([^'"`]+)['"`]/g);
    if (sgMatches) {
      sgMatches.forEach(match => {
        const nameMatch = match.match(/['"`]([^'"`]+)['"`]/);
        if (nameMatch) {
          resources.push({
            type: 'AWS::EC2::SecurityGroup',
            logicalId: nameMatch[1],
            properties: {
              GroupDescription: 'Security group created by CDK'
            }
          });
        }
      });
    }

    if (resources.length === 0) {
      errors.push('No recognizable AWS resources found in CDK TypeScript file');
    }

    return { resources, errors };
  } catch (error) {
    return {
      resources: [],
      errors: [`Failed to parse CDK TypeScript: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}
