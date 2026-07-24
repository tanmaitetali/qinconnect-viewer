import type {
  RawLogEvent,
  ParsedLogEvent,
  LogEventType,
  ParsedMessage,
  ToolCall,
  ToolResult,
  TraceSpan,
  SessionMetrics,
  GuardrailEvent,
  DetectedIssue,
  DetectedIssueType,
  SessionSummary,
  SessionDetail,
  SessionParameters,
} from "./types";

// ─── Parse Raw Log Event ─────────────────────────────────────────────────────

export function parseLogEvent(raw: RawLogEvent): ParsedLogEvent | null {
  if (!raw.message) return null;

  try {
    const data = JSON.parse(raw.message);
    const eventType = detectEventType(data);
    const contactId = extractContactId(data);
    const sessionId = extractSessionId(data, raw.logStreamName);

    return {
      timestamp: raw.timestamp || 0,
      eventType,
      contactId,
      sessionId,
      data,
      raw: raw.message,
    };
  } catch {
    // Non-JSON log line — skip
    return null;
  }
}

function detectEventType(data: Record<string, unknown>): LogEventType {
  // Q in Connect uses "event_type" field in CloudWatch logs
  const type = (data.event_type as string) || (data.type as string) || "";
  if (type === "TRANSCRIPT_ORCHESTRATION_MESSAGE") return "TRANSCRIPT_ORCHESTRATION_MESSAGE";
  if (type === "TRANSCRIPT_AI_AGENT_TRACE") return "TRANSCRIPT_AI_AGENT_TRACE";
  if (type === "TRANSCRIPT_AGENTIC_MESSAGE") return "TRANSCRIPT_AGENTIC_MESSAGE";
  if (type === "TRANSCRIPT_LARGE_LANGUAGE_MODEL_INVOCATION") return "TRANSCRIPT_LARGE_LANGUAGE_MODEL_INVOCATION";
  return "UNKNOWN";
}

function extractContactId(data: Record<string, unknown>): string {
  const direct =
    (data.contactId as string) ||
    (data.ContactId as string) ||
    (data.contact_id as string) ||
    (data.contactArn as string)?.split("/").pop() ||
    "";
  if (direct) return direct;

  // Q in Connect's TRANSCRIPT_CREATE_SESSION event carries the Connect
  // contact ID in "session_name" (there is no top-level contact_id field).
  if (typeof data.session_name === "string" && data.session_name) {
    return data.session_name;
  }

  // TRANSCRIPT_AI_AGENT_TRACE / LLM_INVOCATION events embed the contact ID
  // inside the "span" string (e.g. "{..., contact_id=xxxx-xxxx, ...}").
  if (typeof data.span === "string") {
    const match = data.span.match(
      /\bcontact_id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (match) return match[1];
  }

  return "";
}

function extractSessionId(
  data: Record<string, unknown>,
  logStreamName?: string
): string {
  // Q in Connect uses "session_id" as the primary session identifier
  const sessionId =
    (data.session_id as string) ||
    (data.sessionId as string) ||
    (data.SessionId as string) ||
    "";

  if (sessionId) return sessionId;

  // Fall back to contact_id
  const contactId =
    (data.contact_id as string) ||
    (data.contactId as string) ||
    (data.ContactId as string) ||
    "";
  if (contactId) return contactId;

  // Fall back to log stream name (often contains the contact ID)
  if (logStreamName) {
    const match = logStreamName.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (match) return match[1];
  }

  return "unknown";
}

// ─── Parse Orchestration Messages ────────────────────────────────────────────

export function parseOrchestrationMessage(
  event: ParsedLogEvent
): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const data = event.data;
  const iteration = (data.orchestration_iteration as number) || 0;
  const participant = (data.participant as string) || "";
  const guardrailBlocked = data.guardrail_blocked as boolean | undefined;

  // Q in Connect format: top-level "values" field (may be JSON string or array)
  let values: unknown[] = [];
  if (data.values) {
    if (typeof data.values === "string") {
      try {
        values = JSON.parse(data.values);
      } catch {
        values = [];
      }
    } else if (Array.isArray(data.values)) {
      values = data.values;
    }
  }

  if (values.length === 0) {
    return messages;
  }

  for (const block of values) {
    const b = block as Record<string, unknown>;

    if (b.type === "text" && b.value) {
      messages.push({
        id: `${event.timestamp}-text-${messages.length}`,
        timestamp: event.timestamp,
        type: participant === "CUSTOMER" ? "customer" : "bot",
        text: b.value as string,
        orchestrationIteration: iteration,
        raw: b,
      });
    } else if (b.type === "tool_use" && b.name) {
      messages.push({
        id: `${event.timestamp}-tool_use-${b.tool_use_id || messages.length}`,
        timestamp: event.timestamp,
        type: "tool_use",
        text: `Tool: ${b.name}`,
        toolName: b.name as string,
        toolInput: b.arguments as Record<string, unknown> || b.input as Record<string, unknown> || {},
        orchestrationIteration: iteration,
        raw: b,
      });
    } else if (b.type === "tool_result") {
      // tool_result has values array or error field
      let resultContent: unknown = b.values || b.content || b.error || "";
      if (Array.isArray(resultContent)) {
        // Extract text values from the result
        const texts = (resultContent as Record<string, unknown>[])
          .filter((v) => v.type === "text")
          .map((v) => v.value as string);
        resultContent = texts.join("\n");
      }

      const toolResult = parseToolResult(resultContent || b.error);

      // If there's an explicit error field, mark as failed
      if (b.error) {
        toolResult.success = false;
        toolResult.error = b.error as string;
      }

      messages.push({
        id: `${event.timestamp}-tool_result-${b.tool_use_id || messages.length}`,
        timestamp: event.timestamp,
        type: "tool_result",
        text: toolResult.success
          ? toolResult.isEmpty
            ? "Tool result: empty"
            : "Tool result: success"
          : `Tool error: ${toolResult.error || "unknown"}`,
        toolResult,
        orchestrationIteration: iteration,
        raw: b,
      });
    }
  }

  // Inject guardrail info if blocked
  if (guardrailBlocked && messages.length > 0) {
    messages[messages.length - 1].text += " [GUARDRAIL BLOCKED]";
  }

  return messages;
}

