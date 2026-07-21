"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ConversationTimeline } from "@/components/ConversationTimeline";
import { ToolCallsPanel } from "@/components/ToolCallsPanel";
import { MetricsPanel } from "@/components/MetricsPanel";
import { IssuesPanel } from "@/components/IssuesPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ParsedSession } from "@/types";
import { cn, formatDuration, formatTimestamp } from "@/lib/utils";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

type TabId = "conversation" | "tools" | "metrics" | "issues";

const tabs: { id: TabId; label: string }[] = [
  { id: "conversation", label: "Conversation" },
  { id: "tools", label: "Tools" },
  { id: "metrics", label: "Metrics" },
  { id: "issues", label: "Issues" },
];

const outcomeBadgeVariant = {
  Complete: "success" as const,
  Escalate: "warning" as const,
  Error: "destructive" as const,
  Unknown: "secondary" as const,
};

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<ParsedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("conversation");

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      setError(null);

      try {
        const settings = localStorage.getItem("ai-agent-dashboard-settings");
        const urlParams = new URLSearchParams();

        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.aws_region) urlParams.set("region", parsed.aws_region);
          if (parsed.log_group_name) urlParams.set("logGroup", parsed.log_group_name);
          if (parsed.aws_profile) urlParams.set("profile", parsed.aws_profile);
        }

        const response = await fetch(
          `/api/session/${encodeURIComponent(sessionId)}?${urlParams.toString()}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch session");
        }

        setSession(data.session);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      fetchSession();
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to sessions
          </Button>
        </Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  const issueCount = session.issues.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-3">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to sessions
          </Button>
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-sm font-bold">{session.session_id}</h1>
              <Badge variant={outcomeBadgeVariant[session.outcome]}>
                {session.outcome}
              </Badge>
            </div>
            {session.contact_id && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                Contact: {session.contact_id}
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>Started: {formatTimestamp(session.start_time)}</span>
              {session.end_time && session.start_time && (
                <span>
                  Duration:{" "}
                  {formatDuration(
                    new Date(session.end_time).getTime() - new Date(session.start_time).getTime()
                  )}
                </span>
              )}
              <span>{session.messages.length} messages</span>
              <span>{session.tool_calls.length} tool calls</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-4">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.id === "issues" && issueCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400">
                  {issueCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "conversation" && (
          <ConversationTimeline messages={session.messages} />
        )}
        {activeTab === "tools" && (
          <ToolCallsPanel toolCalls={session.tool_calls} toolResults={session.tool_results} />
        )}
        {activeTab === "metrics" && <MetricsPanel metrics={session.metrics} guardrails={[]} />}
        {activeTab === "issues" && <IssuesPanel issues={session.issues} />}
      </div>
    </div>
  );
}
