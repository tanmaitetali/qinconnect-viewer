import type { AppConfig } from './types';

/**
 * Fetches the runtime config written into the bucket by the CDK frontend
 * stack (or generated locally via `npm run config:local`). Same pattern as
 * ivr-tester's frontend/src/config/loadConfig.ts.
 */
export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load /config.json (${res.status}).`);
  }
  return (await res.json()) as AppConfig;
}