function parseToolResult(content: unknown): ToolResult {
  if (!content) {
    return { success: true, content: null, isEmpty: true };
  }

  // String content
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      // Check for empty KB results
      if (parsed.results && Array.isArray(parsed.results) && parsed.results.length === 0) {
        return { success: true, content: parsed, isEmpty: true };
      }
      // Check for error field
      if (parsed.error) {
        return { success: false, content: parsed, isEmpty: false, error: parsed.error };
      }
      return { success: true, content: parsed, isEmpty: false };
    } catch {
      // Only flag as error if it looks like a structured error message,
      // not if "error" appears incidentally in content text (e.g. KB articles
      // mentioning "Error 142" in their body). Check for error-as-structure
      // patterns rather than substring matching on the whole content.
      const trimmed = content.trim();
      const looksLikeStructuredError =
        /^\{"error"\s*:/.test(trimmed) ||          // JSON with top-level "error" key
        /^error\s*:/i.test(trimmed) ||             // "Error: something"
        /^\{"status"\s*:\s*"error"/i.test(trimmed); // {"status":"error",...}
      if (looksLikeStructuredError) {
        return { success: false, content, isEmpty: false, error: content };
      }
      return { success: true, content, isEmpty: trimmed === "" };
    }
  }

  // Array content (from content blocks)
  if (Array.isArray(content)) {
    const textBlocks = content
      .filter((c: unknown) => (c as Record<string, unknown>).type === "text")
      .map((c: unknown) => (c as Record<string, unknown>).text as string);
    const combined = textBlocks.join("\n");
    return parseToolResult(combined);
  }

  // Object content
  const obj = content as Record<string, unknown>;
  if (obj.results && Array.isArray(obj.results) && (obj.results as unknown[]).length === 0) {
    return { success: true, content: obj, isEmpty: true };
  }
  if (obj.error) {
    return { success: false, content: obj, isEmpty: false, error: obj.error as string };
  }

  return { success: true, content: obj, isEmpty: false };
}

// ─── Parse Trace Spans ───────────────────────────────────────────────────────

