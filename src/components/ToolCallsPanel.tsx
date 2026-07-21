"use client";

import type { ToolCall, ToolResult } from "@/types";
import { cn } from "@/lib/utils";
import { Wrench, ArrowRight, CheckCircle2, XCircle } from "lucide-react";

interface ToolCallsPanelProps {
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}

export function ToolCallsPanel({ toolCalls, toolResults }: ToolCallsPanelProps) {
  if (toolCalls.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No tool calls found in this session.
      </div>
    );
  }

  // Match tool calls with their results
  const matchedCalls = toolCalls.map((call) => {
    const result = toolResults.find((r) => r.tool_use_id === call.tool_use_id);
    return { call, result };
  });

  return (
    <div className="space-y-4 p-4">
      {matchedCalls.map(({ call, result }, index) => (
        <div
          key={index}
          className="border border-amber-500/20 rounded-lg overflow-hidden"
        >
          {/* Tool Call Header */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
            <Wrench className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-sm font-medium text-amber-300">
              {call.name}
            </span>
            {call.orchestration_iteration !== undefined && (
              <span className="text-xs text-muted-foreground ml-auto">
                iteration #{call.orchestration_iteration}
              </span>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Input
              </span>
            </div>
            <pre className="text-xs bg-zinc-900 rounded p-3 overflow-x-auto text-zinc-300 font-mono">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>

          {/* Result */}
          {result && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                {result.status === "error" ? (
                  <XCircle className="h-3 w-3 text-red-400" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium uppercase tracking-wider",
                    result.status === "error"
                      ? "text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {result.status === "error" ? "Error" : "Result"}
                </span>
              </div>
              <pre
                className={cn(
                  "text-xs rounded p-3 overflow-x-auto font-mono max-h-64 overflow-y-auto",
                  result.status === "error"
                    ? "bg-red-500/5 border border-red-500/20 text-red-300"
                    : "bg-zinc-900 text-zinc-300"
                )}
              >
                {typeof result.content === "string"
                  ? result.content
                  : JSON.stringify(result.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
