import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useConfig } from '../config/ConfigContext';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const config = useConfig();
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  const onSignIn = () => {
    setError(null);
    setSubmitting(true);
    void signIn().catch((err) => {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 w-full">
      <div className="w-full max-w-sm bg-dark-900 border border-dark-700 rounded-xl p-6 shadow-xl text-center">
        <h1 className="text-lg font-semibold text-dark-100 mb-1">{config.appName}</h1>
        <p className="text-xs text-dark-400 mb-5">
          You'll be taken to a secure sign-in page. If you're already signed in to
          another app using this same login, you'll come straight back here.
        </p>

        {error && (
          <p className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={onSignIn}
          disabled={submitting}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-dark-700 disabled:text-dark-500 text-white text-sm font-medium rounded-md transition-colors"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
