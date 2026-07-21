import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const SETTINGS_DIR = join(process.cwd(), ".dashboard");
const SETTINGS_FILE = join(SETTINGS_DIR, "settings.json");

interface DashboardSettings {
  logs: {
    aws_profile: string;
    aws_region: string;
    log_group_name: string;
  };
  bedrock: {
    aws_profile: string;
    aws_region: string;
    model_id: string;
  };
}

const DEFAULT_SETTINGS: DashboardSettings = {
  logs: {
    aws_profile: process.env.AWS_PROFILE || "cx-qa",
    aws_region: process.env.AWS_REGION || "us-east-1",
    log_group_name: process.env.LOG_GROUP_NAME || "",
  },
  bedrock: {
    aws_profile: process.env.AWS_BEDROCK_PROFILE || "default",
    aws_region: process.env.AWS_BEDROCK_REGION || "us-east-1",
    model_id: process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-20250514-v1:0",
  },
};

async function loadSettings(): Promise<DashboardSettings> {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = await readFile(SETTINGS_FILE, "utf-8");
      const saved = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch {
    // Fall through to defaults
  }
  return DEFAULT_SETTINGS;
}

async function saveSettings(settings: DashboardSettings): Promise<void> {
  if (!existsSync(SETTINGS_DIR)) {
    await mkdir(SETTINGS_DIR, { recursive: true });
  }
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

export async function GET() {
  try {
    const settings = await loadSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await loadSettings();

    const updated: DashboardSettings = {
      logs: { ...current.logs, ...body.logs },
      bedrock: { ...current.bedrock, ...body.bedrock },
    };

    await saveSettings(updated);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
