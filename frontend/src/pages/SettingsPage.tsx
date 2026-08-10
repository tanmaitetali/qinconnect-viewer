import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { CheckCircle2, XCircle, Loader2, FolderSearch, BrainCircuit, ScrollText } from 'lucide-react';
import { useCredentials } from '../credentials/CredentialsContext';
import type { AwsCredentials } from '../credentials/types';
import { parseCredentials, maskSecret } from '../credentials/parseCredentials';
import { discoverLogGroups } from '../lib/cloudwatch';
import { analyzeSession } from '../lib/bedrock';

export function SettingsPage() {
  const { settings, saveAll } = useCredentials();

  const [logsCreds, setLogsCreds] = useState<AwsCredentials | null>(settings.logs.credentials);
  const [logsRegion, setLogsRegion] = useState(settings.logs.region);
  const [logGroupName, setLogGroupName] = useState(settings.logs.logGroupName);

  const [bedrockCreds, setBedrockCreds] = useState<AwsCredentials | null>(settings.bedrock.credentials);
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

  // Auto-save: persist settings whenever any value changes (skip initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    saveAll({
      logs: { credentials: logsCreds, region: logsRegion, logGroupName },
      bedrock: { credentials: bedrockCreds, region: bedrockRegion, modelId },
    });
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [logsCreds, logsRegion, logGroupName, bedrockCreds, bedrockRegion, modelId, saveAll]);

  const handleTestLogs = async () => {
    const credentials = logsCreds;
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
    const credentials = bedrockCreds;
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
    const credentials = logsCreds;
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
            <CredentialPaste value={logsCreds} onChange={setLogsCreds} idPrefix="logs" />

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

        {/* Configure AI (Bedrock) — optional */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-purple-400" />
              <CardTitle className="text-base">Configure AI <span className="text-xs font-normal text-dark-500">(optional)</span></CardTitle>
            </div>
            <CardDescription>
              Optional. Configure Bedrock credentials to enable AI-powered session analysis.
              Can use different credentials than bot logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CredentialPaste value={bedrockCreds} onChange={setBedrockCreds} idPrefix="bedrock" />

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
          <Link to="/">
            <Button>{saved ? 'Saved!' : 'Save Settings'}</Button>
          </Link>
          <p className="text-xs text-dark-500">Settings auto-save when you make changes.</p>
        </div>
      </div>
    </div>
  );
}

const PASTE_PLACEHOLDER = `Paste credentials in any of these formats:

export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...

— or AWS CLI / saml2aws —
[profile]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
aws_session_token = ...
region = us-east-1

— or JSON from \`aws sts assume-role\` —
{ "Credentials": { "AccessKeyId": "...", "SecretAccessKey": "...", "SessionToken": "..." } }`;

function CredentialPaste({
  value,
  onChange,
  idPrefix,
}: {
  value: AwsCredentials | null;
  onChange: (next: AwsCredentials | null) => void;
  idPrefix: string;
}) {
  const [editing, setEditing] = useState(!value);
  const [paste, setPaste] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSave = () => {
    const result = parseCredentials(paste);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    setParseError(null);
    setPaste('');
    setEditing(false);
    onChange({
      accessKeyId: result.creds.accessKeyId,
      secretAccessKey: result.creds.secretAccessKey,
      sessionToken: result.creds.sessionToken,
    });
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-paste`} className="text-sm font-medium block mb-1.5 text-dark-200">
          AWS Credentials
        </label>
        <textarea
          id={`${idPrefix}-paste`}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && paste.trim()) {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder={PASTE_PLACEHOLDER}
          rows={8}
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-2 rounded-md bg-dark-800 border border-dark-700 text-xs text-dark-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {parseError && (
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-red-500/10 border-red-500/30">
            <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-dark-200">{parseError}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={!paste.trim()}>
            Save Credentials
          </Button>
          {value && (
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-mono text-dark-300 space-y-0.5">
        <div>access key id: {value?.accessKeyId}</div>
        <div>secret: {maskSecret(value?.secretAccessKey)}</div>
        {value?.sessionToken && <div>token: {maskSecret(value.sessionToken)}</div>}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPaste('');
            setParseError(null);
            setEditing(true);
          }}
        >
          Replace
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange(null)}>
          Clear
        </Button>
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
