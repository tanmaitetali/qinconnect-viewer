"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { SessionSummary } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { MessageSquare, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface SessionCardProps {
  session: SessionSummary;
}

export function SessionCard({ session }: SessionCardProps) {
  return (
    <Link href={`/session/${encodeURIComponent(session.sessionId)}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm text-foreground truncate">
                  {session.contactId.length > 32
                    ? session.contactId.substring(0, 32) + "..."
                    : session.contactId}
                </span>
                {session.hasErrors && (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {session.startTime
                  ? new Date(session.startTime).toLocaleString()
                  : "—"}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{session.messageCount}</span>
              </div>
              {session.duration > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDuration(session.duration)}</span>
                </div>
              )}
              {session.errorCount > 0 && (
                <span className="text-red-400 text-xs">
                  {session.errorCount} issue{session.errorCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
