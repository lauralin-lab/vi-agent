---
description: "RC lifecycle — prepare staging or promote to production. Try: /team-rc help"
version: "0.1.0"
---

# /team-rc — Release Candidate Lifecycle

> Prepare an RC for staging verification, or promote a verified RC to production.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Prepare: cut rc branch from develop → staging |
| `promote` | Promote: squash merge rc → product → tag → GitHub Release |
| `help` or `-h` | Show usage guide |

---

## Route by Argument

Parse `$ARGUMENTS`:

- If `help` or `-h` → output the following and **STOP**:

```
/team-rc — Release Candidate lifecycle

USAGE:
  /team-rc              Prepare: cut rc branch from pre-launch, deploy staging
  /team-rc promote      Promote: squash merge rc → product, tag, release
  /team-rc help         Show this guide

PREPARE (/team-rc):
  1. Check no active rc branch on remote
  2. Derive next version from remote tags
  3. Verify pre-launch CI green
  4. Cut rc/{version} from pre-launch, push
  5. Trigger staging deploy (if configured)

PROMOTE (/team-rc promote):
  1. Find active rc branch on remote
  2. Check staging status
  3. Create PR: rc → product (squash merge via GitHub)
  4. Tag squash commit on product
  5. Create GitHub Release
  6. Close milestone if complete
  7. Delete rc branch

HOTFIX (during rc — no special command):
  Branch from rc/V0.x.y → fix → PR to rc branch (squash).
  Cherry-pick fix to pre-launch immediately.

CONFIG:
  versions.current: "V0.1"                  Milestone prefix (patch auto-derived from tags)
  conventions.base_branch: "pre-launch"      Development trunk (next version integration)
  conventions.production_branch: "product"   Production branch (strict protection)
  deploy.staging_workflow: "deploy.yml"      (optional) Staging deploy workflow name
```

- If `promote` → jump to **Promote Flow**
- Otherwise → **Prepare Flow**

---

## Prepare Flow

### Step 1: Pre-flight

Detect config directory:

```bash
if [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
elif [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
else
  echo "ERROR: No config found. Run /team to initialize."
  # STOP
fi
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

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"

PROD_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.production_branch "product" 2>/dev/null)
PROD_BRANCH="${PROD_BRANCH:-product}"

STAGING_WORKFLOW=$(bash ~/.claude/commands/scripts/tw-config.sh deploy.staging_workflow "" 2>/dev/null)
```

### Step 2: RC Uniqueness Check

```bash
EXISTING_RC=$(git ls-remote --heads origin 'rc/*' 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||')
```

**If `EXISTING_RC` is non-empty** → output and **STOP**:

```
RC already in progress: {EXISTING_RC}

Options:
  - /team-rc promote    Ship this RC to production
  - Delete it:          git push origin --delete {EXISTING_RC}
```

### Step 3: Derive Next Version

```bash
git fetch --tags origin 2>/dev/null

# Match only clean version tags (V0.1.0, V0.1.1, ...) — exclude pre-release like V0.1.0-beta
LAST_TAG=$(git tag -l "${VERSION_PREFIX}.*" --sort=-v:refname \
  | grep -E "^${VERSION_PREFIX}\.[0-9]+$" | head -1)

if [ -z "$LAST_TAG" ]; then
  NEXT_VERSION="${VERSION_PREFIX}.0"
else
  PATCH=$(echo "$LAST_TAG" | awk -F. '{print $NF}')
  NEXT_PATCH=$((PATCH + 1))
  PREFIX=$(echo "$LAST_TAG" | sed 's/\.[0-9]*$//')
  NEXT_VERSION="${PREFIX}.${NEXT_PATCH}"
fi
```

### Step 4: Verify Develop CI

```bash
LATEST_CI=$(gh run list --branch "$BASE_BRANCH" --limit 1 \
  --json conclusion --jq '.[0].conclusion' 2>/dev/null)
```

- If `success` → `Pre-launch CI: green`
- If not `success` → warn: `Pre-launch CI not green (${LATEST_CI}). Proceed with caution.`
- Ask user: `Proceed? / Abort` — If abort → **STOP**

### Step 5: Cut RC Branch

