// Runtime config shipped to the browser as /config.json, written by the CDK
// frontend stack (see cdk/frontend/lib/frontend-stack.ts) from
// config/<env>.json. This app authenticates against the SAME Cognito user
// pool as ivr-tester, but through its OWN app client (so callback/logout
// URLs and rotation stay scoped to this app).
export interface AppConfig {
  env: string;
  appName: string;
  auth: {
    userPoolId: string;
    userPoolClientId: string;
    /** Hosted UI domain prefix (or full domain), shared with ivr-tester. */
    cognitoDomain: string;
    oauth: {
      scopes: string[];
      redirectSignIn: string;
      redirectSignOut: string;
    };
  };
}
