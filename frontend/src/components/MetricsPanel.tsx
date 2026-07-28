"use client";

import { useState } from "react";
import type { SessionMetrics, GuardrailEvent } from "@/lib/types";

interface MetricsPanelProps {
  metrics: SessionMetrics;
  guardrails: GuardrailEvent[];
}

export function MetricsPanel({ metrics, guardrails }: MetricsPanelProps) {
  return (
    <div className="p-3 space-y-1">
      {/* Token Usage */}
      <CollapsibleSection title="Token Usage" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Input Tokens"
            value={metrics.totalInputTokens.toLocaleString()}
            icon="→"
          />
          <MetricCard
            label="Output Tokens"
            value={metrics.totalOutputTokens.toLocaleString()}
            icon="←"
          />
          <MetricCard
            label="Cache Read"
            value={metrics.totalCacheReadTokens.toLocaleString()}
            icon="⟳"
          />
          <MetricCard
            label="Cache Hit Ratio"
            value={`${(metrics.cacheHitRatio * 100).toFixed(1)}%`}
            icon="✓"
            highlight={metrics.cacheHitRatio > 0.5}
          />
        </div>
      </CollapsibleSection>

      {/* Latency */}
      <CollapsibleSection title="Latency (TTFT)" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Avg TTFT"
            value={`${Math.round(metrics.avgTimeToFirstToken)}ms`}
            icon="⌀"
            highlight={metrics.avgTimeToFirstToken < 1000}
            warning={metrics.avgTimeToFirstToken > 3000}
          />
          <MetricCard
            label="Max TTFT"
            value={`${Math.round(metrics.maxTimeToFirstToken)}ms`}
            icon="↑"
            warning={metrics.maxTimeToFirstToken > 5000}
          />
        </div>
      </CollapsibleSection>

      {/* Orchestration */}
      <CollapsibleSection title="Orchestration" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Total Iterations"
            value={metrics.totalOrchestrationIterations.toString()}
            icon="#"
          />
          <MetricCard
            label="Model Calls"
            value={metrics.spans.length.toString()}
            icon="⚡"
          />
        </div>
      </CollapsibleSection>

      {/* Span Details */}
      {metrics.spans.length > 0 && (
        <CollapsibleSection title="Model Invocations" defaultOpen={false}>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {metrics.spans.map((span, idx) => (
              <div
                key={span.id}
                className="bg-dark-800 rounded p-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="text-dark-300 font-medium">
                    #{idx + 1} {span.spanName}
                  </span>
                  {span.timeToFirstTokenMs > 0 && (
                    <span className={`text-[10px] ${
                      span.timeToFirstTokenMs > 3000 ? "text-red-400" : "text-dark-500"
                    }`}>
                      {span.timeToFirstTokenMs}ms
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-3 text-[10px] text-dark-500">
                  <span>In: {span.inputTokens}</span>
                  <span>Out: {span.outputTokens}</span>
                  {span.cacheReadInputTokens > 0 && (
                    <span className="text-green-500">Cache: {span.cacheReadInputTokens}</span>
                  )}
                </div>
                {span.modelId && (
                  <p className="mt-0.5 text-[10px] text-dark-600 truncate">
                    {span.modelId}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Guardrails */}
      <CollapsibleSection
        title={`Guardrails (${guardrails.length})`}
        defaultOpen={guardrails.some((g) => g.action === "BLOCKED")}
      >
        {guardrails.length === 0 ? (
          <p className="text-xs text-dark-600 px-1">No guardrail events</p>
        ) : (
          <div className="space-y-1">
            {guardrails.map((g) => (
              <div
                key={g.id}
                className={`rounded p-2 text-xs border ${
                  g.action === "BLOCKED"
                    ? "border-red-800/50 bg-red-900/10"
                    : g.action === "ANONYMIZED"
                      ? "border-yellow-800/50 bg-yellow-900/10"
                      : "border-dark-700 bg-dark-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-dark-200">
                    {g.guardrailName || g.guardrailId || "Guardrail"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      g.scope === "INPUT"
                        ? "bg-blue-900/30 text-blue-400"
                        : "bg-purple-900/30 text-purple-400"
                    }`}>
                      {g.scope}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      g.action === "BLOCKED"
                        ? "bg-red-900/30 text-red-400"
                        : g.action === "ANONYMIZED"
                          ? "bg-yellow-900/30 text-yellow-400"
                          : "bg-green-900/30 text-green-400"
                    }`}>
                      {g.action}
                    </span>
                  </div>
                </div>
                {g.matchedPolicies && g.matchedPolicies.length > 0 && (
                  <p className="mt-1 text-[10px] text-dark-500">
                    Policies: {g.matchedPolicies.join(", ")}
                  </p>
                )}
                {g.message && (
                  <p className="mt-0.5 text-[10px] text-dark-500 truncate">
                    {g.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border border-dark-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-dark-800/50 transition-colors"
      >
        <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wider">
          {title}
        </h3>
        <svg
          className={`w-3.5 h-3.5 text-dark-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="bg-dark-800 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-dark-500 text-xs">{icon}</span>
        <span className="text-[10px] text-dark-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p
        className={`mt-1 text-lg font-semibold ${
          warning ? "text-red-400" : highlight ? "text-green-400" : "text-dark-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
