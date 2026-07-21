"use client";

import { useState } from "react";
import type { ParsedMessage, ToolCall } from "@/lib/types";

interface ConversationViewProps {
  messages: ParsedMessage[];
  toolCalls: ToolCall[];
}

export function ConversationView({ messages, toolCalls }: ConversationViewProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-dark-500">No messages in this session</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Session header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-dark-800 rounded-full text-xs text-dark-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {messages[0] && new Date(messages[0].timestamp).toLocaleString()}
        </div>
      </div>

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} toolCalls={toolCalls} />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  toolCalls,
}: {
  message: ParsedMessage;
  toolCalls: ToolCall[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (message.type === "customer") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%]">
          <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            <p className="text-sm whitespace-pre-wrap">{message.text}</p>
          </div>
          <p className="text-[10px] text-dark-500 mt-1 text-right">
            {formatTime(message.timestamp)}
            {message.orchestrationIteration ? ` · iter ${message.orchestrationIteration}` : ""}
          </p>
        </div>
      </div>
    );
  }

  if (message.type === "bot") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%]">
          <div className="bg-dark-700 text-dark-100 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
            <p className="text-sm whitespace-pre-wrap">{message.text}</p>
          </div>
          <p className="text-[10px] text-dark-500 mt-1">
            {formatTime(message.timestamp)}
            {message.orchestrationIteration ? ` · iter ${message.orchestrationIteration}` : ""}
          </p>
        </div>
      </div>
    );
  }

  if (message.type === "tool_use") {
    const matchingToolCall = toolCalls.find((tc) => tc.id === message.id);
    return (
      <div className="mx-8">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left bg-dark-800 border border-dark-700 rounded-lg p-3 hover:border-dark-600 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-amber-300">
                {message.toolName}
              </span>
              {matchingToolCall?.result && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                  matchingToolCall.result.success
                    ? matchingToolCall.result.isEmpty
                      ? "bg-yellow-900/30 text-yellow-400"
                      : "bg-green-900/30 text-green-400"
                    : "bg-red-900/30 text-red-400"
                }`}>
                  {matchingToolCall.result.success
                    ? matchingToolCall.result.isEmpty
                      ? "empty"
                      : "success"
                    : "error"}
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-dark-500 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {expanded && (
          <div className="mt-1 bg-dark-900 border border-dark-700 rounded-lg p-3 text-xs">
            {message.toolInput && (
              <div className="mb-2">
                <p className="text-dark-400 font-medium mb-1">Input:</p>
                <pre className="bg-dark-900 rounded p-2 overflow-x-auto text-dark-300 font-mono text-[11px]">
                  {JSON.stringify(message.toolInput, null, 2)}
                </pre>
              </div>
            )}
            {matchingToolCall?.result && (
              <div>
                <p className="text-dark-400 font-medium mb-1">Result:</p>
                <pre className="bg-dark-900 rounded p-2 overflow-x-auto text-dark-300 font-mono text-[11px] max-h-48 overflow-y-auto">
                  {JSON.stringify(matchingToolCall.result.content, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-dark-600 mt-1 ml-8">
          {formatTime(message.timestamp)}
          {message.orchestrationIteration ? ` · iter ${message.orchestrationIteration}` : ""}
        </p>
      </div>
    );
  }

  if (message.type === "tool_result") {
    const status = message.toolResult;
    if (!status) return null;

    return (
      <div className="mx-8">
        <div className={`border rounded-lg p-2 text-xs ${
          status.success
            ? status.isEmpty
              ? "border-yellow-800/50 bg-yellow-900/10"
              : "border-green-800/50 bg-green-900/10"
            : "border-red-800/50 bg-red-900/10"
        }`}>
          <div className="flex items-center gap-2">
            {status.success ? (
              status.isEmpty ? (
                <span className="text-yellow-400">⚠ Empty result</span>
              ) : (
                <span className="text-green-400">✓ Result received</span>
              )
            ) : (
              <span className="text-red-400">✗ {status.error || "Error"}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // System messages
  return (
    <div className="text-center">
      <span className="inline-block px-3 py-1 bg-dark-800/50 rounded-full text-xs text-dark-500">
        {message.text}
      </span>
    </div>
  );
}

function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