```bash
bash ~/.claude/commands/scripts/tw-git.sh cut-release "$NEXT_VERSION"
```

This runs: checkout pre-launch → pull → create `rc/$NEXT_VERSION` → push to origin.

### Step 6: Trigger Staging Deploy (optional)

**If `STAGING_WORKFLOW` is set:**

```bash
gh workflow run "$STAGING_WORKFLOW" --ref "rc/$NEXT_VERSION" -f environment=staging
```

Output: `Staging deploy triggered for rc/$NEXT_VERSION`

**If not set:** Output: `(No staging workflow configured — deploy manually)`

### Step 7: Summary

```
RC PREPARED
════════════════════════════════════
Version:  {NEXT_VERSION}
Branch:   rc/{NEXT_VERSION}
Source:   {BASE_BRANCH}
Staging:  {triggered / deploy manually}
════════════════════════════════════

Next steps:
  1. Verify on staging
  2. Hotfix if needed:
     - Branch from rc/{NEXT_VERSION}
     - Fix → PR to rc/{NEXT_VERSION}
     - Cherry-pick fix to {BASE_BRANCH}
  3. /team-rc promote
════════════════════════════════════
```

---

## Promote Flow

### Step P1: Pre-flight

Same config reads as Prepare Step 1 (REPO, VERSION_PREFIX, BASE_BRANCH, PROD_BRANCH, STAGING_WORKFLOW).

### Step P2: Find Active RC Branch

```bash
EXISTING_RC=$(git ls-remote --heads origin 'rc/*' 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||')
```

**If empty** → output and **STOP**:

```
No active RC branch found. Run /team-rc to prepare one first.
```

**If more than one line** (multiple rc branches — abnormal state) → output and **STOP**:

```
ERROR: Multiple RC branches found:
{list each}

Only one RC should exist at a time. Delete the stale one(s) and retry.
```

Extract version from branch name:

```bash
VERSION=$(echo "$EXISTING_RC" | sed 's|rc/||')
RC_BRANCH="rc/$VERSION"
```

### Step P3: Staging Check (optional)

**If `STAGING_WORKFLOW` is set:**

```bash
LATEST_RUN=$(gh run list --workflow "$STAGING_WORKFLOW" --branch "$RC_BRANCH" --limit 1 \
  --json conclusion,displayTitle,createdAt 2>/dev/null)
```

- If conclusion is `success` → `Staging: passed`
- If not → warn with details, ask user `Proceed anyway? / Abort`

**If not set:** `(Staging check skipped — no workflow configured)`

### Step P4: Confirmation

```
PROMOTE SUMMARY
════════════════════════════════════
Version:    {VERSION}
RC Branch:  {RC_BRANCH}
Target:     {PROD_BRANCH}

This will:
  1. Create PR: {RC_BRANCH} → {PROD_BRANCH} (squash merge)
  2. Tag {VERSION} on {PROD_BRANCH}
  3. Create GitHub Release
  4. Check milestone completion
  5. Delete {RC_BRANCH}
════════════════════════════════════
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

### Step P9: Milestone Check

```bash
MILESTONE_DATA=$(gh api "repos/$REPO/milestones" \
  --jq ".[] | select(.title | startswith(\"$VERSION_PREFIX\"))" 2>/dev/null)
```

Note: uses `startswith` so milestone "V0.1" matches "V0.1", "V0.1 — AI Camera", etc.

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

  Output: `Milestone "$VERSION_PREFIX" closed (all issues complete)`

- If `OPEN_COUNT > 0` → output: `Milestone "$VERSION_PREFIX": $CLOSED_COUNT closed, $OPEN_COUNT still open`

**If no milestone:** `(No milestone "$VERSION_PREFIX" found — skipped)`

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
RC PROMOTED
════════════════════════════════════
Version:    {VERSION}
Tag:        {VERSION} (on {PROD_BRANCH})
PR:         #{PR_NUMBER} (squash merged)
Release:    {release_url}
RC Branch:  {RC_BRANCH} (deleted)
Milestone:  {VERSION_PREFIX} — {status}
════════════════════════════════════

Reminder: Cherry-pick any rc hotfixes to {BASE_BRANCH} if not already done.

Next: /team-rc to prepare the next release candidate
════════════════════════════════════
```
