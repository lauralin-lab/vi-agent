---
description: "RC lifecycle — prepare staging or promote to production. Try: /team-rc help"
version: "3.2.1"
---

# /team-rc — Release Candidate Lifecycle

> Prepare an RC for staging verification, or promote a verified RC to production.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Prepare: cut rc branch from develop → staging |
| `promote` | Promote: squash merge rc → main → tag → GitHub Release |
| `promote help` | Show promote operation usage |
| `help` or `-h` | Show usage guide |

---

## Route by Argument

Parse `$ARGUMENTS`:

- If `help` or `-h` → output the following and **STOP**:

```
/team-rc — Release Candidate Lifecycle (Teamwork v3.2.1)
Author: liyasong + casey | 2026-03-05

USAGE:
  /team-rc              Prepare: cut rc branch, deploy staging
  /team-rc promote      Promote: squash merge rc → main, tag, release
  /team-rc help         Show this guide

PREPARE (/team-rc):
  1. Check no active rc branch on remote
  2. Derive next version from remote tags
  3. Verify develop CI green
  4. Cut rc/{version} from develop, push
  5. Trigger staging deploy (if configured)

PROMOTE (/team-rc promote):
  1. Find active rc branch on remote
  2. Check staging status
  3. Create PR: rc → main (squash merge via GitHub)
  4. Tag squash commit on main
  5. Create GitHub Release
  6. Close milestone if complete
  7. Delete rc branch

HOTFIX (during rc — no special command):
  Branch from rc/V0.x.y → fix → PR to rc branch (squash).
  Cherry-pick fix to develop immediately.

CONFIG:
  versions.current: "V0.1"              Milestone prefix (patch auto-derived from tags)
  conventions.base_branch: "develop"     Development trunk
  conventions.production_branch: "main"  Production branch
  deploy.staging_workflow: "deploy.yml"  (optional) Staging deploy workflow name
```

- If `promote help` → jump to **Operation Promote Help**
- If `promote` → jump to **Promote Flow**
- Otherwise → **Prepare Flow**

---

## Prepare Flow

### Step 1: Pre-flight

Detect config directory:

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```

Read required values:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "ERROR: Cannot detect repo. Run: gh auth login"
  # STOP
fi

VERSION_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
if [ -z "$VERSION_PREFIX" ]; then
  echo "ERROR: versions.current not set. Add to $TEAMWORK_DIR/config.yml:"
  echo "  versions:"
  echo "    current: \"V0.1\""
  # STOP
fi

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "develop" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-develop}"

PROD_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.production_branch "main" 2>/dev/null)
PROD_BRANCH="${PROD_BRANCH:-main}"

STAGING_WORKFLOW=$(bash ~/.claude/commands/scripts/tw-config.sh deploy.staging_workflow "" 2>/dev/null)
```

### Step 2: RC Uniqueness Check

```bash
RC_BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh find-rc 2>/dev/null)
RC_EXIT=$?
# RC_EXIT: 0=found one (RC_BRANCH has name), 1=none found, 3=multiple found
```

**If `RC_EXIT` is 0 (rc branch exists)** → output and **STOP**:

```
⚠️ RC in progress: {RC_BRANCH}
  🚀 /team-rc promote ── ship to production
  ❌ git push origin --delete {RC_BRANCH} ── discard
```

### Step 3: Derive Next Version

```bash
NEXT_VERSION=$(bash ~/.claude/commands/scripts/tw-git.sh next-version "$VERSION_PREFIX")
```

### Step 4: Verify Develop CI

```bash
LATEST_CI=$(gh run list --branch "$BASE_BRANCH" --limit 1 \
  --json conclusion --jq '.[0].conclusion' 2>/dev/null)
```

- If `success` → `Develop CI: green`
- If not `success` → warn: `Develop CI not green (${LATEST_CI}). Proceed with caution.`
- Ask user: `Proceed? / Abort` — If abort → **STOP**. If you abort, fix CI failures on the RC branch and re-run `/team-rc promote`.

### Step 5: Cut RC Branch

```bash
bash ~/.claude/commands/scripts/tw-git.sh cut-release "$NEXT_VERSION"
```

This runs: checkout develop → pull → create `rc/$NEXT_VERSION` → push to origin.

### Step 6: Trigger Staging Deploy (optional)

**If `STAGING_WORKFLOW` is set:**

```bash
gh workflow run "$STAGING_WORKFLOW" --ref "rc/$NEXT_VERSION" -f environment=staging
```

