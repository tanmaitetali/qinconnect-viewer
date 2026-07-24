"use client";

import { useState } from "react";
import type { DetectedIssue, ParsedMessage, ToolCall, SessionMetrics } from "@/lib/types";

interface ErrorDetectorProps {
  issues: DetectedIssue[];
  messages?: ParsedMessage[];
  toolCalls?: ToolCall[];
  metrics?: SessionMetrics;
}

export function ErrorDetector({ issues, messages, toolCalls, metrics }: ErrorDetectorProps) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const MODELS = [
    { id: "us.amazon.nova-pro-v1:0", label: "Amazon Nova Pro" },
    { id: "us.amazon.nova-lite-v1:0", label: "Amazon Nova Lite (fast)" },
  ];

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      // Read bedrock config from localStorage
      let bedrockConfig: Record<string, string> = {};
      try {
        const raw = localStorage.getItem("ai-agent-dashboard-config");
        if (raw) {
          const parsed = JSON.parse(raw);
          bedrockConfig = {
            bedrock_profile: parsed.bedrock_profile || "",
            bedrock_region: parsed.bedrock_region || "",
            bedrock_model_id: parsed.bedrock_model_id || MODELS[0].id,
          };
        }
      } catch { /* ignore */ }

      // If no stored config, still pass the model selection
      if (!bedrockConfig.bedrock_model_id) {
        bedrockConfig.bedrock_model_id = MODELS[0].id;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages || [],
          toolCalls: toolCalls || [],
          issues,
          metrics: metrics || {},
          bedrockConfig,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiAnalysis(data.data.analysis);
      } else {
        setAnalyzeError(data.error || "Analysis failed");
      }
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Network error");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* AI Analysis Button */}
      <div className="border border-dark-700 rounded-lg p-3 bg-dark-800/40">
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          aria-busy={analyzing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-dark-700 disabled:to-dark-700 disabled:text-dark-500 text-white text-xs font-medium rounded-md transition-all"
        >
          {analyzing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing with Bedrock...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Get AI Analysis &amp; Fix Recommendations
            </>
          )}
        </button>

        {analyzeError && (
          <p className="mt-2 text-[11px] text-red-400">{analyzeError}</p>
        )}

        {aiAnalysis && (
          <div className="mt-3 bg-dark-900 border border-dark-700 rounded-md p-3 max-h-80 overflow-y-auto">
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-[11px] font-medium text-purple-400">AI Analysis (Bedrock)</span>
            </div>
            <div className="text-[11px] text-dark-200 leading-relaxed whitespace-pre-wrap">
              {aiAnalysis}
            </div>
          </div>
        )}
      </div>

      {/* Issues count or clean state */}
      {issues.length === 0 ? (
        <div className="text-center py-2">
          <div className="w-10 h-10 rounded-full bg-green-900/20 flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs text-dark-400">No issues detected</p>
          <p className="text-[10px] text-dark-600 mt-0.5">This session looks clean</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex items-center gap-3 px-1">
            {issues.filter((i) => i.severity === "error").length > 0 && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-red-400 rounded-full" />
                {issues.filter((i) => i.severity === "error").length} error{issues.filter((i) => i.severity === "error").length !== 1 ? "s" : ""}
              </span>
            )}
            {issues.filter((i) => i.severity === "warning").length > 0 && (
              <span className="text-xs text-yellow-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                {issues.filter((i) => i.severity === "warning").length} warning{issues.filter((i) => i.severity === "warning").length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Issue list */}
          <div className="space-y-2">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: DetectedIssue }) {
  const [expanded, setExpanded] = useState(false);

  const severityConfig = {
    error: {
      border: "border-red-800/50",
      bg: "bg-red-900/10",
      icon: "✗",
      iconColor: "text-red-400",
      badge: "bg-red-900/30 text-red-400",
    },
    warning: {
      border: "border-yellow-800/50",
      bg: "bg-yellow-900/10",
      icon: "⚠",
      iconColor: "text-yellow-400",
      badge: "bg-yellow-900/30 text-yellow-400",
    },
    info: {
      border: "border-blue-800/50",
      bg: "bg-blue-900/10",
      icon: "ℹ",
      iconColor: "text-blue-400",
      badge: "bg-blue-900/30 text-blue-400",
    },
  };

  const config = severityConfig[issue.severity];

  return (
    <div className={`border rounded-lg ${config.border} ${config.bg}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3"
      >
        <div className="flex items-start gap-2">
          <span className={`text-sm flex-shrink-0 ${config.iconColor}`}>
            {config.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.badge}`}>
                {formatIssueType(issue.type)}
              </span>
            </div>
            <p className="text-xs text-dark-200 mt-1">{issue.message}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-dark-500">
              <span>{new Date(issue.timestamp).toLocaleTimeString()}</span>
              {issue.orchestrationIteration && (
                <span>· iter {issue.orchestrationIteration}</span>
              )}
            </div>
          </div>
          {issue.context && (
            <svg
              className={`w-4 h-4 text-dark-500 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {expanded && issue.context && (
        <div className="px-3 pb-3">
          <pre className="bg-dark-900 rounded p-2 text-[11px] text-dark-300 font-mono overflow-x-auto max-h-32 overflow-y-auto">
            {JSON.stringify(issue.context, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatIssueType(type: string): string {
  const labels: Record<string, string> = {
    EMPTY_KB_RESULTS: "Empty KB",
    MISSING_REQUIRED_PARAMETERS: "Missing Params",
    GUARDRAIL_BLOCKED: "Guardrail Block",
    TEXT_AND_TOOL_USE_SAME_ITERATION: "Text + Tool Use",
    TOOL_ERROR: "Tool Error",
    MAX_ITERATIONS_REACHED: "Max Iterations",
    UNKNOWN_ERROR: "Error",
  };
  return labels[type] || type;
}
