# pt-claw

Educational MVP that integrates Slack, Jira Cloud, OpenClaw-style orchestration (internal module), and ChatGPT to generate Xray Cloud-ready test assets.

## What it does

Run a Slack slash command:

- `/clawcraft PROJ-123`
- `/clawcraft PROJ-123 generate script`

The service will:

1. Fetch Jira issue by key from Jira Cloud REST API v3.
2. Verify issue type from `issuetype.name` (supports Story/Bug).
3. Generate Positive/Negative/Edge Gherkin tests through OpenAI.
4. Produce and upload:
   - `PROJ-123_xray_tests.csv`
   - `PROJ-123_xray_tests.json`
5. If `generate script` is requested and issue is Bug with clear steps:
   - Playwright TypeScript for WEB
   - Appium Python for MOBILE
   - Defaults to Playwright TS when unclear.

## Tech stack

- Node.js 20+
- TypeScript
- Express
- Zod
- Axios
- dotenv
- Slack Web API
- Jira Cloud REST API v3
- OpenAI API

## Project structure

- `src/routes/slackCommands.ts` - Slash command endpoint
- `src/services/jira.ts` - Jira issue fetch + parsing heuristics
- `src/services/slack.ts` - Slack message + file upload client
- `src/services/openai.ts` - ChatGPT client
- `src/openclaw/orchestrator.ts` - Main workflow orchestration
- `src/openclaw/prompt.ts` - Prompt builder (strict JSON output contract)
- `src/openclaw/schema.ts` - Zod validation for AI response
- `src/openclaw/formatters.ts` - CSV/JSON Xray placeholder formatting
- `src/utils/slackSignature.ts` - Slack signature verification

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure env

Copy `.env.example` to `.env` and fill values.

```env
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1
PORT=3000
PUBLIC_BASE_URL=
```

### 3) Run locally

```bash
npm run dev
```

## Slack app setup

1. Go to https://api.slack.com/apps and create an app.
2. Enable Slash Commands:
   - Command: `/clawcraft`
   - Request URL: `https://<your-ngrok-id>.ngrok.io/slack/commands`
3. In OAuth & Permissions, add bot scopes:
   - `commands`
   - `chat:write`
   - `files:write`
4. Install app to workspace and copy Bot User OAuth Token to `SLACK_BOT_TOKEN`.
5. Copy Signing Secret from Basic Information to `SLACK_SIGNING_SECRET`.

## ngrok for local Slack callbacks

```bash
ngrok http 3000
```

Use the HTTPS forwarding URL for Slack Request URL.

## Jira API token setup

1. Sign in at https://id.atlassian.com/manage-profile/security/api-tokens
2. Create token.
3. Set:
   - `JIRA_EMAIL` = Atlassian account email
   - `JIRA_API_TOKEN` = created token
   - `JIRA_BASE_URL` = e.g. `https://your-domain.atlassian.net`

## Example commands

- `/clawcraft PROJ-123`
- `/clawcraft PROJ-123 generate script`

## Notes / limitations

- CSV format is a temporary placeholder schema for later Xray Cloud template swap.
- No database is used in this MVP.
- OpenClaw is implemented as an internal module for easy future extraction.
- Slash command is acknowledged immediately; heavy work is done asynchronously.