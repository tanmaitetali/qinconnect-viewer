import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  DescribeLogGroupsCommand,
  type FilteredLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import { fromIni } from "@aws-sdk/credential-providers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { RawLogEvent, LogGroupInfo } from "./types";

// ─── Load Persisted Settings ─────────────────────────────────────────────────

function getLogsSettings(): { aws_profile: string; aws_region: string; log_group_name: string } {
  const settingsFile = join(process.cwd(), ".dashboard", "settings.json");
  try {
    if (existsSync(settingsFile)) {
      const raw = readFileSync(settingsFile, "utf-8");
      const settings = JSON.parse(raw);
      return settings.logs || {};
    }
  } catch {
    // fall through
  }
  return { aws_profile: "", aws_region: "", log_group_name: "" };
}

// ─── Client Singleton ────────────────────────────────────────────────────────

let clientInstance: CloudWatchLogsClient | null = null;
let clientConfigKey: string | null = null;

export function getCloudWatchClient(): CloudWatchLogsClient {
  const saved = getLogsSettings();
  const profile = saved.aws_profile || process.env.AWS_PROFILE || "default";
  const region = saved.aws_region || process.env.AWS_REGION || "us-east-1";
  const configKey = `${profile}:${region}`;

  // Recreate client if settings changed
  if (clientInstance && clientConfigKey === configKey) return clientInstance;

  clientInstance = new CloudWatchLogsClient({
    region,
    credentials: fromIni({ profile }),
  });
  clientConfigKey = configKey;

  return clientInstance;
}

export function getCloudWatchClientWithOverrides(
  profile?: string,
  region?: string
): CloudWatchLogsClient {
  const saved = getLogsSettings();
  const resolvedProfile = profile || saved.aws_profile || process.env.AWS_PROFILE || "default";
  const resolvedRegion = region || saved.aws_region || process.env.AWS_REGION || "us-east-1";
  const configKey = `${resolvedProfile}:${resolvedRegion}`;

  // Reuse singleton if same config
  if (clientInstance && clientConfigKey === configKey) return clientInstance;

  clientInstance = new CloudWatchLogsClient({
    region: resolvedRegion,
    credentials: fromIni({ profile: resolvedProfile }),
  });
  clientConfigKey = configKey;

  return clientInstance;
}

export function getLogGroupName(): string {
  const saved = getLogsSettings();
  const logGroup = saved.log_group_name || process.env.LOG_GROUP_NAME;
  if (!logGroup) {
    throw new Error(
      "LOG_GROUP_NAME not configured. Set it in Settings or .env.local"
    );
  }
  return logGroup;
}

// ─── Discover Log Groups ─────────────────────────────────────────────────────

export async function discoverLogGroups(): Promise<LogGroupInfo[]> {
  const client = getCloudWatchClient();
  const results: LogGroupInfo[] = [];
  let nextToken: string | undefined;

  do {
    const command = new DescribeLogGroupsCommand({
      logGroupNamePrefix: "/aws/connect/ai-agents/",
      nextToken,
    });

    const response = await client.send(command);

    if (response.logGroups) {
      for (const lg of response.logGroups) {
        results.push({
          name: lg.logGroupName || "",
          arn: lg.arn,
          storedBytes: lg.storedBytes,
          creationTime: lg.creationTime,
        });
      }
    }

    nextToken = response.nextToken;
  } while (nextToken);

  return results;
}

// ─── Fetch Log Events ────────────────────────────────────────────────────────

export async function fetchLogEvents(options: {
  logGroupName?: string;
  startTime: number;
  endTime: number;
  filterPattern?: string;
  nextToken?: string;
  limit?: number;
  profile?: string;
  region?: string;
}): Promise<{ events: RawLogEvent[]; nextToken?: string }> {
  const client = options.profile || options.region
    ? getCloudWatchClientWithOverrides(options.profile, options.region)
    : getCloudWatchClient();
  const logGroupName = options.logGroupName || getLogGroupName();

  const command = new FilterLogEventsCommand({
    logGroupName,
    startTime: options.startTime,
    endTime: options.endTime,
    filterPattern: options.filterPattern,
    nextToken: options.nextToken,
    limit: options.limit || 1000,
  });

  const response = await client.send(command);

  const events: RawLogEvent[] = (response.events || []).map(
    (e: FilteredLogEvent) => ({
      timestamp: e.timestamp,
      message: e.message,
      ingestionTime: e.ingestionTime,
      logStreamName: e.logStreamName,
    })
  );

  return {
    events,
    nextToken: response.nextToken,
  };
}

// ─── Fetch All Events for a Session ──────────────────────────────────────────

export async function fetchSessionEvents(
  sessionId: string,
  options?: { logGroupName?: string; startTime?: number; endTime?: number; maxEvents?: number; profile?: string; region?: string }
): Promise<RawLogEvent[]> {
  const allEvents: RawLogEvent[] = [];
  let nextToken: string | undefined;
  const maxEvents = options?.maxEvents || 5000;

  // Default to last 24 hours if no time range provided
  const now = Date.now();
  const startTime = options?.startTime || now - 24 * 60 * 60 * 1000;
  const endTime = options?.endTime || now;

  do {
    const result = await fetchLogEvents({
      logGroupName: options?.logGroupName,
      startTime,
      endTime,
      filterPattern: `"${sessionId}"`,
      nextToken,
      limit: Math.min(1000, maxEvents - allEvents.length),
      profile: options?.profile,
      region: options?.region,
    });

    allEvents.push(...result.events);
    nextToken = result.nextToken;
  } while (nextToken && allEvents.length < maxEvents);

  return allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// ─── Fetch Recent Sessions ───────────────────────────────────────────────────

export async function fetchRecentLogEvents(options?: {
  logGroupName?: string;
  hoursBack?: number;
  limit?: number;
  filterPattern?: string;
  profile?: string;
  region?: string;
}): Promise<RawLogEvent[]> {
  const now = Date.now();
  const hoursBack = options?.hoursBack || 24;
  const startTime = now - hoursBack * 60 * 60 * 1000;

  const result = await fetchLogEvents({
    logGroupName: options?.logGroupName,
    startTime,
    endTime: now,
    filterPattern: options?.filterPattern,
    limit: options?.limit || 5000,
    profile: options?.profile,
    region: options?.region,
  });

  return result.events;
}
