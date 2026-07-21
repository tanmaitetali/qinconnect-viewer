"use client";

import { useState } from "react";
import type { ToolCall } from "@/lib/types";

interface ToolCallPanelProps {
  toolCalls: ToolCall[];
}

export function ToolCallPanel({ toolCalls }: ToolCallPanelProps) {
  if (toolCalls.length === 0) {
    return (
      <div className="p-4 text-center text-dark-500 text-sm">
        No tool calls in this session
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wider px-1 mb-3">
        Tool Calls ({toolCalls.length})
      </h3>
      {toolCalls.map((tc) => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = !toolCall.result
    ? "border-dark-700"
    : toolCall.result.success
      ? toolCall.result.isEmpty
        ? "border-yellow-800/50"
        : "border-green-800/50"
      : "border-red-800/50";

  const statusBg = !toolCall.result
    ? "bg-dark-800"
    : toolCall.result.success
      ? toolCall.result.isEmpty
        ? "bg-yellow-900/10"
        : "bg-green-900/10"
      : "bg-red-900/10";

  return (
    <div className={`border rounded-lg ${statusColor} ${statusBg}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ToolIcon name={toolCall.name} />
            <span className="text-sm font-medium text-dark-200">
              {toolCall.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {toolCall.result && (
              <StatusBadge result={toolCall.result} />
            )}
            <svg
              className={`w-4 h-4 text-dark-500 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 text-[10px] text-dark-500">
          <span>Iteration {toolCall.orchestrationIteration}</span>
          {toolCall.durationMs != null && toolCall.durationMs > 0 && (
            <span>{toolCall.durationMs}ms</span>
          )}
          <span>{new Date(toolCall.timestamp).toLocaleTimeString()}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <p className="text-[10px] text-dark-400 uppercase tracking-wider mb-1">
              Input
            </p>
            <pre className="bg-dark-900 rounded p-2 text-[11px] text-dark-300 font-mono overflow-x-auto max-h-40 overflow-y-auto">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>

          {toolCall.result && (
            <div>
              <p className="text-[10px] text-dark-400 uppercase tracking-wider mb-1">
                Result
              </p>
              <pre className="bg-dark-900 rounded p-2 text-[11px] text-dark-300 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(toolCall.result.content, null, 2)}
              </pre>
              {toolCall.result.error && (
                <p className="mt-1 text-xs text-red-400">
                  Error: {toolCall.result.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.includes("retrieve") || lower.includes("search") || lower.includes("kb")) {
    return (
      <div className="w-5 h-5 rounded bg-purple-900/30 flex items-center justify-center">
        <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    );
  }
  if (lower.includes("escalat") || lower.includes("transfer")) {
    return (
      <div className="w-5 h-5 rounded bg-red-900/30 flex items-center justify-center">
        <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      </div>
    );
  }
  if (lower.includes("complete") || lower.includes("end")) {
    return (
      <div className="w-5 h-5 rounded bg-green-900/30 flex items-center justify-center">
        <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded bg-dark-700 flex items-center justify-center">
      <svg className="w-3 h-3 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
  );
}

function StatusBadge({ result }: { result: ToolCall["result"] }) {
  if (!result) return null;

  if (result.success && !result.isEmpty) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-400">
        ✓
      </span>
    );
  }
  if (result.success && result.isEmpty) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400">
        ∅
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400">
      ✗
    </span>
  );
}
