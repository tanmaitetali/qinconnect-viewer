import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { loadConfig } from './config/loadConfig';
import { configureAmplify } from './auth/amplify';

async function bootstrap() {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('Root element #root not found');
  const root = ReactDOM.createRoot(rootEl);

  try {
    const config = await loadConfig();
    configureAmplify(config);

    root.render(
      <React.StrictMode>
        <App config={config} />
      </React.StrictMode>,
    );
  } catch (err) {
    root.render(
      <React.StrictMode>
        <div className="flex-1 flex items-center justify-center min-h-screen p-8 text-center">
          <div>
            <h1 className="text-lg font-semibold text-red-400 mb-2">Failed to load configuration</h1>
            <p className="text-sm text-dark-400">
              {err instanceof Error ? err.message : 'Unknown error.'}
            </p>
          </div>
        </div>
      </React.StrictMode>,
    );
  }
}

void bootstrap();
