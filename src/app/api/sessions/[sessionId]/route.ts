import { NextRequest, NextResponse } from "next/server";
import { fetchSessionEvents } from "@/lib/cloudwatch";
import { parseAllEvents, buildSessionDetail } from "@/lib/parser";
import type { ApiResponse, SessionDetail } from "@/lib/types";

// ─── Session detail cache (keyed by sessionId) ──────────────────────────────

const detailCache = new Map<string, { data: SessionDetail; timestamp: number }>();
const DETAIL_CACHE_TTL_MS = 60_000; // 60 seconds — session data doesn't change fast

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
): Promise<NextResponse<ApiResponse<SessionDetail>>> {
  try {
    const { sessionId } = params;
    const searchParams = request.nextUrl.searchParams;
    const logGroupName = searchParams.get("logGroup") || undefined;
    const profile = searchParams.get("profile") || undefined;
    const region = searchParams.get("region") || undefined;
    const hoursBack = parseInt(searchParams.get("hoursBack") || "48", 10);

    // Check cache
    const cached = detailCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < DETAIL_CACHE_TTL_MS) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const now = Date.now();
    const startTime = now - hoursBack * 60 * 60 * 1000;

    const rawEvents = await fetchSessionEvents(sessionId, {
      logGroupName,
      startTime,
      endTime: now,
      profile,
      region,
    });

    const parsedEvents = parseAllEvents(rawEvents);
    const sessionDetail = buildSessionDetail(parsedEvents);

    // Cache it
    detailCache.set(sessionId, { data: sessionDetail, timestamp: Date.now() });

    // Evict old entries (keep max 20)
    if (detailCache.size > 20) {
      const oldest = Array.from(detailCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, detailCache.size - 20);
      for (const [key] of oldest) {
        detailCache.delete(key);
      }
    }

    return NextResponse.json({
      success: true,
      data: sessionDetail,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching session";
    console.error("GET /api/sessions/[sessionId] error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
