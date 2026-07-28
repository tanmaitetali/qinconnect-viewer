import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { CheckCircle2, XCircle, Loader2, FolderSearch, BrainCircuit, ScrollText } from 'lucide-react';
import { useCredentials } from '../credentials/CredentialsContext';
import type { AwsCredentials } from '../credentials/types';
import { discoverLogGroups } from '../lib/cloudwatch';
import { analyzeSession } from '../lib/bedrock';

interface CredentialFormState {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

const EMPTY_CREDS: CredentialFormState = { accessKeyId: '', secretAccessKey: '', sessionToken: '' };

function toFormState(creds: AwsCredentials | null): CredentialFormState {
  if (!creds) return EMPTY_CREDS;
  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken ?? '',
  };
}

function toCredentials(form: CredentialFormState): AwsCredentials | null {
  if (!form.accessKeyId.trim() || !form.secretAccessKey.trim()) return null;
  return {
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey.trim(),
    sessionToken: form.sessionToken.trim() || undefined,
  };
}

export function SettingsPage() {
  const { settings, setLogsSettings, setBedrockSettings } = useCredentials();

  const [logsCreds, setLogsCreds] = useState<CredentialFormState>(toFormState(settings.logs.credentials));
  const [logsRegion, setLogsRegion] = useState(settings.logs.region);
  const [logGroupName, setLogGroupName] = useState(settings.logs.logGroupName);

  const [bedrockCreds, setBedrockCreds] = useState<CredentialFormState>(
    toFormState(settings.bedrock.credentials),
  );
  const [bedrockRegion, setBedrockRegion] = useState(settings.bedrock.region);
  const [modelId, setModelId] = useState(settings.bedrock.modelId);

  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<'logs' | 'bedrock' | null>(null);
  const [testResult, setTestResult] = useState<{
    section: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [logGroups, setLogGroups] = useState<string[]>([]);

  const handleSave = () => {
    setLogsSettings({
      credentials: toCredentials(logsCreds),
      region: logsRegion,
      logGroupName,
    });
    setBedrockSettings({
      credentials: toCredentials(bedrockCreds),
      region: bedrockRegion,
      modelId,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestLogs = async () => {
    const credentials = toCredentials(logsCreds);
    if (!credentials) {
      setTestResult({ section: 'logs', success: false, message: 'Enter an access key and secret key first.' });
      return;
    }
    setTesting('logs');
    setTestResult(null);
    try {
      const groups = await discoverLogGroups(credentials, logsRegion);
      setTestResult({
        section: 'logs',
        success: true,
        message: `Connected! Found ${groups.length} AI agent log group(s).`,
      });
      setLogGroups(groups.map((g) => g.name));
    } catch (err) {
      setTestResult({
        section: 'logs',
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleTestBedrock = async () => {
    const credentials = toCredentials(bedrockCreds);
    if (!credentials) {
      setTestResult({
        section: 'bedrock',
        success: false,
        message: 'Enter an access key and secret key first.',
      });
      return;
    }
    setTesting('bedrock');
    setTestResult(null);
    try {
      await analyzeSession(credentials, bedrockRegion, modelId, {
        messages: [{ id: 'test', type: 'customer', text: 'test', timestamp: Date.now() }],
        toolCalls: [],
        issues: [],
        metrics: {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheReadTokens: 0,
          avgTimeToFirstToken: 0,
          maxTimeToFirstToken: 0,
          totalOrchestrationIterations: 0,
          cacheHitRatio: 0,
          spans: [],
        },
      });
      setTestResult({ section: 'bedrock', success: true, message: 'Bedrock connection successful. Model responded.' });
    } catch (err) {
      setTestResult({
        section: 'bedrock',
        success: false,
        message: err instanceof Error ? err.message : 'Bedrock connection failed',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleDiscoverGroups = async () => {
    const credentials = toCredentials(logsCreds);
    if (!credentials) return;
    setTesting('logs');
    try {
      const groups = await discoverLogGroups(credentials, logsRegion);
      setLogGroups(groups.map((g) => g.name));
    } catch {
      // surfaced via "Test Connection" instead; this button fails silently
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto overflow-y-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-100">Settings</h1>
        <p className="text-sm text-dark-400 mt-1">
          Enter AWS credentials for log viewing and AI analysis. Credentials are kept only in
          this browser tab (cleared when you close it) — never sent anywhere except AWS.
        </p>
      </div>

      <div className="space-y-6">
        {/* Bot Logs Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-base">Bot Logs</CardTitle>
            </div>
            <CardDescription>AWS credentials for reading CloudWatch logs from your Connect instance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CredentialFields value={logsCreds} onChange={setLogsCreds} idPrefix="logs" />

            <div>
              <label className="text-sm font-medium block mb-1.5 text-dark-200">AWS Region</label>
              <input
                type="text"
                value={logsRegion}
                onChange={(e) => setLogsRegion(e.target.value)}
                placeholder="us-east-1"
                className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5 text-dark-200">Log Group Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logGroupName}
                  onChange={(e) => setLogGroupName(e.target.value)}
                  placeholder="/aws/connect/ai-agents/your-instance"
                  className="flex-1 px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button variant="outline" size="sm" onClick={handleDiscoverGroups} disabled={testing === 'logs'}>
                  {testing === 'logs' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                </Button>
              </div>
              {logGroups.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-dark-500">Discovered log groups:</p>
                  {logGroups.map((group) => (
                    <button
                      key={group}
                      onClick={() => setLogGroupName(group)}
                      className="block w-full text-left px-2 py-1.5 text-xs font-mono rounded bg-dark-800 hover:bg-dark-700 text-dark-300 transition-colors"
                    >
                      {group}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={handleTestLogs} disabled={testing === 'logs'}>
              {testing === 'logs' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Test Connection
            </Button>

            {testResult?.section === 'logs' && <TestResultBanner result={testResult} />}
          </CardContent>
        </Card>

        {/* Configure AI (Bedrock) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-purple-400" />
              <CardTitle className="text-base">Configure AI</CardTitle>
            </div>
            <CardDescription>
              AWS credentials for Bedrock model invocation (AI session analysis). Can use different
              credentials than bot logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CredentialFields value={bedrockCreds} onChange={setBedrockCreds} idPrefix="bedrock" />

            <div>
              <label className="text-sm font-medium block mb-1.5 text-dark-200">AWS Region</label>
              <input
                type="text"
                value={bedrockRegion}
                onChange={(e) => setBedrockRegion(e.target.value)}
                placeholder="us-east-1"
                className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5 text-dark-200">Model ID</label>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="us.amazon.nova-pro-v1:0"
                className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-dark-500 mt-1">
                Bedrock model ID. Cross-region inference IDs start with the region prefix.
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={handleTestBedrock} disabled={testing === 'bedrock'}>
              {testing === 'bedrock' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Test Bedrock
            </Button>

            {testResult?.section === 'bedrock' && <TestResultBanner result={testResult} />}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave}>{saved ? 'Saved!' : 'Save Settings'}</Button>
        </div>
      </div>
    </div>
  );
}

function CredentialFields({
  value,
  onChange,
  idPrefix,
}: {
  value: CredentialFormState;
  onChange: (next: CredentialFormState) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-access-key`} className="text-sm font-medium block mb-1.5 text-dark-200">
          Access Key ID
        </label>
        <input
          id={`${idPrefix}-access-key`}
          type="text"
          value={value.accessKeyId}
          onChange={(e) => onChange({ ...value, accessKeyId: e.target.value })}
          placeholder="AKIA..."
          autoComplete="off"
          className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-secret-key`} className="text-sm font-medium block mb-1.5 text-dark-200">
          Secret Access Key
        </label>
        <input
          id={`${idPrefix}-secret-key`}
          type="password"
          value={value.secretAccessKey}
          onChange={(e) => onChange({ ...value, secretAccessKey: e.target.value })}
          autoComplete="off"
          className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-session-token`} className="text-sm font-medium block mb-1.5 text-dark-200">
          Session Token <span className="text-dark-500 font-normal">(only for temporary credentials)</span>
        </label>
        <input
          id={`${idPrefix}-session-token`}
          type="password"
          value={value.sessionToken}
          onChange={(e) => onChange({ ...value, sessionToken: e.target.value })}
          autoComplete="off"
          className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-sm text-dark-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-dark-500 mt-1">
          Required for temporary/STS credentials, e.g. from{' '}
          <code className="font-mono">saml2aws</code>. Leave blank for long-lived IAM user keys.
        </p>
      </div>
    </div>
  );
}

function TestResultBanner({ result }: { result: { success: boolean; message: string } }) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border ${
        result.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
      }`}
    >
      {result.success ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
      )}
      <p className="text-xs text-dark-200">{result.message}</p>
    </div>
  );
}
