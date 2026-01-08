# Slack Bot Setup Guide

## Environment Variables

These environment variables are required:

```env
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_SIGNING_SECRET=your_slack_signing_secret
SLACK_REDIRECT_URI=http://localhost:5001/api/slack/oauth/callback
```

## Slack App Configuration

1. **Create a Slack App** at https://api.slack.com/apps
    - Choose "From scratch"
    - Give it a name
    - Select your workspace

2. **OAuth & Permissions** - Add these Bot Token Scopes:
    - `app_mentions:read` - Listen to mentions
    - `chat:write` - Post messages
    - `users:read` - Read user information

3. **Event Subscriptions**:
    - Enable Events
    - Request URL: `https://your-domain.com/webhooks/slack/events`
    - Subscribe to bot event: `app_mention`

4. **OAuth Redirect URLs**:
    - Add: `http://localhost:5001/api/slack/oauth/callback`
    - Add production URL when deploying

5. **Copy Credentials**:
    - Client ID from "Basic Information"
    - Client Secret from "Basic Information"
    - Signing Secret from "Basic Information"

## Database Migration

The new `SlackUserMapping` entity will be automatically created by TypeORM.

## User Connection Flow

1. User navigates to the Integrations page in the frontend
2. Clicks "Connect Slack"
3. Redirected to `/api/slack/oauth`
4. Completes Slack OAuth
5. Redirected back to Integrations page

## Bot Capabilities

Users can mention the bot in any channel where it's added:

- **List Workspaces**: `@codee list my workspaces`
- **Get Workspace Agents**: `@codee show agents for workspace 123`
- **Search Workspaces**: `@codee search workspaces with "bug fix"`
- **List Repositories**: `@codee what repositories do I have?`
- **List Branches**: `@codee list branches for user/repo`
- **List Tools**: `@codee list available tools`
- **Create Workspace**: `@codee create a workspace to fix login bug in user/repo`
- **List Integrations**: `@codee show my integrations`
- **Help**: `@codee help`

The LLM will process natural language requests and invoke the appropriate tools.

## Files

- `backend/src/db/entities/SlackUserMapping.ts` - User mapping entity
- `backend/src/slack/oauth.ts` - OAuth flow handlers
- `backend/src/slack/events.ts` - Event webhook with verification
- `backend/src/slack/tools.ts` - LLM tool implementations
- `backend/src/slack/agent.ts` - LLM agent with tool calling

## Security

- All webhook requests are verified using HMAC-SHA256 signatures
- OAuth tokens are encrypted in the database
- Requests older than 5 minutes are rejected
- User mapping ensures users can only access their own data
