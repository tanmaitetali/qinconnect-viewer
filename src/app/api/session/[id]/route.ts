import { NextRequest, NextResponse } from "next/server";
import { fetchSessionEvents } from "@/lib/cloudwatch";
import { parseAllEvents, buildSessionDetail } from "@/lib/parser";
import type { ParsedSession, ConversationMessage, ToolCall, ToolResult, DetectedIssue } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id: sessionId } = params;
    const searchParams = request.nextUrl.searchParams;
    const logGroupName = searchParams.get("logGroup") || undefined;
    const hoursBack = parseInt(searchParams.get("hoursBack") || "48", 10);

    const now = Date.now();
    const startTime = now - hoursBack * 60 * 60 * 1000;

    const rawEvents = await fetchSessionEvents(sessionId, {
      logGroupName,
      startTime,
      endTime: now,
    });

    const parsedEvents = parseAllEvents(rawEvents);
    const detail = buildSessionDetail(parsedEvents);

    // Transform from the internal SessionDetail shape to the ParsedSession
    // shape expected by the /session/[id] page components
    const messages: ConversationMessage[] = detail.messages
      .filter((m) => m.type === "customer" || m.type === "bot")
      .map((m) => ({
        timestamp: m.timestamp,
        participant: m.type === "customer" ? "CUSTOMER" as const : "AGENT" as const,
        text: m.text,
        orchestration_iteration: m.orchestrationIteration,
        guardrail_blocked: m.text.includes("[GUARDRAIL BLOCKED]"),
      }));

    const toolCalls: ToolCall[] = detail.toolCalls.map((tc) => ({
      tool_use_id: tc.id,
      name: tc.name,
      input: tc.input,
      orchestration_iteration: tc.orchestrationIteration,
      timestamp: tc.timestamp,
    }));

    const toolResults: ToolResult[] = detail.toolCalls
      .filter((tc) => tc.result)
      .map((tc) => ({
        tool_use_id: tc.id,
        status: tc.result!.success
          ? tc.result!.isEmpty
            ? "empty" as const
            : "success" as const
          : "error" as const,
        content: tc.result!.content,
        error: tc.result!.error,
      }));

    const issues: DetectedIssue[] = detail.detectedIssues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      title: formatIssueTitle(issue.type),
      description: issue.message,
      timestamp: issue.timestamp,
      orchestration_iteration: issue.orchestrationIteration,
      details: issue.context,
    }));

    // Determine session outcome
    const hasErrors = issues.some((i) => i.severity === "error");
    const lastBotMessage = detail.messages.filter((m) => m.type === "bot").pop();
    let outcome: ParsedSession["outcome"] = "Unknown";
    if (hasErrors) {
      outcome = "Error";
    } else if (lastBotMessage?.text.toLowerCase().includes("transfer") ||
               lastBotMessage?.text.toLowerCase().includes("agent")) {
      outcome = "Escalate";
    } else if (detail.messages.length > 0) {
      outcome = "Complete";
    }

    const session: ParsedSession = {
      session_id: detail.sessionId,
      contact_id: detail.contactId,
      outcome,
      start_time: new Date(detail.startTime).toISOString(),
      end_time: detail.endTime ? new Date(detail.endTime).toISOString() : undefined,
      messages,
      tool_calls: toolCalls,
      tool_results: toolResults,
      metrics: detail.metrics,
      issues,
      has_errors: hasErrors,
    };

    return NextResponse.json({ session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching session";
    console.error("GET /api/session/[id] error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

function formatIssueTitle(type: string): string {
  const titles: Record<string, string> = {
    EMPTY_KB_RESULTS: "Empty Knowledge Base Results",
    MISSING_REQUIRED_PARAMETERS: "Missing Required Parameters",
    GUARDRAIL_BLOCKED: "Guardrail Blocked",
    TEXT_AND_TOOL_USE_SAME_ITERATION: "Text + Tool Use in Same Iteration",
    TOOL_ERROR: "Tool Execution Error",
    MAX_ITERATIONS_REACHED: "Max Iterations Reached",
    UNKNOWN_ERROR: "Unknown Error",
  };
  return titles[type] || type.replace(/_/g, " ");
}
