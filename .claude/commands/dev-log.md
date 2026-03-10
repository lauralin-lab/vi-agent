# /dev-log — Dev Environment Logs

View container logs for a dev instance. Runs via GitHub Actions — no SSH required.

## Parameters

- `/dev-log` — show logs for current user's instance (all services)
- `/dev-log casey` — show logs for casey's instance
- `/dev-log casey api-server` — show only api-server logs

## Flow

### Step 1: Determine Target

```bash
# Default to current user
DEVELOPER="${1:-$(gh api user --jq .login)}"
SERVICE="${2:-}"
LINES="${3:-100}"
```

If no parameters given, use current GitHub user.

### Step 2: Trigger Logs Action

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="$DEVELOPER" \
  -f action=logs \
  -f service="$SERVICE" \
  -f lines="$LINES"
```

### Step 3: Wait and Read

```bash
sleep 5
RUN_ID=$(gh run list --workflow=deploy-dev.yml --event=workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Read logs:
```bash
gh run view "$RUN_ID" --log 2>&1 | grep -A 500 "=== Container Logs" | head -500
```

### Step 4: Display

Show the logs directly. If too long, show last 100 lines and suggest increasing `lines` parameter.

## Services

Valid service names: `api-server`, `frontend`, `nanoclaw`, `vi-realtime`, `postgres`, `redis`

Empty = all services.