export function parseTraceSpan(event: ParsedLogEvent): TraceSpan | null {
  const data = event.data;
  let span: Record<string, unknown> = {};

  // Q in Connect trace spans are typically a string with key=value pairs
  const rawSpan = data.span as string | Record<string, unknown>;

  if (typeof rawSpan === "string") {
    // Parse key=value pairs from the span string like:
    // "{span_id=xxx, usage_input_tokens=490, ...}"
    const cleaned = rawSpan.replace(/^\{|\}$/g, "");
    const pairs = cleaned.split(/,\s*/);
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        const key = pair.substring(0, eqIdx).trim();
        const value = pair.substring(eqIdx + 1).trim();
        span[key] = value;
      }
    }
  } else if (rawSpan && typeof rawSpan === "object") {
    span = rawSpan;
  } else {
    // Try extracting from data directly
    span = data;
  }

  const inputTokens = Number(span.usage_input_tokens || 0);
  const outputTokens = Number(span.usage_output_tokens || 0);
  const cacheReadInputTokens = Number(span.cache_read_input_tokens || 0);
  const timeToFirstTokenMs = Number(span.time_to_first_token_ms || 0);
  const modelId = String(span.request_model || span.model_id || "");

  // Only return if we have meaningful metrics
  if (inputTokens === 0 && outputTokens === 0 && timeToFirstTokenMs === 0) {
    return null;
  }

  const startTs = Number(span.start_timestamp || 0);
  const endTs = Number(span.end_timestamp || 0);
  const durationMs = startTs && endTs ? endTs - startTs : undefined;

  return {
    id: `${event.timestamp}-trace-${span.span_id || ""}`,
    timestamp: event.timestamp,
    spanName: String(span.span_name || span.operation_name || "inference"),
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    timeToFirstTokenMs,
    modelId: modelId || undefined,
    durationMs,
  };
}

// ─── Trace Span Field Extraction (bracket-aware) ─────────────────────────────
//
// Q in Connect trace "span" strings are a flat key=value list, but several
// values (input_messages, output_messages, response_finish_reasons, etc.)
// are themselves JSON arrays/objects containing commas. A naive comma-split
// (as used by parseTraceSpan above for simple numeric fields) corrupts
// anything that comes after the first JSON blob. This helper walks the
// string and respects bracket/quote nesting so JSON-valued fields can be
// extracted reliably regardless of position.

function extractSpanField(rawSpan: string, key: string): string | undefined {
  const marker = `${key}=`;
  const idx = rawSpan.indexOf(marker);
  if (idx === -1) return undefined;
  const start = idx + marker.length;
  const firstChar = rawSpan[start];

  if (firstChar === "[" || firstChar === "{") {
    const open = firstChar;
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < rawSpan.length; i++) {
      const ch = rawSpan[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === open) {
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0) return rawSpan.slice(start, i + 1);
      }
    }
    return rawSpan.slice(start); // unterminated — best effort
  }

  // Scalar value: read until the next ", identifier=" or end of string
  const rest = rawSpan.slice(start);
  const match = rest.match(/,\s*(?=[A-Za-z_][A-Za-z0-9_]*=)/);
  const end = match?.index !== undefined ? start + match.index : rawSpan.length;
  let value = rawSpan.slice(start, end).trim();
  if (value.endsWith("}") && !firstChar) value = value.slice(0, -1);
  return value;
}

// ─── Recover Tool Calls from execute_tool Trace Spans ────────────────────────
//
// Control-flow tools like "Complete" and "Escalate" are never emitted as
// tool_use/tool_result blocks inside TRANSCRIPT_ORCHESTRATION_MESSAGE events.
// The only record of them is an "execute_tool" span inside a
// TRANSCRIPT_AI_AGENT_TRACE event. Without this, those tool calls silently
// disappear from both the Tools panel AND the conversation transcript (the
// transcript only renders from `messages`, not `toolCalls`), which is why a
// tool like "Complete" showed up as an empty chat bubble instead of a proper
// tool-call bubble like PivitSendTool gets.
//
// This returns synthetic ParsedMessage entries (tool_use + tool_result) so
// the recovered call flows through the exact same rendering path as tool
// calls that do appear in orchestration messages.

