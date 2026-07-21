import { NextRequest, NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { fromSSO } from "@aws-sdk/credential-providers";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

async function getBedrockSettings() {
  const settingsFile = join(process.cwd(), ".dashboard", "settings.json");
  try {
    if (existsSync(settingsFile)) {
      const raw = await readFile(settingsFile, "utf-8");
      const settings = JSON.parse(raw);
      return settings.bedrock || {};
    }
  } catch {
    // fall through
  }
  return {};
}

const SYSTEM_PROMPT = `You are an expert at debugging Amazon Connect Q in Connect AI Agent sessions. You analyze conversation logs, tool calls, guardrail events, and orchestration traces to identify issues and recommend fixes.

When analyzing a session, focus on:
1. Did the bot correctly classify the customer's intent?
2. Did tool calls succeed? If not, why?
3. Were there empty KB results? Why might the KB not have matching content?
4. Did the guardrail block anything inappropriately?
5. Did the model violate any behavioral rules (e.g., calling a tool and asking a question in the same turn)?
6. Was the escalation/completion flow handled correctly?
7. Token efficiency — is prompt caching working? Is the model being called too many times?

Provide your analysis in this format:
**Summary:** One-line diagnosis of the session.
**Issues Found:** Bullet list of specific problems.
**Root Cause:** What's actually causing the problem (not just symptoms).
**Fix Recommendations:** Concrete, actionable steps to fix each issue. Reference specific config (prompt text, tool settings, KB config) where applicable.
**Prompt Change (if needed):** Show the exact text to add/change in the system prompt if a prompt fix is needed.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, toolCalls, issues, metrics, bedrockConfig } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "No session data provided" },
        { status: 400 }
      );
    }

    const bedrockSettings = await getBedrockSettings();

    // Frontend config takes priority, then persisted settings, then env vars
    const profile = bedrockConfig?.bedrock_profile || bedrockSettings.aws_profile || process.env.AWS_BEDROCK_PROFILE || process.env.AWS_PROFILE || "default";
    const region = bedrockConfig?.bedrock_region || bedrockSettings.aws_region || process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";

    // Try SSO credentials first (for profiles like bedrock-test that use SSO),
    // fall back to standard INI credentials
    let credentials;
    try {
      // fromSSO handles SSO-configured profiles
      credentials = fromSSO({ profile });
    } catch {
      credentials = fromIni({ profile });
    }

    const client = new BedrockRuntimeClient({
      region,
      credentials,
    });

    // Build the analysis prompt from session data
    const userPrompt = buildAnalysisPrompt(messages, toolCalls, issues, metrics);

    const modelId = bedrockConfig?.bedrock_model_id || bedrockSettings.model_id || process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-20250514-v1:0";

    // Build payload based on model family
    let payload: Record<string, unknown>;
    const isAmazonModel = modelId.includes("amazon.nova");

    if (isAmazonModel) {
      // Amazon Nova format
      payload = {
        schemaVersion: "messages-v1",
        system: [{ text: SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [{ text: userPrompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.3,
        },
      };
    } else {
      // Anthropic format (Claude models)
      payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract text based on model family
    let analysisText: string;
    if (isAmazonModel) {
      analysisText = responseBody.output?.message?.content?.[0]?.text || "No analysis generated.";
    } else {
      analysisText = responseBody.content?.[0]?.text || "No analysis generated.";
    }

    return NextResponse.json({
      success: true,
      data: { analysis: analysisText },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /api/analyze error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

function buildAnalysisPrompt(
  messages: Array<{ type: string; text: string; timestamp: number; toolName?: string; toolResult?: unknown }>,
  toolCalls: Array<{ name: string; input: unknown; result?: { success: boolean; isEmpty?: boolean; error?: string } }>,
  issues: Array<{ type: string; message: string; severity: string }>,
  metrics: { totalInputTokens?: number; totalOutputTokens?: number; avgTimeToFirstToken?: number; cacheHitRatio?: number }
): string {
  let prompt = "Analyze this Q in Connect AI Agent session:\n\n";

  // Conversation
  prompt += "## Conversation\n";
  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString();
    if (msg.type === "customer") {
      prompt += `[${time}] CUSTOMER: ${msg.text}\n`;
    } else if (msg.type === "bot") {
      prompt += `[${time}] BOT: ${msg.text}\n`;
    } else if (msg.type === "tool_use") {
      prompt += `[${time}] TOOL CALL: ${msg.toolName} — ${msg.text}\n`;
    } else if (msg.type === "tool_result") {
      prompt += `[${time}] TOOL RESULT: ${msg.text}\n`;
    }
  }

  // Tool calls detail
  if (toolCalls.length > 0) {
    prompt += "\n## Tool Calls\n";
    for (const tc of toolCalls) {
      prompt += `- ${tc.name}: input=${JSON.stringify(tc.input)}`;
      if (tc.result) {
        prompt += ` → ${tc.result.success ? "success" : "ERROR"}`;
        if (tc.result.isEmpty) prompt += " (EMPTY results)";
        if (tc.result.error) prompt += ` — ${tc.result.error}`;
      }
      prompt += "\n";
    }
  }

  // Detected issues
  if (issues.length > 0) {
    prompt += "\n## Auto-Detected Issues\n";
    for (const issue of issues) {
      prompt += `- [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}\n`;
    }
  }

  // Metrics
  if (metrics) {
    prompt += "\n## Metrics\n";
    if (metrics.totalInputTokens) prompt += `- Input tokens: ${metrics.totalInputTokens}\n`;
    if (metrics.totalOutputTokens) prompt += `- Output tokens: ${metrics.totalOutputTokens}\n`;
    if (metrics.avgTimeToFirstToken) prompt += `- Avg TTFT: ${Math.round(metrics.avgTimeToFirstToken)}ms\n`;
    if (metrics.cacheHitRatio !== undefined) prompt += `- Cache hit ratio: ${(metrics.cacheHitRatio * 100).toFixed(1)}%\n`;
  }

  prompt += "\nProvide your analysis and fix recommendations.";
  return prompt;
}
