"use client";

import type { ConversationMessage } from "@/types";
import { cn } from "@/lib/utils";
import { User, Bot, ShieldAlert } from "lucide-react";

interface ConversationTimelineProps {
  messages: ConversationMessage[];
}

export function ConversationTimeline({ messages }: ConversationTimelineProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No conversation messages found in this session.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {messages.map((message, index) => (
        <div
          key={index}
          className={cn(
            "flex gap-3",
            message.participant === "CUSTOMER" ? "justify-start" : "justify-start"
          )}
        >
          <div
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
              message.participant === "CUSTOMER"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-zinc-700 text-zinc-300"
            )}
          >
            {message.participant === "CUSTOMER" ? (
              <User className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 max-w-[80%]">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-xs font-medium",
                  message.participant === "CUSTOMER" ? "text-blue-400" : "text-zinc-400"
                )}
              >
                {message.participant === "CUSTOMER" ? "Customer" : "AI Agent"}
              </span>
              {message.orchestration_iteration !== undefined && (
                <span className="text-xs text-muted-foreground">
                  iter #{message.orchestration_iteration}
                </span>
              )}
              {message.guardrail_blocked && (
                <span className="inline-flex items-center gap-1 text-xs text-red-400">
                  <ShieldAlert className="h-3 w-3" />
                  Blocked
                </span>
              )}
            </div>
            <div
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm",
                message.participant === "CUSTOMER"
                  ? "bg-blue-500/10 border border-blue-500/20 text-foreground"
                  : "bg-zinc-800 border border-zinc-700 text-foreground",
                message.guardrail_blocked && "border-red-500/40 bg-red-500/5"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {new Date(message.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
