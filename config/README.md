# Environment configuration

Each file in this folder describes one deployment target, mirroring the shape
used by `ivr-tester/config/*.json` (this app authenticates against the SAME
Cognito user pool, through its own app client).

## Schema

```jsonc
{
  "env": "dev",
  "account": "111111111111",    // AWS account id (CDK only)
  "region": "us-east-1",        // AWS region (CDK only)
  "appName": "qinconnect-log-viewer",

  "auth": {
    "userPoolId": "",           // same value as ivr-tester's config/dev.json auth.userPoolId
    "userPoolClientId": "",     // the "qinconnect" app client id, from ivr-tester's auth-stack
                                  // CfnOutput "qinconnectClientId" (deploy ivr-tester's auth stack first)
    "cognitoDomain": "",        // same Hosted UI domain prefix as ivr-tester's config
    "oauth": {
      "scopes": ["openid", "email", "profile"],
      "redirectSignIn": "https://qinconnect-log-viewer.t12apps.com/",
      "redirectSignOut": "https://qinconnect-log-viewer.t12apps.com/"
    }
  },

  "domain": {
    "name": "qinconnect-log-viewer.t12apps.com",
    "certificateArn": "",       // reuse ivr-tester's *.t12apps.com wildcard cert (us-east-1)
    "hostedZoneId": "",
    "hostedZoneName": "t12apps.com"
  }
}
```

There is no `api` block — this app has no backend. All AWS calls (CloudWatch
Logs, Bedrock Runtime) run directly from the browser using credentials the
user enters in Settings, never a value from this config file.
