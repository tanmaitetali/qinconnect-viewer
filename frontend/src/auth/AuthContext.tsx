import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  signOut as amplifySignOut,
  signInWithRedirect,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

export interface AuthUser {
  username: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /**
   * Redirects to the shared Cognito Hosted UI. If the user already has a
   * Hosted UI session (e.g. from signing into ivr-tester), Cognito skips
   * straight back here with an auth code instead of showing the login form.
   */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Returns a bearer token, or null when unavailable (unused today — no backend). */
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Resolve the current session on mount. This is also what picks up a
  // Hosted UI redirect landing back on the app: Amplify exchanges the
  // ?code= for tokens internally before this resolves.
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const current = await getCurrentUser();
        if (active) {
          setUser({ username: current.username });
          setStatus('authenticated');
        }
      } catch {
        if (active) {
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    await signInWithRedirect();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await amplifySignOut();
    } catch {
      // ignore sign-out errors; clear local state regardless
    }
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const getIdToken = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut, getIdToken }),
    [status, user, signIn, signOut, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
