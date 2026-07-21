# AWS Connect AI Agent Dashboard

Next.js dashboard for viewing and analyzing **Amazon Connect Q in Connect AI Agent** CloudWatch logs. Supports separate AWS profiles for log access (e.g. client account) and AI analysis (e.g. your own account with Bedrock access).

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A config form will appear on first load.

## Configuration

All config is done in the browser on first launch — no `.env.local` required. Settings are stored in `localStorage`.

| Field | Purpose | Example |
|-------|---------|---------|
| **AWS Profile** | Profile for CloudWatch log access | `cx-qa` |
| **AWS Region** | Region where Connect instance lives | `us-east-1` |
| **Log Group Name** | CloudWatch log group for AI agent logs | `/aws/connect/ai-agents/ss-cc-qa-main-menu` |
| **Bedrock Profile** | Separate profile for AI analysis (can differ from logs profile) | `bedrock-test` |
| **Bedrock Region** | Region for Bedrock model access | `us-east-1` |
| **Model** | Which Bedrock model to use for analysis | Amazon Nova Pro / Nova Lite |

### Why separate profiles?

CloudWatch logs live in the client's AWS account, but Bedrock model access may not be available there (e.g. channel program accounts can't invoke Anthropic models). The dashboard lets you use one profile for reading logs and a different profile for AI analysis.

### SSO Profiles

If your Bedrock profile uses AWS SSO, login before starting the dashboard:

```bash
aws sso login --profile bedrock-test
```

The dashboard uses `fromSSO()` for Bedrock credentials, so SSO-configured profiles work out of the box.

### Fallback: .env.local

You can also configure via `.env.local` (copy from `.env.example`):

```env
AWS_PROFILE=cx-qa
AWS_REGION=us-east-1
LOG_GROUP_NAME=/aws/connect/ai-agents/your-instance

# Separate profile for Bedrock (AI analysis)
AWS_BEDROCK_PROFILE=bedrock-test
AWS_BEDROCK_REGION=us-east-1
```

Frontend config (localStorage) takes priority over `.env.local`.

## Features

- **Session list** — recent sessions with first customer message as label
- **Conversation view** — chat-style timeline (customer/bot/tool calls)
- **Tool calls panel** — expandable cards with inputs and results
- **Metrics panel** — token usage, TTFT, cache hit ratio, model invocations
- **Issue detection** — auto-flags empty KB results, tool errors, guardrail blocks, Issue #8
- **AI analysis** — one-click Bedrock analysis with fix recommendations (requires Bedrock access)
- **Export log** — download a compact `.txt` of the parsed session for pasting into AI chats

## Required AWS Permissions

**For CloudWatch logs (main profile):**

```json
{
  "Effect": "Allow",
  "Action": ["logs:FilterLogEvents", "logs:DescribeLogGroups"],
  "Resource": "arn:aws:logs:*:*:log-group:/aws/connect/ai-agents/*"
}
```

**For AI analysis (Bedrock profile):**

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": "arn:aws:bedrock:*::foundation-model/*"
}
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx                      # Main dashboard + config form
│   ├── layout.tsx
│   ├── settings/page.tsx             # Standalone settings page
│   ├── session/[id]/page.tsx         # Alternate session detail view
│   └── api/
│       ├── sessions/route.ts         # List sessions
│       ├── sessions/[sessionId]/     # Session detail
│       ├── session/[id]/route.ts     # Alternate session detail API
│       ├── analyze/route.ts          # Bedrock AI analysis
│       ├── log-groups/route.ts       # Discover log groups
│       └── settings/route.ts         # Persist settings to disk
├── components/
│   ├── SessionList.tsx
│   ├── ConversationView.tsx
│   ├── ToolCallPanel.tsx
│   ├── MetricsPanel.tsx
│   ├── ErrorDetector.tsx
│   └── ui/ (badge, button, card)
├── lib/
│   ├── cloudwatch.ts                 # AWS client (supports profile/region overrides)
│   ├── parser.ts                     # Log event parser + issue detection
│   ├── types.ts                      # Core TypeScript interfaces
│   └── utils.ts                      # cn(), formatDuration, etc.
└── types/
    └── index.ts                      # Types for alternate session view
```

## Development

```bash
npm run dev      # Dev server (hot reload with polling for WSL2)
npm run build    # Production build
npm run lint     # ESLint
```

## Troubleshooting

**Hot reload not working (WSL2 + Windows paths)**
→ Already configured: `next.config.mjs` uses webpack polling (1s interval).

**"Access to this model is not available for channel program accounts"**
→ Your Bedrock profile is on a channel/reseller account. Use a different AWS profile that has direct Bedrock access, or use Amazon Nova models instead of Anthropic.

**"Malformed input request: extraneous key [max_tokens]"**
→ You selected an Amazon Nova model but the code sent Anthropic format. This is fixed — Nova models use their own payload schema automatically.

**No sessions found**
→ Increase time range. Verify the log group has data via AWS Console > CloudWatch > Log Groups.

**SSO token expired**
→ Re-run `aws sso login --profile <your-bedrock-profile>`.