function parseExecuteToolSpanMessages(
  event: ParsedLogEvent,
  existingToolUseIds: Set<string>,
  inferredIteration: number
): ParsedMessage[] {
  const rawSpan = event.data.span;
  if (typeof rawSpan !== "string" || !rawSpan.includes("span_name=execute_tool")) {
    return [];
  }

  const inputMessagesRaw = extractSpanField(rawSpan, "input_messages");
  if (!inputMessagesRaw) return [];

  let toolName = "";
  let toolUseId = "";
  let toolInput: Record<string, unknown> = {};

  try {
    const inputMessages = JSON.parse(inputMessagesRaw) as Array<Record<string, unknown>>;
    for (const m of inputMessages) {
      const values = (m.values as Array<Record<string, unknown>>) || [];
      for (const v of values) {
        const toolUse = v.toolUse as Record<string, unknown> | undefined;
        if (toolUse) {
          toolName = String(toolUse.name || "");
          toolUseId = String(toolUse.toolUseId || "");
          const rawInput = toolUse.input;
          if (typeof rawInput === "string") {
            try {
              toolInput = JSON.parse(rawInput);
            } catch {
              toolInput = {};
            }
          } else if (rawInput && typeof rawInput === "object") {
            toolInput = rawInput as Record<string, unknown>;
          }
        }
      }
    }
  } catch {
    return [];
  }

  if (!toolName) return [];
  if (toolUseId && existingToolUseIds.has(toolUseId)) return [];

  let result: ToolResult | undefined;
  const outputMessagesRaw = extractSpanField(rawSpan, "output_messages");
  if (outputMessagesRaw) {
    try {
      const outputMessages = JSON.parse(outputMessagesRaw) as Array<Record<string, unknown>>;
      for (const m of outputMessages) {
        const values = (m.values as Array<Record<string, unknown>>) || [];
        for (const v of values) {
          const toolResultBlock = v.toolResult as Record<string, unknown> | undefined;
          if (toolResultBlock) {
            result = parseToolResult(toolResultBlock.value ?? toolResultBlock.error ?? "");
          }
        }
      }
    } catch {
      // ignore malformed output — result stays undefined
    }
  }

  const spanId = extractSpanField(rawSpan, "span_id") || "";
  const startTs = Number(extractSpanField(rawSpan, "start_timestamp") || event.timestamp);
  const endTs = Number(extractSpanField(rawSpan, "end_timestamp") || 0);
  const idBase = toolUseId || `${event.timestamp}-execute_tool-${spanId}`;

  const recovered: ParsedMessage[] = [
    {
      id: `${idBase}-tool_use`,
      timestamp: startTs || event.timestamp,
      type: "tool_use",
      text: `Tool: ${toolName}`,
      toolName,
      toolInput,
      orchestrationIteration: inferredIteration,
      raw: { type: "tool_use", tool_use_id: toolUseId, name: toolName, arguments: toolInput },
    },
  ];

  if (result) {
    recovered.push({
      id: `${idBase}-tool_result`,
      timestamp: endTs || startTs || event.timestamp,
      type: "tool_result",
      text: result.success
        ? result.isEmpty
          ? "Tool result: empty"
          : "Tool result: success"
        : `Tool error: ${result.error || "unknown"}`,
      toolResult: result,
      orchestrationIteration: inferredIteration,
      raw: { type: "tool_result", tool_use_id: toolUseId, name: toolName },
    });
  }

  return recovered;
}

// Finds the orchestration_iteration of the most recent message at or before
// the given timestamp, falling back to 0 (untagged) if none precede it.
function inferIterationAt(messages: ParsedMessage[], timestamp: number): number {
  let iter = 0;
  for (const m of messages) {
    if (m.timestamp > timestamp) break;
    if (m.orchestrationIteration) iter = m.orchestrationIteration;
  }
  return iter;
}

// ─── Parse Guardrail Events ──────────────────────────────────────────────────

export function parseGuardrailEvent(
  event: ParsedLogEvent
): GuardrailEvent | null {
  const data = event.data;

  // Guardrail info can appear in various fields
  const guardrail =
    (data.guardrail as Record<string, unknown>) ||
    (data.guardrailResult as Record<string, unknown>) ||
    null;

  if (!guardrail && !data.guardrailAction) return null;

  const scope = ((guardrail?.scope as string) || (data.scope as string) || "INPUT") as
    | "INPUT"
    | "OUTPUT";
  const action = ((guardrail?.action as string) ||
    (data.guardrailAction as string) ||
    "NONE") as "NONE" | "BLOCKED" | "ANONYMIZED";

  return {
    id: `${event.timestamp}-guardrail`,
    timestamp: event.timestamp,
    guardrailId: (guardrail?.guardrailId as string) || (data.guardrailId as string) || "",
    guardrailName: (guardrail?.name as string) || (data.guardrailName as string),
    scope,
    action,
    matchedPolicies: (guardrail?.matchedPolicies as string[]) || [],
    message: (guardrail?.message as string) || (data.guardrailMessage as string),
  };
}

// ─── Extract Tool Calls ──────────────────────────────────────────────────────

