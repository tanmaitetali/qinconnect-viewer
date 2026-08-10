import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AwsCredentials, DashboardSettings, LogsSettings, BedrockSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

// Credentials are live AWS secrets, so they live in sessionStorage — cleared
// automatically when the browser tab/window closes, never written to disk.
// Non-secret preferences (region, log group name, model id) are low-risk and
// convenient to keep around, so they persist in localStorage instead.
const CREDENTIALS_KEY = 'qinconnect.credentials';
const PREFS_KEY = 'qinconnect.prefs';

interface StoredCredentials {
  logs: AwsCredentials | null;
  bedrock: AwsCredentials | null;
}

interface StoredPrefs {
  logs: { region: string; logGroupName: string };
  bedrock: { region: string; modelId: string };
}

function loadCredentials(): StoredCredentials {
  try {
    const raw = sessionStorage.getItem(CREDENTIALS_KEY);
    if (raw) return JSON.parse(raw) as StoredCredentials;
  } catch {
    // ignore malformed storage
  }
  return { logs: null, bedrock: null };
}

function loadPrefs(): StoredPrefs {
  const fallback: StoredPrefs = {
    logs: { region: DEFAULT_SETTINGS.logs.region, logGroupName: DEFAULT_SETTINGS.logs.logGroupName },
    bedrock: { region: DEFAULT_SETTINGS.bedrock.region, modelId: DEFAULT_SETTINGS.bedrock.modelId },
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
      return {
        logs: { ...fallback.logs, ...parsed.logs },
        bedrock: { ...fallback.bedrock, ...parsed.bedrock },
      };
    }
  } catch {
    // ignore malformed storage
  }
  return fallback;
}

function buildSettings(creds: StoredCredentials, prefs: StoredPrefs): DashboardSettings {
  return {
    logs: { ...prefs.logs, credentials: creds.logs },
    bedrock: { ...prefs.bedrock, credentials: creds.bedrock },
  };
}

function persistToStorage(next: DashboardSettings): void {
  const creds: StoredCredentials = {
    logs: next.logs.credentials,
    bedrock: next.bedrock.credentials,
  };
  const prefs: StoredPrefs = {
    logs: { region: next.logs.region, logGroupName: next.logs.logGroupName },
    bedrock: { region: next.bedrock.region, modelId: next.bedrock.modelId },
  };
  sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export interface CredentialsContextValue {
  settings: DashboardSettings;
  /** Save the entire settings object at once. Avoids stale-closure bugs. */
  saveAll: (next: DashboardSettings) => void;
  /** Convenience: update only logs settings. */
  setLogsSettings: (next: LogsSettings) => void;
  /** Convenience: update only bedrock settings. */
  setBedrockSettings: (next: BedrockSettings) => void;
  isLogsConfigured: boolean;
  isBedrockConfigured: boolean;
  clearCredentials: () => void;
}

const CredentialsContext = createContext<CredentialsContextValue | null>(null);

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DashboardSettings>(() =>
    buildSettings(loadCredentials(), loadPrefs()),
  );

  const saveAll = useCallback((next: DashboardSettings) => {
    persistToStorage(next);
    setSettings(next);
  }, []);

  const setLogsSettings = useCallback((next: LogsSettings) => {
    setSettings((prev) => {
      const updated = { ...prev, logs: next };
      persistToStorage(updated);
      return updated;
    });
  }, []);

  const setBedrockSettings = useCallback((next: BedrockSettings) => {
    setSettings((prev) => {
      const updated = { ...prev, bedrock: next };
      persistToStorage(updated);
      return updated;
    });
  }, []);

  const clearCredentials = useCallback(() => {
    setSettings((prev) => {
      const updated = {
        logs: { ...prev.logs, credentials: null },
        bedrock: { ...prev.bedrock, credentials: null },
      };
      persistToStorage(updated);
      return updated;
    });
  }, []);

  const value = useMemo<CredentialsContextValue>(
    () => ({
      settings,
      saveAll,
      setLogsSettings,
      setBedrockSettings,
      isLogsConfigured: Boolean(settings.logs.credentials && settings.logs.logGroupName.trim()),
      isBedrockConfigured: Boolean(settings.bedrock.credentials),
      clearCredentials,
    }),
    [settings, saveAll, setLogsSettings, setBedrockSettings, clearCredentials],
  );

  return <CredentialsContext.Provider value={value}>{children}</CredentialsContext.Provider>;
}

export function useCredentials(): CredentialsContextValue {
  const ctx = useContext(CredentialsContext);
  if (!ctx) {
    throw new Error('useCredentials must be used within a CredentialsProvider');
  }
  return ctx;
}
