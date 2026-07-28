import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AwsCredentials, BedrockSettings, DashboardSettings, LogsSettings } from './types';
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

interface LogsPrefs {
  region: string;
  logGroupName: string;
}

interface BedrockPrefs {
  region: string;
  modelId: string;
}

interface StoredPrefs {
  logs: LogsPrefs;
  bedrock: BedrockPrefs;
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

export interface CredentialsContextValue {
  settings: DashboardSettings;
  setLogsSettings: (next: LogsSettings) => void;
  setBedrockSettings: (next: BedrockSettings) => void;
  isLogsConfigured: boolean;
  isBedrockConfigured: boolean;
  /** Clears stored credentials (both sets) without touching saved preferences. */
  clearCredentials: () => void;
}

const CredentialsContext = createContext<CredentialsContextValue | null>(null);

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DashboardSettings>(() =>
    buildSettings(loadCredentials(), loadPrefs()),
  );

  const persist = useCallback((next: DashboardSettings) => {
    const creds: StoredCredentials = { logs: next.logs.credentials, bedrock: next.bedrock.credentials };
    const prefs: StoredPrefs = {
      logs: { region: next.logs.region, logGroupName: next.logs.logGroupName },
      bedrock: { region: next.bedrock.region, modelId: next.bedrock.modelId },
    };
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    setSettings(next);
  }, []);

  const setLogsSettings = useCallback(
    (next: LogsSettings) => {
      persist({ ...settings, logs: next });
    },
    [settings, persist],
  );

  const setBedrockSettings = useCallback(
    (next: BedrockSettings) => {
      persist({ ...settings, bedrock: next });
    },
    [settings, persist],
  );

  const clearCredentials = useCallback(() => {
    persist({
      logs: { ...settings.logs, credentials: null },
      bedrock: { ...settings.bedrock, credentials: null },
    });
  }, [settings, persist]);

  const value = useMemo<CredentialsContextValue>(
    () => ({
      settings,
      setLogsSettings,
      setBedrockSettings,
      isLogsConfigured: Boolean(settings.logs.credentials && settings.logs.logGroupName.trim()),
      isBedrockConfigured: Boolean(settings.bedrock.credentials),
      clearCredentials,
    }),
    [settings, setLogsSettings, setBedrockSettings, clearCredentials],
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