Output: `Staging deploy triggered for rc/$NEXT_VERSION`

**If not set:** Output: `(No staging workflow configured — deploy manually)`

### Step 7: Summary

```
🚀 RC PREPARED ── {NEXT_VERSION} ───────────
🔀 rc/{NEXT_VERSION}  ← {BASE_BRANCH}
Staging:  {triggered / deploy manually}

📋 NEXT STEPS
  1. Verify on staging
  2. Hotfix if needed:
     branch from rc/{NEXT_VERSION} → PR → cherry-pick to {BASE_BRANCH}
  3. /team-rc promote

────────────────────────────────────────────
```

---

## Promote Flow

### Step P1: Pre-flight

Same config reads as Prepare Step 1 (REPO, VERSION_PREFIX, BASE_BRANCH, PROD_BRANCH, STAGING_WORKFLOW).

### Step P2: Find Active RC Branch

```bash
RC_BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh find-rc 2>/dev/null)
RC_EXIT=$?
# RC_EXIT: 0=found one (RC_BRANCH has name), 1=none found, 3=multiple found
```

**If `RC_EXIT` is 1 (none found)** → output and **STOP**:

```
No active RC branch found. Run /team-rc to prepare one first.
```

**If `RC_EXIT` is 3 (multiple found)** → output and **STOP**:

```
ERROR: Multiple RC branches found. Only one RC should exist at a time.
Delete the stale one(s) and retry.
```

Extract version from branch name:

```bash
VERSION=$(echo "$RC_BRANCH" | sed 's|rc/||')
```

### Step P3: Staging Check (optional)

**If `STAGING_WORKFLOW` is set:**

```bash
LATEST_RUN=$(gh run list --workflow "$STAGING_WORKFLOW" --branch "$RC_BRANCH" --limit 1 \
  --json conclusion,displayTitle,createdAt 2>/dev/null)
```

- If conclusion is `success` → `Staging: passed`
- If not → warn with details, ask user `Proceed anyway? / Abort`. Deploy to staging first. Check your CI/CD pipeline or manually trigger deployment.

**If not set:** `(Staging check skipped — no workflow configured)`

### Step P4: Confirmation

```
🚀 PROMOTE ── {VERSION} ────────────────────
🔀 {RC_BRANCH} → {PROD_BRANCH}

📋 ACTIONS
  1. PR: {RC_BRANCH} → {PROD_BRANCH} (squash)
  2. 🏷️ Tag {VERSION} on {PROD_BRANCH}
  3. 📦 GitHub Release
  4. 🏁 Check milestone
  5. 🗑️ Delete {RC_BRANCH}
────────────────────────────────────────────
```

Ask user: `Proceed? / Abort` — If abort → **STOP**

### Step P5: Generate Release Notes

Collect changes in rc relative to production:

```bash
git fetch origin "$PROD_BRANCH" "$RC_BRANCH" 2>/dev/null
CHANGES=$(git log "origin/$PROD_BRANCH..origin/$RC_BRANCH" --oneline --no-merges)
```

Format release body:

```
## What's in this release

{CHANGES formatted as bullet list, e.g.:
- feat: user login system (#42)
- feat: permission management (#45)
- fix: API timeout (#48)
}
```

### Step P6: Create PR and Squash Merge

```bash
# Create PR
gh pr create \
  --base "$PROD_BRANCH" \
  --head "$RC_BRANCH" \
  --title "release: $VERSION" \
  --body "$RELEASE_BODY" \
  --repo "$REPO"

# Get PR number
PR_NUMBER=$(gh pr view "$RC_BRANCH" --json number --jq '.number' --repo "$REPO")
```

Squash merge via GitHub (respects branch protection):

**Try auto-merge first** (waits for CI automatically):

```bash
gh pr merge "$PR_NUMBER" --squash --auto \
  --subject "release: $VERSION" \
  --body "$RELEASE_BODY" \
  --delete-branch \
  --repo "$REPO"
```

If `--auto` succeeds, poll until merge completes:

```bash
while true; do
  STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state' --repo "$REPO")
  if [ "$STATE" = "MERGED" ]; then break; fi
  if [ "$STATE" = "CLOSED" ]; then
    echo "ERROR: PR #$PR_NUMBER was closed without merging" >&2
    # STOP
  fi
  sleep 10
done
```

