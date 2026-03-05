# /dev-info — Dev Environment Status

Show all dev instances, deployment history, and server state. No SSH required — everything via GitHub Actions.

## Flow

### Step 1: Show Recent Deployments

```bash
gh run list --workflow=deploy-dev.yml --limit 10 \
  --json databaseId,status,conclusion,createdAt,displayTitle \
  --jq '.[] | "\(.createdAt[:16])  \(.status)/\(.conclusion)  \(.displayTitle)"'
```

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
