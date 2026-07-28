import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  DescribeLogGroupsCommand,
  type FilteredLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import type { AwsCredentials } from '../credentials/types';
import type { RawLogEvent, LogGroupInfo } from './types';

// ─── Client Construction ─────────────────────────────────────────────────────
//
// Runs directly in the browser: CloudWatch Logs accepts CORS requests from
// any origin (verified — see the "logs" preflight check), so no backend is
// needed here. Credentials come from whatever the user entered in Settings
// (long-lived IAM keys, or temporary/STS creds e.g. from saml2aws), never
// from a server-side profile.

function getClient(credentials: AwsCredentials, region: string): CloudWatchLogsClient {
  return new CloudWatchLogsClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

// ─── Discover Log Groups ─────────────────────────────────────────────────────

export async function discoverLogGroups(
  credentials: AwsCredentials,
  region: string,
): Promise<LogGroupInfo[]> {
  const client = getClient(credentials, region);
  const results: LogGroupInfo[] = [];
  let nextToken: string | undefined;

  do {
    const command = new DescribeLogGroupsCommand({
      logGroupNamePrefix: '/aws/connect/ai-agents/',
      nextToken,
    });

    const response = await client.send(command);

    if (response.logGroups) {
      for (const lg of response.logGroups) {
        results.push({
          name: lg.logGroupName || '',
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

export async function fetchLogEvents(
  credentials: AwsCredentials,
  region: string,
  options: {
    logGroupName: string;
    startTime: number;
    endTime: number;
    filterPattern?: string;
    nextToken?: string;
    limit?: number;
  },
): Promise<{ events: RawLogEvent[]; nextToken?: string }> {
  const client = getClient(credentials, region);

  const command = new FilterLogEventsCommand({
    logGroupName: options.logGroupName,
    startTime: options.startTime,
    endTime: options.endTime,
    filterPattern: options.filterPattern,
    nextToken: options.nextToken,
    limit: options.limit || 1000,
  });

  const response = await client.send(command);

  const events: RawLogEvent[] = (response.events || []).map((e: FilteredLogEvent) => ({
    timestamp: e.timestamp,
    message: e.message,
    ingestionTime: e.ingestionTime,
    logStreamName: e.logStreamName,
  }));

  return {
    events,
    nextToken: response.nextToken,
  };
}

// ─── Fetch All Events for a Session ──────────────────────────────────────────

export async function fetchSessionEvents(
  credentials: AwsCredentials,
  region: string,
  logGroupName: string,
  sessionId: string,
  options?: { startTime?: number; endTime?: number; maxEvents?: number },
): Promise<RawLogEvent[]> {
  const allEvents: RawLogEvent[] = [];
  let nextToken: string | undefined;
  const maxEvents = options?.maxEvents || 5000;

  // Default to last 24 hours if no time range provided
  const now = Date.now();
  const startTime = options?.startTime || now - 24 * 60 * 60 * 1000;
  const endTime = options?.endTime || now;

  do {
    const result = await fetchLogEvents(credentials, region, {
      logGroupName,
      startTime,
      endTime,
      filterPattern: `"${sessionId}"`,
      nextToken,
      limit: Math.min(1000, maxEvents - allEvents.length),
    });

    allEvents.push(...result.events);
    nextToken = result.nextToken;
  } while (nextToken && allEvents.length < maxEvents);

  return allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// ─── Fetch Recent Sessions ───────────────────────────────────────────────────

export async function fetchRecentLogEvents(
  credentials: AwsCredentials,
  region: string,
  logGroupName: string,
  options?: {
    hoursBack?: number;
    limit?: number;
    filterPattern?: string;
  },
): Promise<RawLogEvent[]> {
  const now = Date.now();
  const hoursBack = options?.hoursBack || 24;
  const startTime = now - hoursBack * 60 * 60 * 1000;

  const result = await fetchLogEvents(credentials, region, {
    logGroupName,
    startTime,
    endTime: now,
    filterPattern: options?.filterPattern,
    limit: options?.limit || 5000,
  });

  return result.events;
}