export function extractToolCalls(messages: ParsedMessage[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  const pendingToolUses = new Map<string, ParsedMessage>();

  for (const msg of messages) {
    if (msg.type === "tool_use" && msg.toolName) {
      pendingToolUses.set(msg.id, msg);
      toolCalls.push({
        id: msg.id,
        timestamp: msg.timestamp,
        name: msg.toolName,
        input: msg.toolInput || {},
        orchestrationIteration: msg.orchestrationIteration || 0,
      });
    }

    if (msg.type === "tool_result" && msg.toolResult) {
      // Match to the most recent pending tool use
      const lastToolCall = toolCalls[toolCalls.length - 1];
      if (lastToolCall && !lastToolCall.result) {
        lastToolCall.result = msg.toolResult;
        lastToolCall.durationMs = msg.timestamp - lastToolCall.timestamp;
      }
    }
  }

  return toolCalls;
}

// ─── Compute Metrics ─────────────────────────────────────────────────────────

export function computeMetrics(spans: TraceSpan[]): SessionMetrics {
  const totalInputTokens = spans.reduce((sum, s) => sum + s.inputTokens, 0);
  const totalOutputTokens = spans.reduce((sum, s) => sum + s.outputTokens, 0);
  const totalCacheReadTokens = spans.reduce(
    (sum, s) => sum + s.cacheReadInputTokens,
    0
  );

  const ttftValues = spans
    .map((s) => s.timeToFirstTokenMs)
    .filter((v) => v > 0);
  const avgTimeToFirstToken =
    ttftValues.length > 0
      ? ttftValues.reduce((sum, v) => sum + v, 0) / ttftValues.length
      : 0;
  const maxTimeToFirstToken =
    ttftValues.length > 0 ? Math.max(...ttftValues) : 0;

  const cacheHitRatio =
    totalInputTokens > 0
      ? totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)
      : 0;

  // Count unique orchestration iterations from spans
  const totalOrchestrationIterations = spans.length;

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    avgTimeToFirstToken,
    maxTimeToFirstToken,
    totalOrchestrationIterations,
    cacheHitRatio,
    spans,
  };
}

// ─── Detect Issues ───────────────────────────────────────────────────────────

export function detectIssues(
  messages: ParsedMessage[],
  toolCalls: ToolCall[],
  guardrails: GuardrailEvent[]
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // Issue: Empty KB results
  for (const tc of toolCalls) {
    if (tc.result?.isEmpty && tc.name.toLowerCase().includes("retrieve")) {
      issues.push({
        id: `issue-empty-kb-${tc.id}`,
        type: "EMPTY_KB_RESULTS",
        severity: "warning",
        message: `Knowledge base returned empty results for "${tc.name}"`,
        timestamp: tc.timestamp,
        context: { toolName: tc.name, input: tc.input },
        orchestrationIteration: tc.orchestrationIteration,
      });
    }
  }

  // Issue: Tool errors
  for (const tc of toolCalls) {
    if (tc.result && !tc.result.success) {
      issues.push({
        id: `issue-tool-error-${tc.id}`,
        type: "TOOL_ERROR",
        severity: "error",
        message: `Tool "${tc.name}" returned error: ${tc.result.error || "unknown"}`,
        timestamp: tc.timestamp,
        context: { toolName: tc.name, error: tc.result.error },
        orchestrationIteration: tc.orchestrationIteration,
      });
    }
  }

  // Issue: Missing required parameters
  for (const msg of messages) {
    if (
      msg.type === "bot" &&
      msg.text.includes("Missing required parameters")
    ) {
      issues.push({
        id: `issue-missing-params-${msg.id}`,
        type: "MISSING_REQUIRED_PARAMETERS",
        severity: "error",
        message: "Bot encountered missing required parameters error",
        timestamp: msg.timestamp,
        context: { text: msg.text },
        orchestrationIteration: msg.orchestrationIteration,
      });
    }
  }

  // Issue: Guardrail blocks
  for (const g of guardrails) {
    if (g.action === "BLOCKED") {
      issues.push({
        id: `issue-guardrail-${g.id}`,
        type: "GUARDRAIL_BLOCKED",
        severity: "error",
        message: `Guardrail blocked ${g.scope} — ${g.guardrailName || g.guardrailId}`,
        timestamp: g.timestamp,
        context: {
          scope: g.scope,
          guardrailId: g.guardrailId,
          policies: g.matchedPolicies,
        },
      });
    }
  }

  // Text + tool_use in same orchestration iteration
  const iterationContent = new Map<number, Set<string>>();
  for (const msg of messages) {
    const iter = msg.orchestrationIteration || 0;
    if (iter === 0) continue;
    if (!iterationContent.has(iter)) {
      iterationContent.set(iter, new Set());
    }
    if (msg.type === "bot") iterationContent.get(iter)!.add("text");
    if (msg.type === "tool_use") iterationContent.get(iter)!.add("tool_use");
  }

  iterationContent.forEach((types, iter) => {
    if (types.has("text") && types.has("tool_use")) {
      issues.push({
        id: `issue-text-tooluse-iter-${iter}`,
        type: "TEXT_AND_TOOL_USE_SAME_ITERATION",
        severity: "warning",
        message: `Text and tool_use in same orchestration iteration ${iter}`,
        timestamp: messages.find((m) => m.orchestrationIteration === iter)?.timestamp || 0,
        context: { iteration: iter },
        orchestrationIteration: iter,
      });
    }
  });

  return issues;
}

