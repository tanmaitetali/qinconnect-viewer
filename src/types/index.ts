// Re-export all types from lib/types for backward compatibility
export type { SessionSummary, SessionMetrics, GuardrailEvent } from "@/lib/types";

// ─── Types used by the /session/[id] detail page components ──────────────────

/**
 * ConversationMessage — shape consumed by ConversationTimeline.
 * Represents a single customer or bot message in the older session detail view.
 */
export interface ConversationMessage {
  timestamp: number;
  participant: "CUSTOMER" | "AGENT";
  text: string;
  orchestration_iteration?: number;
  guardrail_blocked?: boolean;
}

/**
 * ToolCall — shape consumed by ToolCallsPanel.
 * Represents a single tool invocation in the session.
 */
export interface ToolCall {
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
  orchestration_iteration?: number;
  timestamp?: number;
}

/**
 * ToolResult — shape consumed by ToolCallsPanel.
 * Represents the outcome of a tool call.
 */
export interface ToolResult {
  tool_use_id: string;
  status: "success" | "error" | "empty";
  content: unknown;
  error?: string;
}

/**
 * DetectedIssue — shape consumed by IssuesPanel.
 * Represents an auto-detected problem in the session.
 */
export interface DetectedIssue {
  id: string;
  type: string;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  timestamp: number;
  orchestration_iteration?: number;
  details?: Record<string, unknown>;
}

// ─── ParsedSession — the full shape returned by /api/session/[id] ────────────

export interface ParsedSession {
  session_id: string;
  contact_id?: string;
  outcome: "Complete" | "Escalate" | "Error" | "Unknown";
  start_time: string;
  end_time?: string;
  messages: ConversationMessage[];
  tool_calls: ToolCall[];
  tool_results: ToolResult[];
  metrics: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    avgTimeToFirstToken: number;
    maxTimeToFirstToken: number;
    totalOrchestrationIterations: number;
    cacheHitRatio: number;
    spans: Array<{
      id: string;
      timestamp: number;
      spanName: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      timeToFirstTokenMs: number;
      modelId?: string;
      durationMs?: number;
    }>;
  };
  issues: DetectedIssue[];
  has_errors: boolean;
}
