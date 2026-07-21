// ─── Core Event Types ────────────────────────────────────────────────────────

export type LogEventType =
  | "TRANSCRIPT_ORCHESTRATION_MESSAGE"
  | "TRANSCRIPT_AI_AGENT_TRACE"
  | "TRANSCRIPT_AGENTIC_MESSAGE"
  | "TRANSCRIPT_LARGE_LANGUAGE_MODEL_INVOCATION"
  | "UNKNOWN";

// ─── Parsed Message Types ────────────────────────────────────────────────────

export interface ParsedMessage {
  id: string;
  timestamp: number;
  type: "customer" | "bot" | "tool_use" | "tool_result" | "system";
  text: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: ToolResult;
  orchestrationIteration?: number;
  raw?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  content: unknown;
  isEmpty: boolean;
  error?: string;
}

export interface ToolCall {
  id: string;
  timestamp: number;
  name: string;
  input: Record<string, unknown>;
  result?: ToolResult;
  orchestrationIteration: number;
  durationMs?: number;
}

// ─── Trace / Metrics Types ───────────────────────────────────────────────────

export interface TraceSpan {
  id: string;
  timestamp: number;
  spanName: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  timeToFirstTokenMs: number;
  modelId?: string;
  durationMs?: number;
}

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  avgTimeToFirstToken: number;
  maxTimeToFirstToken: number;
  totalOrchestrationIterations: number;
  cacheHitRatio: number;
  spans: TraceSpan[];
}

// ─── Guardrail Types ─────────────────────────────────────────────────────────

export interface GuardrailEvent {
  id: string;
  timestamp: number;
  guardrailId: string;
  guardrailName?: string;
  scope: "INPUT" | "OUTPUT";
  action: "NONE" | "BLOCKED" | "ANONYMIZED";
  matchedPolicies?: string[];
  message?: string;
}

// ─── Error Detection Types ───────────────────────────────────────────────────

export type DetectedIssueType =
  | "EMPTY_KB_RESULTS"
  | "MISSING_REQUIRED_PARAMETERS"
  | "GUARDRAIL_BLOCKED"
  | "TEXT_AND_TOOL_USE_SAME_ITERATION"
  | "TOOL_ERROR"
  | "MAX_ITERATIONS_REACHED"
  | "UNKNOWN_ERROR";

export interface DetectedIssue {
  id: string;
  type: DetectedIssueType;
  severity: "error" | "warning" | "info";
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  orchestrationIteration?: number;
}

// ─── Session Types ───────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  contactId: string;
  startTime: number;
  endTime: number;
  duration: number;
  messageCount: number;
  hasErrors: boolean;
  errorCount: number;
  firstCustomerMessage?: string;
}

export interface SessionDetail {
  sessionId: string;
  contactId: string;
  startTime: number;
  endTime: number;
  messages: ParsedMessage[];
  toolCalls: ToolCall[];
  metrics: SessionMetrics;
  guardrails: GuardrailEvent[];
  detectedIssues: DetectedIssue[];
}

// ─── Raw CloudWatch Log Event ────────────────────────────────────────────────

export interface RawLogEvent {
  timestamp?: number;
  message?: string;
  ingestionTime?: number;
  logStreamName?: string;
}

export interface ParsedLogEvent {
  timestamp: number;
  eventType: LogEventType;
  contactId: string;
  sessionId: string;
  data: Record<string, unknown>;
  raw: string;
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
  nextToken?: string;
}

export interface LogGroupInfo {
  name: string;
  arn?: string;
  storedBytes?: number;
  creationTime?: number;
}