// ─── Build Session Summary from Events ───────────────────────────────────────

export function buildSessionSummaries(
  events: ParsedLogEvent[]
): SessionSummary[] {
  // Group events by session ID
  const sessionMap = new Map<string, ParsedLogEvent[]>();

  for (const event of events) {
    const sid = event.sessionId;
    if (sid === "unknown") continue;
    if (!sessionMap.has(sid)) sessionMap.set(sid, []);
    sessionMap.get(sid)!.push(event);
  }

  const summaries: SessionSummary[] = [];

  sessionMap.forEach((sessionEvents, sessionId) => {
    const timestamps = sessionEvents.map((e) => e.timestamp).filter((t) => t > 0);
    if (timestamps.length === 0) return;

    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    // Count messages
    let messageCount = 0;
    let errorCount = 0;

    for (const event of sessionEvents) {
      if (event.eventType === "TRANSCRIPT_ORCHESTRATION_MESSAGE") {
        messageCount++;
      }
      // Quick error scan
      const raw = event.raw;
      if (
        raw.includes('"error"') ||
        raw.includes("BLOCKED") ||
        raw.includes('"results":[]')
      ) {
        errorCount++;
      }
    }

    // Find a non-empty contact ID from any event in the session
    let contactId = "";
    let firstCustomerMessage = "";
    for (const event of sessionEvents) {
      if (event.contactId && !contactId) {
        contactId = event.contactId;
      }
      // Try to extract first customer utterance for display
      if (!firstCustomerMessage && event.eventType === "TRANSCRIPT_ORCHESTRATION_MESSAGE") {
        const data = event.data;
        const participant = (data.participant as string) || "";
        if (participant === "CUSTOMER") {
          // Extract text from values
          let values: unknown[] = [];
          if (data.values) {
            if (typeof data.values === "string") {
              try { values = JSON.parse(data.values); } catch { values = []; }
            } else if (Array.isArray(data.values)) {
              values = data.values;
            }
          }
          for (const block of values) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && b.value) {
              firstCustomerMessage = (b.value as string).slice(0, 80);
              break;
            }
          }
        }
      }
      if (contactId && firstCustomerMessage) break;
    }

    summaries.push({
      sessionId,
      contactId: contactId || sessionId,
      startTime,
      endTime,
      duration: endTime - startTime,
      messageCount,
      hasErrors: errorCount > 0,
      errorCount,
      firstCustomerMessage: firstCustomerMessage || undefined,
    });
  });

  // Sort by start time descending (most recent first)
  summaries.sort((a, b) => b.startTime - a.startTime);
  return summaries;
}

// ─── Extract Session Parameters ──────────────────────────────────────────────

/**
 * Extracts contact attributes / parameters set during the session.
 * In Q in Connect, the AI agent "returns control" with parameters like
 * lob_type, menu_results, intent, etc. These appear in:
 * - Top-level fields in orchestration events
 * - Tool call inputs (arguments the agent passes to tools)
 * - Tool call results (JSON responses)
 * - The raw event "data" object at any level
 */
