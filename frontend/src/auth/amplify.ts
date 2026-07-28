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

  // Amplify requires the OAuth redirect to start from the SAME origin the
  // page is currently loaded on (it checks window.location.origin against
  // this list before beginning the flow). Build the list from whatever's
  // configured plus the current origin, deduped, so this still works if the
  // app is ever reached from a second registered origin (e.g. the raw
  // CloudFront URL) rather than only the custom domain.
  const currentOrigin = window.location.origin + '/';
  const redirectSignIn = Array.from(
    new Set([auth.oauth.redirectSignIn, currentOrigin].filter(Boolean)),
  );
  const redirectSignOut = Array.from(
    new Set([auth.oauth.redirectSignOut, currentOrigin].filter(Boolean)),
  );

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
