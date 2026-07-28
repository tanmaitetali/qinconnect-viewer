import * as fs from 'fs';
import * as path from 'path';

export interface EnvConfig {
  env: string;
  account: string;
  region: string;
  appName: string;
  auth: {
    userPoolId: string;
    userPoolClientId: string;
    cognitoDomain: string;
    oauth: { scopes: string[]; redirectSignIn: string; redirectSignOut: string };
  };
  domain?: {
    /** Fully-qualified custom domain, e.g. "qinconnect-log-viewer.t12apps.com". */
    name: string;
    /**
     * ACM certificate ARN covering `name` (must be in us-east-1 for CloudFront).
     * A wildcard cert like *.t12apps.com is fine. When omitted, the stack
     * requests a DNS-validated certificate itself (requires hostedZone*).
     */
    certificateArn?: string;
    /** Route53 hosted zone id for the apex domain, e.g. "Z0123...". */
    hostedZoneId?: string;
    /** Route53 hosted zone name, e.g. "t12apps.com". */
    hostedZoneName?: string;
  };
}

// Repo root /config, three levels up from cdk/frontend/lib.
const CONFIG_DIR = path.resolve(__dirname, '..', '..', '..', 'config');

/**
 * Loads the environment config selected by the `env` context param, e.g.
 *   cdk deploy -c env=dev
 */
export function loadConfig(env: string): EnvConfig {
  const file = path.join(CONFIG_DIR, `${env}.json`);
  if (!fs.existsSync(file)) {
    const available = fs
      .readdirSync(CONFIG_DIR)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''))
      .join(', ');
    throw new Error(
      `No config found for env "${env}" at ${file}. Available: ${available}. ` +
        `Pass one with: cdk deploy -c env=<name>`,
    );
  }

  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as EnvConfig;

  if (!config.account) {
    throw new Error(`Config "${env}" is missing an AWS account id. Set it in config/${env}.json.`);
  }

  return config;
}
