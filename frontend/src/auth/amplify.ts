import { Amplify } from 'aws-amplify';
import type { ResourcesConfig } from 'aws-amplify';
import type { AppConfig } from '../config/types';

type CognitoConfig = NonNullable<NonNullable<ResourcesConfig['Auth']>['Cognito']>;

/**
 * Configures Amplify Auth from the runtime config. This app only ever uses
 * Hosted UI redirect (no inline username/password form) — that's what lets a
 * login on ivr-tester (which also redirects to the same Hosted UI domain)
 * carry over here without re-entering credentials, and vice versa.
 */
export function configureAmplify(config: AppConfig): void {
  const { auth } = config;

  const redirectSignIn = auth.oauth.redirectSignIn
    ? [auth.oauth.redirectSignIn]
    : [window.location.origin + '/'];
  const redirectSignOut = auth.oauth.redirectSignOut
    ? [auth.oauth.redirectSignOut]
    : [window.location.origin + '/'];

  const cognito: CognitoConfig = {
    userPoolId: auth.userPoolId,
    userPoolClientId: auth.userPoolClientId,
    loginWith: {
      oauth: {
        domain: auth.cognitoDomain.includes('.')
          ? auth.cognitoDomain
          : `${auth.cognitoDomain}.auth.${region(config)}.amazoncognito.com`,
        scopes: auth.oauth.scopes,
        redirectSignIn,
        redirectSignOut,
        responseType: 'code',
      },
    },
  };

  Amplify.configure({ Auth: { Cognito: cognito } });
}

// The browser config does not carry region; Cognito hosted-UI domains use the
// pool's region. Derive it from the userPoolId prefix (e.g. "us-east-1_ab12").
function region(config: AppConfig): string {
  const fromPool = config.auth.userPoolId.split('_')[0];
  return fromPool || 'us-east-1';
}
