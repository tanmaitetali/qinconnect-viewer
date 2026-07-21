"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, FolderSearch, BrainCircuit, ScrollText } from "lucide-react";

interface LogsSettings {
  aws_profile: string;
  aws_region: string;
  log_group_name: string;
}

interface BedrockSettings {
  aws_profile: string;
  aws_region: string;
  model_id: string;
}

interface DashboardSettings {
  logs: LogsSettings;
  bedrock: BedrockSettings;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<DashboardSettings>({
    logs: {
      aws_profile: "",
      aws_region: "us-east-1",
      log_group_name: "",
    },
    bedrock: {
      aws_profile: "",
      aws_region: "us-east-1",
      model_id: "us.anthropic.claude-sonnet-4-20250514-v1:0",
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"logs" | "bedrock" | null>(null);
  const [testResult, setTestResult] = useState<{ section: string; success: boolean; message: string } | null>(null);
  const [logGroups, setLogGroups] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.data) {
        setSettings(data.data);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleTestLogs = async () => {
    setTesting("logs");
    setTestResult(null);
    try {
      const response = await fetch("/api/log-groups");
      const data = await response.json();

      if (!response.ok) {
        setTestResult({ section: "logs", success: false, message: data.error || "Connection failed" });
      } else {
        const groups = data.data || [];
        setTestResult({
          section: "logs",
          success: true,
          message: `Connected! Found ${groups.length} AI agent log group(s).`,
        });
        if (groups.length > 0) {
          setLogGroups(groups.map((g: { name: string }) => g.name));
        }
      }
    } catch (err) {
      setTestResult({
        section: "logs",
        success: false,
        message: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(null);
    }
  };

  const handleTestBedrock = async () => {
    setTesting("bedrock");
    setTestResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ type: "customer", text: "test", timestamp: Date.now() }],
          toolCalls: [],
          issues: [],
          metrics: {},
        }),
      });
      const data = await response.json();

      if (data.success) {
        setTestResult({
          section: "bedrock",
          success: true,
          message: "Bedrock connection successful. Model responded.",
        });
      } else {
        setTestResult({
          section: "bedrock",
          success: false,
          message: data.error || "Bedrock invocation failed",
        });
      }
    } catch (err) {
      setTestResult({
        section: "bedrock",
        success: false,
        message: err instanceof Error ? err.message : "Bedrock connection failed",
      });
    } finally {
      setTesting(null);
    }
  };

  const handleDiscoverGroups = async () => {
    setLoadingGroups(true);
    try {
      const response = await fetch("/api/log-groups");
      const data = await response.json();
      if (data.success && data.data) {
        setLogGroups(data.data.map((g: { name: string }) => g.name));
      }
    } catch {
      // ignore
    } finally {
      setLoadingGroups(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure credentials for log viewing and AI analysis
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
            <CardDescription>
              AWS credentials for reading CloudWatch logs from your Connect instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">AWS Profile</label>
              <input
                type="text"
                value={settings.logs.aws_profile}
                onChange={(e) =>
                  setSettings({ ...settings, logs: { ...settings.logs, aws_profile: e.target.value } })
                }
                placeholder="cx-qa"
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Named profile from ~/.aws/credentials for CloudWatch access.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">AWS Region</label>
              <input
                type="text"
                value={settings.logs.aws_region}
                onChange={(e) =>
                  setSettings({ ...settings, logs: { ...settings.logs, aws_region: e.target.value } })
                }
                placeholder="us-east-1"
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Log Group Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.logs.log_group_name}
                  onChange={(e) =>
                    setSettings({ ...settings, logs: { ...settings.logs, log_group_name: e.target.value } })
                  }
                  placeholder="/aws/connect/ai-agents/your-instance"
                  className="flex-1 px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscoverGroups}
                  disabled={loadingGroups}
                >
                  {loadingGroups ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderSearch className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {logGroups.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Discovered log groups:</p>
                  {logGroups.map((group) => (
                    <button
                      key={group}
                      onClick={() =>
                        setSettings({ ...settings, logs: { ...settings.logs, log_group_name: group } })
                      }
                      className="block w-full text-left px-2 py-1.5 text-xs font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    >
                      {group}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestLogs}
              disabled={testing === "logs"}
            >
              {testing === "logs" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Test Connection
            </Button>

            {testResult?.section === "logs" && (
              <TestResultBanner result={testResult} />
            )}
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
              AWS credentials for Bedrock model invocation (AI session analysis).
              Can use a different profile/region than bot logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">AWS Profile</label>
              <input
                type="text"
                value={settings.bedrock.aws_profile}
                onChange={(e) =>
                  setSettings({ ...settings, bedrock: { ...settings.bedrock, aws_profile: e.target.value } })
                }
                placeholder="default"
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Named profile with Bedrock access. Can differ from the logs profile.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">AWS Region</label>
              <input
                type="text"
                value={settings.bedrock.aws_region}
                onChange={(e) =>
                  setSettings({ ...settings, bedrock: { ...settings.bedrock, aws_region: e.target.value } })
                }
                placeholder="us-east-1"
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Model ID</label>
              <input
                type="text"
                value={settings.bedrock.model_id}
                onChange={(e) =>
                  setSettings({ ...settings, bedrock: { ...settings.bedrock, model_id: e.target.value } })
                }
                placeholder="us.anthropic.claude-sonnet-4-20250514-v1:0"
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Bedrock model ID. Cross-region inference IDs start with the region prefix.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestBedrock}
              disabled={testing === "bedrock"}
            >
              {testing === "bedrock" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Test Bedrock
            </Button>

            {testResult?.section === "bedrock" && (
              <TestResultBanner result={testResult} />
            )}
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              "Saved!"
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TestResultBanner({ result }: { result: { success: boolean; message: string } }) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border ${
        result.success
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-red-500/10 border-red-500/30"
      }`}
    >
      {result.success ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
      )}
      <p className="text-xs">{result.message}</p>
    </div>
  );
}
