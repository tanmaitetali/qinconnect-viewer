import { NextRequest, NextResponse } from "next/server";
import { fetchRecentLogEvents } from "@/lib/cloudwatch";
import { parseAllEvents, buildSessionSummaries } from "@/lib/parser";
import type { ApiResponse, SessionListResponse } from "@/lib/types";

// ─── Simple in-memory cache ──────────────────────────────────────────────────

interface CacheEntry {
  data: SessionListResponse;
  timestamp: number;
  key: string;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15_000; // 15 seconds

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SessionListResponse>>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hoursBack = parseInt(searchParams.get("hoursBack") || "1", 10);
    const logGroupName = searchParams.get("logGroup") || undefined;
    const profile = searchParams.get("profile") || undefined;
    const region = searchParams.get("region") || undefined;
    const limitParam = parseInt(searchParams.get("limit") || "500", 10);

    const cacheKey = `${hoursBack}-${logGroupName || "default"}-${profile || ""}-${region || ""}`;

    // Return cached result if fresh
    if (cache && cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, data: cache.data });
    }

    const rawEvents = await fetchRecentLogEvents({
      logGroupName,
      hoursBack,
      limit: limitParam,
      profile,
      region,
      // Only fetch orchestration messages for the session list — skip
      // trace/LLM invocation events which are noisy and not needed here
      filterPattern: '"TRANSCRIPT_ORCHESTRATION_MESSAGE"',
    });

    const parsedEvents = parseAllEvents(rawEvents);
    const sessions = buildSessionSummaries(parsedEvents);

    const responseData: SessionListResponse = { sessions };

    // Update cache
    cache = { data: responseData, timestamp: Date.now(), key: cacheKey };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching sessions";
    console.error("GET /api/sessions error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