export function extractSessionParameters(events: ParsedLogEvent[], toolCalls: ToolCall[]): SessionParameters {
  const params: SessionParameters = {};

  // Internal/noise keys to always skip
  const SKIP_KEYS = new Set([
    "type", "tool_use_id", "name", "id", "timestamp", "values",
    "results", "content", "error", "success", "status_code",
    "requestId", "request_id", "ResponseMetadata",
    "$metadata", "httpStatusCode", "event_type", "session_id",
    "contact_id", "contactId", "sessionId", "participant",
    "orchestration_iteration", "guardrail_blocked", "model_id",
    "span", "span_name", "span_id", "start_timestamp", "end_timestamp",
    "usage_input_tokens", "usage_output_tokens", "usage_total_tokens",
    "cache_read_input_tokens", "time_to_first_token_ms",
    "response_finish_reasons", "request_model",
    "completion", "system_prompt", "messages",
    "contactArn", "ContactId", "SessionId",
    // Generic noise from AWS SDK responses
    "statusCode",
  ]);

  // Extract from ALL event data top-level fields
  // In Q in Connect, contact attributes (lob_type, menu_results, etc.)
  // can appear as top-level fields in orchestration events
  for (const event of events) {
    const data = event.data;

    // Scan all top-level fields of the event for scalar parameter values
    for (const [key, value] of Object.entries(data)) {
      if (SKIP_KEYS.has(key)) continue;
      if (value == null || value === "") continue;

      if (typeof value === "string") {
        const strVal = value;
        if (strVal.length > 500) continue;
        if (/^arn:aws:/.test(strVal)) continue;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strVal)) continue;

        // If string looks like JSON, parse it and extract inner fields
        // This handles Q in Connect's "output" field: "{\"lob_type\":\"CS\",...}"
        if ((strVal.startsWith("{") || strVal.startsWith("[")) && strVal.length > 2) {
          try {
            const parsed = JSON.parse(strVal);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              for (const [innerKey, innerVal] of Object.entries(parsed as Record<string, unknown>)) {
                if (SKIP_KEYS.has(innerKey)) continue;
                if (innerVal == null || innerVal === "") continue;
                if (typeof innerVal === "string" || typeof innerVal === "number" || typeof innerVal === "boolean") {
                  const innerStr = String(innerVal);
                  if (innerStr.length > 200) continue;
                  if (/^arn:aws:/.test(innerStr)) continue;
                  params[innerKey] = innerVal;
                }
              }
              continue; // Don't store the raw JSON string
            }
          } catch { /* not valid JSON */ }
        }

        // Regular short string
        if (strVal.length <= 200) {
          params[key] = value;
        }
      } else if (typeof value === "number" || typeof value === "boolean") {
        params[key] = value;
      }
    }

    // Check for explicit contact_attributes / session_attributes objects
    const attrFields = [
      data.contact_attributes, data.contactAttributes, data.ContactAttributes,
      data.session_attributes, data.sessionAttributes, data.SessionAttributes,
    ];

    for (const attrField of attrFields) {
      if (attrField && typeof attrField === "object" && !Array.isArray(attrField)) {
        const attrs = attrField as Record<string, unknown>;
        for (const [key, value] of Object.entries(attrs)) {
          if (value != null && value !== "" && !SKIP_KEYS.has(key)) {
            params[key] = flattenValue(value);
          }
        }
      }
    }
  }

  // Extract from tool call inputs — these are the arguments the agent passes
  for (const tc of toolCalls) {
    if (tc.input && typeof tc.input === "object") {
      extractFlatParams(tc.input, params, SKIP_KEYS);
    }

    // Extract from tool results
    if (tc.result?.content) {
      if (typeof tc.result.content === "string") {
        try {
          const parsed = JSON.parse(tc.result.content);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            extractFlatParams(parsed as Record<string, unknown>, params, SKIP_KEYS);
          }
        } catch { /* not JSON, skip */ }
      } else if (typeof tc.result.content === "object" && !Array.isArray(tc.result.content)) {
        extractFlatParams(tc.result.content as Record<string, unknown>, params, SKIP_KEYS);
      }
    }
  }

  return params;
}

/** Recursively extract scalar key-value pairs from an object (1 level deep for nested objects) */
function extractFlatParams(
  obj: Record<string, unknown>,
  params: SessionParameters,
  skipKeys: Set<string>
) {
  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue;
    if (value == null || value === "") continue;

    if (typeof value === "string") {
      const strVal = value;
      // Skip ARNs, UUIDs, and very long strings
      if (strVal.length > 500) continue;
      if (/^arn:aws:/.test(strVal)) continue;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strVal)) continue;

      // If the string looks like JSON (starts with { or [), try parsing it
      // This handles Q in Connect's "output" field which is a stringified JSON
      // e.g. output: "{\"lob_type\":\"CS\",\"uid\":\"123\"}"
      if ((strVal.startsWith("{") || strVal.startsWith("[")) && strVal.length > 2) {
        try {
          const parsed = JSON.parse(strVal);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            // Extract the inner object's fields as parameters
            for (const [innerKey, innerVal] of Object.entries(parsed as Record<string, unknown>)) {
              if (skipKeys.has(innerKey)) continue;
              if (innerVal == null || innerVal === "") continue;
              if (typeof innerVal === "string" || typeof innerVal === "number" || typeof innerVal === "boolean") {
                const innerStr = String(innerVal);
                if (innerStr.length > 200) continue;
                if (/^arn:aws:/.test(innerStr)) continue;
                params[innerKey] = innerVal;
              }
            }
            continue; // Don't store the raw JSON string itself
          }
        } catch { /* not valid JSON, store as regular string below */ }
      }

      // Regular string value — only store if reasonably short
      if (strVal.length <= 200) {
        params[key] = value;
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      params[key] = value;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // One level deep: extract nested object's scalar values
      const nested = value as Record<string, unknown>;
      for (const [nk, nv] of Object.entries(nested)) {
        if (skipKeys.has(nk)) continue;
        if (nv == null || nv === "") continue;
        if (typeof nv === "string" || typeof nv === "number" || typeof nv === "boolean") {
          const strNv = String(nv);
          if (strNv.length > 200) continue;
          if (/^arn:aws:/.test(strNv)) continue;
          params[nk] = nv;
        }
      }
    } else if (Array.isArray(value) && value.length > 0 && value.length <= 10) {
      const allScalar = value.every(v => typeof v === "string" || typeof v === "number");
      if (allScalar) {
        params[key] = value.join(", ");
      }
    }
  }
}

