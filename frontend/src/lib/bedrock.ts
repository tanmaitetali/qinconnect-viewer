import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentials } from '../credentials/types';
import type { DetectedIssue, ParsedMessage, SessionMetrics, ToolCall } from './types';

// Runs directly in the browser: Bedrock Runtime accepts CORS requests from
// any origin (verified — see the "bedrock-runtime" preflight check), so no
// backend is needed here.

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

export async function analyzeSession(
  credentials: AwsCredentials,
  region: string,
  modelId: string,
  session: {
    messages: ParsedMessage[];
    toolCalls: ToolCall[];
    issues: DetectedIssue[];
    metrics: SessionMetrics;
  },
): Promise<string> {
  const client = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const userPrompt = buildAnalysisPrompt(
    session.messages,
    session.toolCalls,
    session.issues,
    session.metrics,
  );

  // Build payload based on model family
  const isAmazonModel = modelId.includes('amazon.nova');
  let payload: Record<string, unknown>;

  if (isAmazonModel) {
    // Amazon Nova format
    payload = {
      schemaVersion: 'messages-v1',
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
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
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    };
  }

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  // Extract text based on model family
  if (isAmazonModel) {
    return responseBody.output?.message?.content?.[0]?.text || 'No analysis generated.';
  }
  return responseBody.content?.[0]?.text || 'No analysis generated.';
}

function buildAnalysisPrompt(
  messages: ParsedMessage[],
  toolCalls: ToolCall[],
  issues: DetectedIssue[],
  metrics: SessionMetrics,
): string {
  let prompt = 'Analyze this Q in Connect AI Agent session:\n\n';

  // Conversation
  prompt += '## Conversation\n';
  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString();
    if (msg.type === 'customer') {
      prompt += `[${time}] CUSTOMER: ${msg.text}\n`;
    } else if (msg.type === 'bot') {
      prompt += `[${time}] BOT: ${msg.text}\n`;
    } else if (msg.type === 'tool_use') {
      prompt += `[${time}] TOOL CALL: ${msg.toolName} — ${msg.text}\n`;
    } else if (msg.type === 'tool_result') {
      prompt += `[${time}] TOOL RESULT: ${msg.text}\n`;
    }
  }

  // Tool calls detail
  if (toolCalls.length > 0) {
    prompt += '\n## Tool Calls\n';
    for (const tc of toolCalls) {
      prompt += `- ${tc.name}: input=${JSON.stringify(tc.input)}`;
      if (tc.result) {
        prompt += ` → ${tc.result.success ? 'success' : 'ERROR'}`;
        if (tc.result.isEmpty) prompt += ' (EMPTY results)';
        if (tc.result.error) prompt += ` — ${tc.result.error}`;
      }
      prompt += '\n';
    }
  }

  // Detected issues
  if (issues.length > 0) {
    prompt += '\n## Auto-Detected Issues\n';
    for (const issue of issues) {
      prompt += `- [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}\n`;
    }
  }

  // Metrics
  if (metrics) {
    prompt += '\n## Metrics\n';
    if (metrics.totalInputTokens) prompt += `- Input tokens: ${metrics.totalInputTokens}\n`;
    if (metrics.totalOutputTokens) prompt += `- Output tokens: ${metrics.totalOutputTokens}\n`;
    if (metrics.avgTimeToFirstToken)
      prompt += `- Avg TTFT: ${Math.round(metrics.avgTimeToFirstToken)}ms\n`;
    if (metrics.cacheHitRatio !== undefined)
      prompt += `- Cache hit ratio: ${(metrics.cacheHitRatio * 100).toFixed(1)}%\n`;
  }

  prompt += '\nProvide your analysis and fix recommendations.';
  return prompt;
}
