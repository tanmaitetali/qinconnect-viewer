"use client";

import type { SessionParameters } from "@/lib/types";

interface ParametersPanelProps {
  parameters: SessionParameters;
}

/** Well-known parameter categories for visual grouping */
const CATEGORY_MAP: Record<string, string[]> = {
  "Routing": ["lob_type", "menu_results", "queue_name", "skill_group", "ivr_path", "dnis", "ani", "channel", "language", "queue", "routing_profile"],
  "Customer": ["customer_id", "customer_phone", "account_id", "sid", "caller_id", "phone", "email", "customer_name", "address"],
  "Subscription": ["subscription_status", "plan_name", "plan_type", "subscription_id", "monitoring_plan"],
  "Authentication": ["auth_status", "verification_status", "authenticated", "pin_verified"],
  "Transfer": ["transfer_reason", "escalation_reason", "intent", "disposition", "outcome"],
};

function categorizeParams(params: SessionParameters): { categorized: Record<string, Record<string, string | number | boolean | null>>; uncategorized: Record<string, string | number | boolean | null> } {
  const categorized: Record<string, Record<string, string | number | boolean | null>> = {};
  const assigned = new Set<string>();

  for (const [category, keys] of Object.entries(CATEGORY_MAP)) {
    const matching: Record<string, string | number | boolean | null> = {};
    for (const key of keys) {
      if (key in params) {
        matching[key] = params[key];
        assigned.add(key);
      }
    }
    if (Object.keys(matching).length > 0) {
      categorized[category] = matching;
    }
  }

  const uncategorized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!assigned.has(key)) {
      uncategorized[key] = value;
    }
  }

  return { categorized, uncategorized };
}

export function ParametersPanel({ parameters }: ParametersPanelProps) {
  const entries = Object.entries(parameters);

  if (entries.length === 0) {
    return (
      <div className="p-4 text-center text-dark-500 text-sm">
        <svg className="w-10 h-10 text-dark-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No parameters detected</p>
        <p className="text-dark-600 text-xs mt-1">
          Parameters like lob_type, menu_results, etc. will appear here when set during the session.
        </p>
      </div>
    );
  }

  const { categorized, uncategorized } = categorizeParams(parameters);

  return (
    <div className="p-3 space-y-4">
      {/* Summary count */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wider">
          Session Parameters
        </h3>
        <span className="text-[10px] text-dark-500 bg-dark-800 px-2 py-0.5 rounded-full">
          {entries.length} values
        </span>
      </div>

      {/* Categorized parameters */}
      {Object.entries(categorized).map(([category, categoryParams]) => (
        <section key={category}>
          <h4 className="text-[11px] font-medium text-dark-300 px-1 mb-2 flex items-center gap-1.5">
            <CategoryIcon category={category} />
            {category}
          </h4>
          <div className="space-y-1">
            {Object.entries(categoryParams).map(([key, value]) => (
              <ParameterRow key={key} paramKey={key} value={value} />
            ))}
          </div>
        </section>
      ))}

      {/* Uncategorized parameters */}
      {Object.keys(uncategorized).length > 0 && (
        <section>
          <h4 className="text-[11px] font-medium text-dark-300 px-1 mb-2 flex items-center gap-1.5">
            <span className="text-dark-500">⋯</span>
            Other
          </h4>
          <div className="space-y-1">
            {Object.entries(uncategorized).map(([key, value]) => (
              <ParameterRow key={key} paramKey={key} value={value} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ParameterRow({ paramKey, value }: { paramKey: string; value: string | number | boolean | null }) {
  const displayValue = value === null || value === undefined ? "—" : String(value);
  const isLong = displayValue.length > 50;

  return (
    <div className="bg-dark-800 rounded-md px-3 py-2 flex items-start justify-between gap-2">
      <span className="text-[11px] text-dark-400 font-mono shrink-0">
        {paramKey}
      </span>
      <span
        className={`text-[11px] text-dark-200 text-right font-medium ${isLong ? "break-all" : "truncate"}`}
        title={displayValue}
      >
        {displayValue}
      </span>
    </div>
  );
}

function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case "Routing":
      return <span className="text-blue-400 text-xs">⇄</span>;
    case "Customer":
      return <span className="text-green-400 text-xs">👤</span>;
    case "Subscription":
      return <span className="text-purple-400 text-xs">📋</span>;
    case "Authentication":
      return <span className="text-yellow-400 text-xs">🔑</span>;
    case "Transfer":
      return <span className="text-red-400 text-xs">↗</span>;
    default:
      return <span className="text-dark-500 text-xs">•</span>;
  }
}
