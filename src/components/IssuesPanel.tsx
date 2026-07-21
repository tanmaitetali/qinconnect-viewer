"use client";

import type { DetectedIssue } from "@/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface IssuesPanelProps {
  issues: DetectedIssue[];
}

const severityConfig = {
  error: {
    icon: AlertCircle,
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    iconColor: "text-red-400",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    iconColor: "text-amber-400",
    label: "Warning",
  },
  info: {
    icon: Info,
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    iconColor: "text-blue-400",
    label: "Info",
  },
};

export function IssuesPanel({ issues }: IssuesPanelProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <div className="text-emerald-400 mb-2">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p>No issues detected in this session.</p>
      </div>
    );
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  return (
    <div className="p-4 space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle className="h-4 w-4" /> {errorCount} error{errorCount > 1 ? "s" : ""}
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-4 w-4" /> {warningCount} warning{warningCount > 1 ? "s" : ""}
          </span>
        )}
        {infoCount > 0 && (
          <span className="flex items-center gap-1 text-blue-400">
            <Info className="h-4 w-4" /> {infoCount} info
          </span>
        )}
      </div>

      {/* Issues List */}
      <div className="space-y-3">
        {issues.map((issue) => {
          const config = severityConfig[issue.severity];
          const Icon = config.icon;

          return (
            <div
              key={issue.id}
              className={cn(
                "rounded-lg border p-4",
                config.bg,
                config.border
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconColor)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-sm">{issue.title}</h4>
                    {issue.orchestration_iteration !== undefined && (
                      <span className="text-xs text-muted-foreground font-mono">
                        iter #{issue.orchestration_iteration}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                  {issue.details && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        Show details
                      </summary>
                      <pre className="mt-2 text-xs bg-zinc-900 rounded p-2 overflow-x-auto text-zinc-400 font-mono max-h-32 overflow-y-auto">
                        {JSON.stringify(issue.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
