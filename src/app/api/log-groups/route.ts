import { NextResponse } from "next/server";
import { discoverLogGroups } from "@/lib/cloudwatch";
import type { ApiResponse, LogGroupInfo } from "@/lib/types";

export async function GET(): Promise<NextResponse<ApiResponse<LogGroupInfo[]>>> {
  try {
    const logGroups = await discoverLogGroups();

    return NextResponse.json({
      success: true,
      data: logGroups,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error discovering log groups";
    console.error("GET /api/log-groups error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
