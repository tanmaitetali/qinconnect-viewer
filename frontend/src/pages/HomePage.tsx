import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SessionList } from '../components/SessionList';
import { ConversationView } from '../components/ConversationView';
import { ToolCallPanel } from '../components/ToolCallPanel';
import { MetricsPanel } from '../components/MetricsPanel';
import { ErrorDetector } from '../components/ErrorDetector';
import { ParametersPanel } from '../components/ParametersPanel';
import { useAuth } from '../auth/AuthContext';
import { useCredentials } from '../credentials/CredentialsContext';
import { fetchRecentLogEvents, fetchSessionEvents } from '../lib/cloudwatch';
import { parseAllEvents, buildSessionSummaries, buildSessionDetail } from '../lib/parser';
import type { SessionSummary, SessionDetail } from '../lib/types';

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function HomePage() {
  const { signOut } = useAuth();
  const { settings, isLogsConfigured } = useCredentials();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoursBack, setHoursBack] = useState(1);
  const [rightPanel, setRightPanel] = useState<'metrics' | 'tools' | 'errors' | 'params'>('metrics');
  const [copiedContactId, setCopiedContactId] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  const handleCopyContactId = async (contactId: string) => {
    const ok = await copyToClipboard(contactId);
    if (ok) {
      setCopiedContactId(true);
      setTimeout(() => setCopiedContactId(false), 1500);
    }
  };

  const handleCopySessionId = async (sessionId: string) => {
    const ok = await copyToClipboard(sessionId);
    if (ok) {
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 1500);
    }
  };

  const fetchSessions = useCallback(async () => {
    if (!isLogsConfigured || !settings.logs.credentials) return;
    setSessionsLoading(true);
    setError(null);
    try {
      const rawEvents = await fetchRecentLogEvents(
        settings.logs.credentials,
        settings.logs.region,
        settings.logs.logGroupName,
        {
          hoursBack,
          limit: 500,
          // Only fetch orchestration messages for the session list — skip
          // trace/LLM invocation events which are noisy and not needed here.
          filterPattern: '"TRANSCRIPT_ORCHESTRATION_MESSAGE"',
        },
      );
      const parsedEvents = parseAllEvents(rawEvents);
      setSessions(buildSessionSummaries(parsedEvents));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setSessionsLoading(false);
    }
  }, [hoursBack, isLogsConfigured, settings.logs]);

  useEffect(() => {
    if (isLogsConfigured) {
      void fetchSessions();
    }
  }, [fetchSessions, isLogsConfigured]);

  const handleSessionSelect = async (sessionId: string) => {
    if (!isLogsConfigured || !settings.logs.credentials) return;
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const startTime = now - hoursBack * 3 * 60 * 60 * 1000;
      const rawEvents = await fetchSessionEvents(
        settings.logs.credentials,
        settings.logs.region,
        settings.logs.logGroupName,
        sessionId,
        { startTime, endTime: now },
      );
      const parsedEvents = parseAllEvents(rawEvents);
      setSelectedSession(buildSessionDetail(parsedEvents));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch session');
    } finally {
      setLoading(false);
    }
  };

  const downloadParsedLog = (session: SessionDetail) => {
    const lines: string[] = [];
    lines.push(`# Session Log — ${new Date(session.startTime).toISOString().slice(0, 16)}`);
    lines.push(`Session: ${session.sessionId}`);
    if (session.contactId !== session.sessionId) {
      lines.push(`Contact: ${session.contactId}`);
    }
    lines.push('');

    lines.push(`## Conversation`);
    for (const msg of session.messages) {
      const iter = msg.orchestrationIteration ? ` [${msg.orchestrationIteration}]` : '';
      if (msg.type === 'customer') {
        lines.push(`CUSTOMER${iter}: ${msg.text}`);
      } else if (msg.type === 'bot') {
        lines.push(`BOT${iter}: ${msg.text}`);
      } else if (msg.type === 'tool_use') {
        lines.push(`TOOL${iter}: ${msg.toolName}`);
      } else if (msg.type === 'tool_result') {
        const short = msg.text.length > 100 ? msg.text.slice(0, 100) + '…' : msg.text;
        lines.push(`  → ${short}`);
      }
    }
    lines.push('');

    if (session.toolCalls.length > 0) {
      lines.push(`## Tool Calls`);
      for (const tc of session.toolCalls) {
        const status = tc.result
          ? tc.result.success
            ? tc.result.isEmpty
              ? 'EMPTY'
              : 'OK'
            : `ERROR: ${tc.result.error || 'unknown'}`
          : 'no result';
        lines.push(`- ${tc.name} → ${status}`);
      }
      lines.push('');
    }

    if (session.detectedIssues.length > 0) {
      lines.push(`## Issues`);
      for (const issue of session.detectedIssues) {
        lines.push(`- [${issue.severity}] ${issue.message}`);
      }
      lines.push('');
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${session.sessionId.slice(0, 8)}-${new Date(session.startTime)
      .toISOString()
      .slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isLogsConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 w-full">
        <div className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-xl p-6 shadow-xl text-center">
          <h2 className="text-lg font-semibold text-dark-100 mb-1">No AWS credentials configured</h2>
          <p className="text-xs text-dark-400 mb-5">
            Add AWS credentials and a log group in Settings to start viewing sessions.
          </p>
          <Link
            to="/settings"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Left Sidebar — Session List */}
      <aside className="w-80 flex-shrink-0 border-r border-dark-800 bg-dark-900 flex flex-col">
        <div className="p-4 border-b border-dark-800">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-dark-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              AI Agent Dashboard
            </h1>
            <div className="flex items-center gap-1">
              <Link
                to="/settings"
                className="p-1.5 rounded-md hover:bg-dark-800 text-dark-400 hover:text-dark-200 transition-colors"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <button
                onClick={() => void signOut()}
                className="p-1.5 rounded-md hover:bg-dark-800 text-dark-400 hover:text-dark-200 transition-colors"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-xs text-dark-400 mt-1">Q in Connect Log Viewer</p>
        </div>

        {/* Time filter */}
        <div className="p-3 border-b border-dark-800">
          <label className="text-xs text-dark-400 block mb-1">Time Range</label>
          <div className="flex gap-2">
            <select
              value={hoursBack}
              onChange={(e) => setHoursBack(parseInt(e.target.value, 10))}
              className="flex-1 bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-dark-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={1}>Last 1 hour</option>
              <option value={4}>Last 4 hours</option>
              <option value={12}>Last 12 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={72}>Last 3 days</option>
              <option value={168}>Last 7 days</option>
            </select>
            <button
              onClick={() => void fetchSessions()}
              disabled={sessionsLoading}
              className="flex items-center justify-center w-9 h-9 rounded bg-dark-800 border border-dark-700 hover:bg-dark-700 hover:border-dark-600 text-dark-300 hover:text-dark-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh sessions"
            >
              <svg
                className={`w-4 h-4 ${sessionsLoading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        <SessionList
          sessions={sessions}
          loading={sessionsLoading}
          selectedId={selectedSession?.sessionId}
          onSelect={handleSessionSelect}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {error && (
          <div className="m-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-dark-400 text-sm">Loading session...</p>
            </div>
          </div>
        )}

        {!loading && !selectedSession && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 text-dark-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <h2 className="text-dark-400 text-lg">Select a session to view</h2>
              <p className="text-dark-600 text-sm mt-1">Choose a session from the left sidebar to see the conversation</p>
            </div>
          </div>
        )}

        {!loading && selectedSession && (
          <div className="flex-1 flex overflow-hidden">
            {/* Conversation Timeline */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-dark-800 bg-dark-900/50">
                <div className="text-xs text-dark-400 flex items-center flex-wrap gap-y-1 min-w-0">
                  <button
                    onClick={() => void handleCopySessionId(selectedSession.sessionId)}
                    className="flex items-center gap-1 font-mono hover:text-dark-200 transition-colors"
                    title="Copy session ID"
                  >
                    Session: {selectedSession.sessionId}
                    {copiedSessionId ? (
                      <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </button>
                  {selectedSession.contactId && selectedSession.contactId !== selectedSession.sessionId && (
                    <>
                      <button
                        onClick={() => void handleCopyContactId(selectedSession.contactId)}
                        className="flex items-center gap-1 font-mono hover:text-dark-200 transition-colors"
                        title="Copy contact ID"
                      >
                        Contact: {selectedSession.contactId}
                        {copiedContactId ? (
                          <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    </>
                  )}
                </div>
                <button
                  onClick={() => downloadParsedLog(selectedSession)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-dark-300 hover:text-dark-100 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-md transition-colors"
                  title="Download parsed log (paste into AI chat for analysis)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export Log
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConversationView messages={selectedSession.messages} toolCalls={selectedSession.toolCalls} />
              </div>
            </div>

            {/* Right Panel — Metrics / Tools / Errors */}
            <aside className="w-96 flex-shrink-0 border-l border-dark-800 bg-dark-900 flex flex-col overflow-hidden">
              <div className="flex border-b border-dark-800">
                <button
                  onClick={() => setRightPanel('params')}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    rightPanel === 'params' ? 'text-blue-400 border-b-2 border-blue-400 bg-dark-800/50' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  Params
                  {Object.keys(selectedSession.parameters).length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 text-[10px] bg-dark-600 text-dark-200 rounded-full px-1">
                      {Object.keys(selectedSession.parameters).length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setRightPanel('tools')}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    rightPanel === 'tools' ? 'text-blue-400 border-b-2 border-blue-400 bg-dark-800/50' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  Tools ({selectedSession.toolCalls.length})
                </button>
                <button
                  onClick={() => setRightPanel('errors')}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
                    rightPanel === 'errors' ? 'text-blue-400 border-b-2 border-blue-400 bg-dark-800/50' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  Issues
                  {selectedSession.detectedIssues.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-red-500 text-white rounded-full">
                      {selectedSession.detectedIssues.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setRightPanel('metrics')}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    rightPanel === 'metrics' ? 'text-blue-400 border-b-2 border-blue-400 bg-dark-800/50' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  Metrics
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {rightPanel === 'tools' && <ToolCallPanel toolCalls={selectedSession.toolCalls} />}
                {rightPanel === 'params' && <ParametersPanel parameters={selectedSession.parameters} />}
                {rightPanel === 'metrics' && (
                  <MetricsPanel metrics={selectedSession.metrics} guardrails={selectedSession.guardrails} />
                )}
                {rightPanel === 'errors' && (
                  <ErrorDetector
                    issues={selectedSession.detectedIssues}
                    messages={selectedSession.messages}
                    toolCalls={selectedSession.toolCalls}
                    metrics={selectedSession.metrics}
                  />
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
