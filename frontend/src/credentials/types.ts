// AWS credentials entered directly by the user (access key + secret key,
// optionally a session token). This covers both:
//  - long-lived IAM user keys
//  - temporary STS credentials, including the kind saml2aws prints after a
//    SAML federation login (AccessKeyId/SecretAccessKey/SessionToken)
//
// These are used to call CloudWatch Logs and Bedrock Runtime directly from
// the browser via the AWS SDK v3 — there is no backend in this app.
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Required for temporary/STS credentials (e.g. from saml2aws); omit for long-lived IAM user keys. */
  sessionToken?: string;
}

export interface LogsSettings {
  credentials: AwsCredentials | null;
  region: string;
  logGroupName: string;
}

export interface BedrockSettings {
  credentials: AwsCredentials | null;
  region: string;
  modelId: string;
}

export interface DashboardSettings {
  logs: LogsSettings;
  bedrock: BedrockSettings;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  logs: {
    credentials: null,
    region: 'us-east-1',
    logGroupName: '',
  },
  bedrock: {
    credentials: null,
    region: 'us-east-1',
    modelId: 'us.amazon.nova-pro-v1:0',
  },
};
