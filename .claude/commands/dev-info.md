# /dev-info — Dev Environment Status

Show all dev instances, deployment history, and server state. No SSH required — everything via GitHub Actions.

## Flow

### Step 1: Show Recent Deployments

Use `run-name` (format: "Dev: {action} {developer}") to distinguish action types.
Only show actual **deploy** runs in the "Recent Deployments" table.
Show status/logs/destroy runs separately if any.

```bash
# Fetch runs — displayTitle contains "Dev: {action} {developer}" (new format)
# or "Deploy Dev Instance" (legacy format without action info)
gh run list --workflow=deploy-dev.yml --limit 20 \
  --json databaseId,status,conclusion,createdAt,displayTitle \
  --jq '.[] | "\(.createdAt[:16])  \(.status)/\(.conclusion)  \(.displayTitle)"'
```

**Parsing rules:**
- If `displayTitle` matches `Dev: deploy *` → real deployment, show in "Recent Deployments"
- If `displayTitle` matches `Dev: status *` or `Dev: logs *` → skip (not a deployment)
- If `displayTitle` is legacy "Deploy Dev Instance" → check log for actual action type via
  `gh run view {id} --log 2>&1 | grep 'Action.*\`' | head -1` to determine if it was a deploy
- Only show confirmed deploy actions in the deployment history table

### Step 2: Trigger Server Status

To get live server state (running containers, ports, disk):

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="_all" \
  -f action=status
```

Wait for completion:
```bash
sleep 5
RUN_ID=$(gh run list --workflow=deploy-dev.yml --event=workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Read status output:
```bash
gh run view "$RUN_ID" --log 2>&1 | grep -A 50 "=== Dev Instances ===" | head -60
```

### Step 3: Format Output

```
## Active Instances (from workflow log output)
| Name | Frontend | API | Tag | Deployed |
|------|----------|-----|-----|----------|
| (parse from log output — don't hardcode server IP) |

## Recent Deployments (last 10)
| Time | Status | Description |
|------|--------|-------------|
| ...  | ...    | ...         |
```

### Step 4: Warnings

Flag if:
- Disk usage > 80%
- Any instance unhealthy
- Docker images > 20GB total
