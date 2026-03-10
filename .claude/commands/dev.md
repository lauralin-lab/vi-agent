# /dev — Deploy Dev Environment

Deploy personal dev instance via GitHub Actions. Zero local config, zero SSH, zero server accounts.

**Identity = `gh api user`**, branch = current HEAD. That's all.

---

## Flow

### Step 1: Identity + Target

```bash
DEVELOPER=$(gh api user --jq .login)
REF=$(git rev-parse --abbrev-ref HEAD)
```

Tell user: "Will deploy `$REF` as `$DEVELOPER`."

If user specified a different branch/tag/SHA, use that instead.

### Step 2: Trigger GitHub Actions

```bash
gh workflow run deploy-dev.yml \
  --ref pre-launch \
  -f developer="$DEVELOPER" \
  -f ref="$REF" \
  -f action=deploy
```

> `--ref pre-launch` = workflow file location. `-f ref=` = code to build.

### Step 3: Wait for Completion

```bash
# Wait for the run to appear (workflow_dispatch is async)
sleep 5

# Get the run ID — filter by workflow + event type + recency
# The most recent workflow_dispatch run for this workflow is ours
RUN_ID=$(gh run list --workflow=deploy-dev.yml --event=workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')

echo "Run ID: $RUN_ID"
echo "URL: https://github.com/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/actions/runs/$RUN_ID"
```

Poll until done:
```bash
gh run watch "$RUN_ID" --exit-status
```

If `gh run watch` is unavailable or hangs, poll manually:
```bash
while true; do
  STATUS=$(gh run view "$RUN_ID" --json status,conclusion --jq '.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] && break
  sleep 10
done
gh run view "$RUN_ID" --json conclusion --jq '.conclusion'
```

### Step 4: Show Results

```bash
gh run view "$RUN_ID" --log 2>&1 | grep -E "(Instance Ready|Frontend:|API:|NanoClaw:|Image Tag:|Deployed:)" | tail -20
```

Format output (extract URLs from log, don't hardcode server IP):

```
{DEVELOPER} dev instance deployed!

  Frontend (HTTPS): {from log}
  Frontend (HTTP):  {from log}
  API:              {from log}
  API Docs:         {from log}/docs
  NanoClaw:         {from log}

  Branch: {REF}
  Run:    {URL}
```

If failed, show failure logs:
```bash
gh run view "$RUN_ID" --log 2>&1 | grep -i -E "(error|fail|ERROR)" | tail -30
```

---

## Other Actions

### Destroy Instance

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="$(gh api user --jq .login)" \
  -f action=destroy
```

### Check Status

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="$(gh api user --jq .login)" \
  -f action=status
```

Then read the run logs for output.

---

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `gh: not logged in` | GitHub CLI not authenticated | `gh auth login` |
| `could not create workflow dispatch` | No repo write access | Check permissions |
| Build failed | Code compile error | `gh run view $RUN_ID --log` |
| No available slots | Max 9 instances on server | Destroy an old instance first |
| Workflow not found | Wrong `--ref` or workflow file missing | Use `--ref pre-launch` |