/** Flatten a value to a storable scalar */
function flattenValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

// ─── Build Full Session Detail ───────────────────────────────────────────────

export function buildSessionDetail(events: ParsedLogEvent[]): SessionDetail {
  const messages: ParsedMessage[] = [];
  const spans: TraceSpan[] = [];
  const guardrails: GuardrailEvent[] = [];
  const traceEvents: ParsedLogEvent[] = [];

  for (const event of events) {
    switch (event.eventType) {
      case "TRANSCRIPT_ORCHESTRATION_MESSAGE": {
        const parsed = parseOrchestrationMessage(event);
        messages.push(...parsed);
        // Check for guardrail data in orchestration messages
        const gr = parseGuardrailEvent(event);
        if (gr) guardrails.push(gr);
        break;
      }
      case "TRANSCRIPT_AI_AGENT_TRACE": {
        const span = parseTraceSpan(event);
        if (span) spans.push(span);
        // Traces can also contain guardrail info
        const grTrace = parseGuardrailEvent(event);
        if (grTrace) guardrails.push(grTrace);
        // Hold onto raw trace events — some tool calls (e.g. Complete,
        // Escalate) never appear as orchestration messages and can only
        // be recovered from "execute_tool" spans below.
        traceEvents.push(event);
        break;
      }
      case "TRANSCRIPT_AGENTIC_MESSAGE": {
        // Full prompt/completion pairs — extract any messages
        const agenticMessages = parseOrchestrationMessage(event);
        messages.push(...agenticMessages);
        break;
      }
      case "TRANSCRIPT_LARGE_LANGUAGE_MODEL_INVOCATION": {
        // LLM call details — usually has span-like metrics
        const llmSpan = parseTraceSpan(event);
        if (llmSpan) spans.push(llmSpan);
        break;
      }
    }
  }

  // Sort messages by timestamp
  messages.sort((a, b) => a.timestamp - b.timestamp);

  // Recover tool calls that only exist as "execute_tool" trace spans
  // (control-flow tools like Complete/Escalate have no orchestration
  // message counterpart) and inject them as proper tool_use/tool_result
  // messages so they render as tool-call bubbles in the conversation view,
  // not as blank text bubbles. Dedup key is the raw tool_use_id from the
  // orchestration message block (not ParsedMessage.id, which is a
  // synthetic composite string).
  const knownToolUseIds = new Set(
    messages
      .filter((m) => m.type === "tool_use")
      .map((m) => (m.raw as Record<string, unknown> | undefined)?.tool_use_id as string)
      .filter(Boolean)
  );
  const recoveredMessages: ParsedMessage[] = [];
  for (const traceEvent of traceEvents) {
    const inferredIteration = inferIterationAt(messages, traceEvent.timestamp);
    const recovered = parseExecuteToolSpanMessages(traceEvent, knownToolUseIds, inferredIteration);
    for (const m of recovered) {
      if (m.type === "tool_use" && m.raw) {
        const rawToolUseId = (m.raw as Record<string, unknown>).tool_use_id as string;
        if (rawToolUseId) knownToolUseIds.add(rawToolUseId);
      }
    }
    recoveredMessages.push(...recovered);
  }
  messages.push(...recoveredMessages);
  messages.sort((a, b) => a.timestamp - b.timestamp);

  const toolCalls = extractToolCalls(messages);

  const metrics = computeMetrics(spans);
  const detectedIssues = detectIssues(messages, toolCalls, guardrails);
  const parameters = extractSessionParameters(events, toolCalls);

  const timestamps = events.map((e) => e.timestamp).filter((t) => t > 0);
  const startTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const endTime = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  return {
    sessionId: events[0]?.sessionId || "unknown",
    contactId: events[0]?.contactId || "unknown",
    startTime,
    endTime,
    messages,
    toolCalls,
    metrics,
    guardrails,
    detectedIssues,
    parameters,
  };
}

// ─── Parse All Raw Events ────────────────────────────────────────────────────

export function parseAllEvents(rawEvents: RawLogEvent[]): ParsedLogEvent[] {
  const parsed: ParsedLogEvent[] = [];
  for (const raw of rawEvents) {
    const event = parseLogEvent(raw);
    if (event) parsed.push(event);
  }
  return parsed;
}