**If `--auto` fails** (repo doesn't have auto-merge enabled) → fallback:

```bash
# Wait for CI checks to pass
gh pr checks "$PR_NUMBER" --watch --repo "$REPO" 2>/dev/null || true

# Merge directly
gh pr merge "$PR_NUMBER" --squash \
  --subject "release: $VERSION" \
  --body "$RELEASE_BODY" \
  --delete-branch \
  --repo "$REPO"
```

Output: `PR #$PR_NUMBER squash merged to $PROD_BRANCH`

If merge fails → output error details → **STOP**

### Step P7: Tag on Main

```bash
git checkout "$PROD_BRANCH"
git pull origin "$PROD_BRANCH"

bash ~/.claude/commands/scripts/tw-git.sh tag "$VERSION"
```

Output: `Tag $VERSION pushed`

### Step P8: GitHub Release

```bash
gh release create "$VERSION" \
  --generate-notes \
  --title "$VERSION" \
  --repo "$REPO"
```

Capture and output the release URL.

If fails → warn but continue (tag exists, user can create release manually).

### Step P8b: Notification

```bash
bash ~/.claude/commands/scripts/tw-notify.sh milestone.done \
  --title "$VERSION"
```

Non-fatal: if notification fails, warn but continue.

### Step P9: Milestone Check

```bash
MILESTONE_FULL=$(bash ~/.claude/commands/scripts/tw-git.sh milestone-resolve "$VERSION_PREFIX" 2>/dev/null)
```

Then query the resolved milestone by exact title:

```bash
MILESTONE_DATA=$(gh api "repos/$REPO/milestones" \
  --jq ".[] | select(.title == \"$MILESTONE_FULL\")" 2>/dev/null)
```

**If milestone found:**

```bash
OPEN_COUNT=$(echo "$MILESTONE_DATA" | jq -r '.open_issues')
CLOSED_COUNT=$(echo "$MILESTONE_DATA" | jq -r '.closed_issues')
MILESTONE_NUMBER=$(echo "$MILESTONE_DATA" | jq -r '.number')
```

- If `OPEN_COUNT == 0` → all issues closed → close milestone:

  ```bash
  gh api "repos/$REPO/milestones/$MILESTONE_NUMBER" \
    --method PATCH --field state=closed
  ```

  Output: `Milestone "$MILESTONE_FULL" closed (all issues complete)`

- If `OPEN_COUNT > 0` → output: `Milestone "$MILESTONE_FULL": $CLOSED_COUNT closed, $OPEN_COUNT still open`

**If no milestone:** `(No milestone "$MILESTONE_FULL" found — skipped)`

### Step P10: Cherry-pick Reminder

Output:

```
Reminder: If you applied hotfixes to {RC_BRANCH} during staging,
make sure they were cherry-picked to {BASE_BRANCH}.
```

Note: Cannot check automatically here — the rc branch ref was deleted by `--delete-branch` in Step P6.

### Step P11: Clean Up Local

```bash
git branch -d "$RC_BRANCH" 2>/dev/null || true  # remote already deleted by --delete-branch
```

### Step P12: Summary

```
🏁 PROMOTED ── {VERSION} ───────────────────
🏷️ Tag: {VERSION} (on {PROD_BRANCH})
🔀 PR:  #{PR_NUMBER} (squash merged)
📦 Release: {release_url}
RC Branch:  {RC_BRANCH} (deleted)
Milestone:  {MILESTONE_FULL} — {status}

⚠️ Cherry-pick any rc hotfixes to {BASE_BRANCH} if not done.

────────────────────────────────────────────
/team-rc to prepare next RC
```

---

## Operation Promote Help

> Triggered by `/team-rc promote help`.

Output the following and **STOP**:

```
/team-rc promote — Promote RC to Production
═══════════════════════════════════════════

USAGE:
  /team-rc promote          Promote current RC to production

WHAT IT DOES:
  1. Verify RC branch exists and CI is green
  2. Verify staging deployment succeeded (if configured)
  3. Squash merge RC → main (production branch)
  4. Create git tag with version
  5. Create GitHub Release with auto-generated notes
  6. Clean up RC branch

WHEN TO USE:
  After RC has been tested on staging and approved.
  Flow: /team-rc → (test staging) → /team-rc promote

PREREQUISITES:
  - RC branch must exist (created by /team-rc)
  - CI must be green on RC branch
  - Staging deploy must be successful (if quality.staging_gate configured)

TROUBLESHOOTING:
  "No RC branch found" → Run /team-rc first to cut an RC
  "CI not green" → Fix failures on RC branch, push, wait for CI
  "Staging not verified" → Deploy to staging first, verify manually
```
