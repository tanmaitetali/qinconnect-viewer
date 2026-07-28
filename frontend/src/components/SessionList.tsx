"use client";

import type { SessionSummary } from "@/lib/types";

interface SessionListProps {
  sessions: SessionSummary[];
  loading: boolean;
  selectedId?: string;
  onSelect: (sessionId: string) => void;
}

export function SessionList({ sessions, loading, selectedId, onSelect }: SessionListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-dark-500 text-xs">Loading sessions...</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-dark-500 text-sm">No sessions found</p>
          <p className="text-dark-600 text-xs mt-1">
            Check your AWS credentials and log group configuration
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-2 space-y-1">
        {sessions.map((session) => (
          <button
            key={session.sessionId}
            onClick={() => onSelect(session.sessionId)}
            className={`w-full text-left p-3 rounded-lg transition-colors ${
              selectedId === session.sessionId
                ? "bg-blue-900/30 border border-blue-700/50"
                : "hover:bg-dark-800 border border-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-200 truncate max-w-[220px]" title={session.contactId || session.sessionId}>
                {session.firstCustomerMessage
                  ? `"${session.firstCustomerMessage}"`
                  : session.contactId !== session.sessionId
                    ? session.contactId
                    : session.sessionId.slice(0, 8) + "…"}
              </span>
              {session.hasErrors && (
                <span className="flex-shrink-0 w-2 h-2 bg-red-400 rounded-full" title="Has errors" />
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-2 text-xs text-dark-500">
              <span>{formatTimestamp(session.startTime)}</span>
              <span className="text-dark-700">·</span>
              <span>{formatDuration(session.duration)}</span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs">
              <span className="text-dark-500">
                {session.messageCount} msgs
              </span>
              {session.errorCount > 0 && (
                <span className="text-red-400">
                  {session.errorCount} issues
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
