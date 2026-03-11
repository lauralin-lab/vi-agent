---
description: "RC lifecycle — prepare staging or promote to production. Try: /team-rc help"
version: "3.8.3"
---

# /team-rc — Release Candidate Lifecycle

> Prepare an RC for staging verification, or promote a verified RC to production.

**Visual Encoding** (apply to ALL output — see `docs/visual-encoding-standard.md`):
`**bold**` → headers/labels (white) · `` `backtick` `` → commands/paths/counts (purple-blue) · `*italic*` → branches (dim) · `**#NNN**` → issues (light-blue clickable, 3+ digits) · `────` dividers · ⛔ NO code blocks around output

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Prepare: cut rc branch from develop → staging |
| `cancel` | Cancel: delete current RC branch (fix on base, then re-cut) |
| `promote` | Promote: squash merge rc → main → tag → GitHub Release |
| `promote help` | Show promote operation usage |
| `help` or `-h` | Show usage guide |

---

## Route by Argument

Parse `$ARGUMENTS`:

- If `help` or `-h` → output the following and **STOP**:

**`/team-rc` — Release Candidate Lifecycle**
*Author: liyasong + casey | 2026-03-05*

**USAGE**
  `/team-rc`              Prepare: cut rc branch, deploy staging
  `/team-rc cancel`       Cancel: delete current rc, fix on base, re-cut
  `/team-rc promote`      Promote: squash merge rc → *main*, tag, release
  `/team-rc help`         Show this guide

**PREPARE** (`/team-rc`)
  1. Check no active rc branch on remote
  2. Derive next version from remote tags
  3. Verify *develop* CI green
  4. Cut *rc/{version}* from *develop*, push
  5. Trigger staging deploy (if configured)

**CANCEL** (`/team-rc cancel`)
  Delete current RC branch (local + remote).
  Use when staging found bugs — fix on *develop*, then `/team-rc` to re-cut.

**PROMOTE** (`/team-rc promote`)
  1. Find active rc branch on remote
  2. Check staging status
  3. Create PR: rc → *main* (squash merge via GitHub)
  4. Tag squash commit on *main*
  5. Create GitHub Release
  6. Close milestone if complete
  7. Delete rc branch

**BUGFIX DURING RC** (upstream-first model)
  RC is a frozen snapshot. Never commit directly to RC.
  Found a bug on staging? →
  1. Fix on *develop* (normal mission flow)
  2. `/team-rc cancel` — delete stale RC
  3. `/team-rc` — re-cut from latest *develop*
  4. Re-deploy staging

**CONFIG**
  `versions.current`: `"V0.1"`              Milestone prefix (patch auto-derived from tags)
  `conventions.base_branch`: `"develop"`     Development trunk
  `conventions.production_branch`: `"main"`  Production branch
  `deploy.staging_workflow`: `"deploy.yml"`  *(optional)* Staging deploy workflow name

- If `promote help` → jump to **Operation Promote Help**
- If `promote` → jump to **Promote Flow**
- If `cancel` → jump to **Cancel Flow**
- Otherwise → **Prepare Flow**

---

## Prepare Flow

### Step 1: Pre-flight

**Worktree guard** — `/team-rc` manages releases from the main repo, not mission worktrees:

```bash
if [ -f .mission ]; then
  MAIN_REPO=$(bash ~/.claude/commands/scripts/tw-git.sh worktree-main-repo)
  echo "⚠️ /team-rc must run from the main repo, not a mission worktree."
  echo "Switch to main repo: cd $MAIN_REPO"
  echo "Then retry: /team-rc"
  # STOP
  # 💡 Something wrong? Run /team doctor to diagnose, or /team doctor fix to auto-repair.
fi
```

Detect config directory:

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```

- If no config → "**ERROR:** Teamwork not initialized. Run `/team` first." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

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

- If no repo detected → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.
- If `versions.current` not set → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

### Step 2: RC Uniqueness Check

```bash
RC_BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh find-rc 2>/dev/null)
RC_EXIT=$?
# RC_EXIT: 0=found one (RC_BRANCH has name), 1=none found, 3=multiple found
```

**If `RC_EXIT` is 0 (rc branch exists)** → show status and offer choices:

**RC in progress:** *{RC_BRANCH}*

Use `AskUserQuestion`:
```
question: "已有 RC 分支 {RC_BRANCH}。如何操作？"
options:
  - label: "Promote（发布到 production）"
    description: "RC 验证通过，执行 /team-rc promote"
  - label: "Cancel（取消 RC，重新来）"
    description: "删除 RC 分支，在 base 修复后重新切"
  - label: "退出"
    description: "不操作"
```

- If "Promote" → jump to **Promote Flow** (skip P1 pre-flight, config already loaded)
- If "Cancel" → jump to **Cancel Flow** Step C3 (RC_BRANCH already found)
- If "退出" → **STOP**

### Step 3: Derive Next Version

```bash
NEXT_VERSION=$(bash ~/.claude/commands/scripts/tw-git.sh next-version "$VERSION_PREFIX")
```

### Step 4: Verify Develop CI

```bash
LATEST_CI=$(gh run list --branch "$BASE_BRANCH" --limit 1 \
  --json conclusion --jq '.[0].conclusion' 2>/dev/null)
```

- If `success` → `Develop CI: green` → continue to Step 5
- If not `success` → warn: `Develop CI not green (${LATEST_CI}). Proceed with caution.`

Use `AskUserQuestion`:
```
question: "Develop CI 未通过 ({LATEST_CI})。是否继续？"
options:
  - label: "继续"
    description: "CI 问题不影响本次 RC，继续切分支"
  - label: "中止"
    description: "先修 CI，之后重新 /team-rc"
```
If "中止" → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

### Step 4b: Confirm RC Preparation

Display the RC summary and confirm before cutting:

**PREPARE RC** ── **{NEXT_VERSION}** ────────────────────
*rc/{NEXT_VERSION}* ← *{BASE_BRANCH}*
Develop CI: {green / not green}
Staging: {workflow name / "(No staging workflow configured — deploy manually)"}
────────────────────────────────────────────

Use `AskUserQuestion`:
```
question: "确认切 RC 分支？"
options:
  - label: "确认"
    description: "从 {BASE_BRANCH} 切出 rc/{NEXT_VERSION}"
  - label: "取消"
    description: "放弃本次 RC"
```
If "取消" → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

### Step 5: Cut RC Branch

```bash
bash ~/.claude/commands/scripts/tw-git.sh cut-release "$NEXT_VERSION"
```

This runs: fetch origin/develop → create `rc/$NEXT_VERSION` from it → push to origin. **Does NOT checkout or modify the working tree.**

### Step 6: Trigger Staging Deploy (optional)

**If `STAGING_WORKFLOW` is set:**

```bash
gh workflow run "$STAGING_WORKFLOW" --ref "rc/$NEXT_VERSION" -f environment=staging
```

Output: Staging deploy triggered for *rc/{NEXT_VERSION}*

**If not set:** Output: *(No staging workflow configured — deploy manually)*

### Step 7: Summary

**RC PREPARED ── {NEXT_VERSION}** ────────────────────
*rc/{NEXT_VERSION}*  ← *{BASE_BRANCH}*
Staging:  {triggered / deploy manually}

**NEXT STEPS**
  1. 部署 staging，验证
  2. 发现 bug? → 在 *{BASE_BRANCH}* 修复 → `/team-rc cancel` → `/team-rc` 重新切
  3. 验证通过 → `/team-rc promote`

────────────────────────────────────────────

💡 Tip: {random tip — read `~/.claude/commands/scripts/tw-tips.txt`, pick one non-comment line at random}

---

## Cancel Flow

> Triggered by `/team-rc cancel`. Delete the current RC branch so you can fix on base and re-cut.

### Step C1: Pre-flight

Same prerequisites as Promote — config, `gh`, git remote.

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "develop" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-develop}"
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
```

### Step C2: Find active RC branch

```bash
RC_BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh find-rc 2>/dev/null)
```

If no RC branch found → "No active RC branch to cancel." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

If multiple found → "Multiple RC branches found. Delete manually: `git push origin --delete {branch}`" → **STOP**

### Step C3: Show RC info + confirm

```bash
# Show what's on the RC branch
RC_COMMITS=$(git log "origin/$BASE_BRANCH..origin/$RC_BRANCH" --oneline --no-merges 2>/dev/null)
RC_COMMIT_COUNT=$(echo "$RC_COMMITS" | grep -c . 2>/dev/null || echo 0)
```

**CANCEL RC** ── *{RC_BRANCH}* ────────────────────
Commits on RC: `{RC_COMMIT_COUNT}`
{RC_COMMITS as indented list}

⚠️ This will delete *{RC_BRANCH}* (local + remote). Commits are preserved in *{BASE_BRANCH}*.
────────────────────────────────────────────

Use `AskUserQuestion`:
```
question: "确认取消 RC？分支 {RC_BRANCH} 将被删除（local + remote）。"
options:
  - label: "确认取消"
    description: "删除 RC 分支，之后可在 {BASE_BRANCH} 修复后重新 /team-rc"
  - label: "保留"
    description: "不取消，继续 staging 验证"
```

If "保留" → **STOP**

### Step C4: Delete RC branch

```bash
# Delete remote
git push origin --delete "$RC_BRANCH" 2>/dev/null || {
  echo "WARNING: Could not delete remote branch (may not exist)" >&2
}

# Delete local
git branch -d "$RC_BRANCH" 2>/dev/null || git branch -D "$RC_BRANCH" 2>/dev/null || true
```

### Step C5: Summary

**RC CANCELLED** ── *{RC_BRANCH}* ────────────────────
Branch deleted (local + remote).

**Next:**
  1. Fix the issue on *{BASE_BRANCH}* (normal mission flow)
  2. `/team-rc` to re-cut RC from latest *{BASE_BRANCH}*
  3. Re-deploy staging
────────────────────────────────────────────

💡 Tip: {random tip — read `~/.claude/commands/scripts/tw-tips.txt`, pick one non-comment line at random}

---

## Promote Flow

### Step P1: Pre-flight

Same worktree guard + config reads as Prepare Step 1 (worktree check, REPO, VERSION_PREFIX, BASE_BRANCH, PROD_BRANCH, STAGING_WORKFLOW).

### Step P2: Find Active RC Branch

```bash
RC_BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh find-rc 2>/dev/null)
RC_EXIT=$?
# RC_EXIT: 0=found one (RC_BRANCH has name), 1=none found, 3=multiple found
```

**If `RC_EXIT` is 1 (none found)** → output and **STOP**:

No active RC branch found. Run `/team-rc` to prepare one first.
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

**If `RC_EXIT` is 3 (multiple found)** → output and **STOP**:

**ERROR:** Multiple RC branches found. Only one RC should exist at a time.
Delete the stale one(s) and retry.
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

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
- If not → warn with details.

Use `AskUserQuestion`:
```
question: "Staging 未通过。是否继续 promote？"
options:
  - label: "继续"
    description: "Staging 问题已知，继续 promote"
  - label: "中止"
    description: "先修 staging，之后重新 /team-rc promote"
```
If "中止" → **STOP**. Deploy to staging first. Check your CI/CD pipeline or manually trigger deployment.
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

**If not set:**

⚠️ **Staging 未配置** — `deploy.staging_workflow` 为空。
跳过自动 staging 检查。**请手动验证 RC 分支可正常运行后再 promote。**
配置方法：在 `config.yml` 添加 `deploy.staging_workflow: "deploy-staging.yml"`

### Step P4: Confirmation

**PROMOTE ── {VERSION}** ────────────────────
*{RC_BRANCH}* → *{PROD_BRANCH}*

**ACTIONS**
  1. PR: *{RC_BRANCH}* → *{PROD_BRANCH}* (squash)
  2. Tag **{VERSION}** on *{PROD_BRANCH}*
  3. GitHub Release
  4. Check milestone
  5. Delete *{RC_BRANCH}*
────────────────────────────────────────────

Use `AskUserQuestion`:
```
question: "确认 promote？这会创建 PR、tag、GitHub Release。"
options:
  - label: "Promote"
    description: "执行上述所有操作"
  - label: "中止"
    description: "取消 promote"
```
If "中止" → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

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
  --repo "$REPO"
```

If `--auto` succeeds, poll until merge completes:

```bash
bash ~/.claude/commands/scripts/tw-pr.sh wait-merged "$PR_NUMBER" "$REPO"
```

If wait-merged exits non-zero → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

**If `--auto` fails** (repo doesn't have auto-merge enabled) → fallback:

```bash
# Wait for CI checks to pass
bash ~/.claude/commands/scripts/tw-pr.sh watch "$PR_NUMBER" || {
  echo "WARNING: CI checks failed or timed out — attempting merge anyway"
}

# Merge directly
gh pr merge "$PR_NUMBER" --squash \
  --subject "release: $VERSION" \
  --body "$RELEASE_BODY" \
  --repo "$REPO"
```

Output: PR **#{PR_NUMBER}** squash merged to *{PROD_BRANCH}*

If merge fails → output error details → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

### Step P7: Tag on Main

```bash
git fetch origin "$PROD_BRANCH"
bash ~/.claude/commands/scripts/tw-git.sh tag "$VERSION" "origin/$PROD_BRANCH"
```

**Does NOT checkout or modify the working tree.** Tags the remote production branch ref directly.

Output: Tag **{VERSION}** pushed

### Step P8: GitHub Release

```bash
gh release create "$VERSION" \
  --generate-notes \
  --title "$VERSION" \
  --repo "$REPO"
```

Capture and output the release URL.

If fails → warn but continue (tag exists, release can be created via `gh release create`).

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

  Output: Milestone **{MILESTONE_FULL}** closed (all issues complete)

- If `OPEN_COUNT > 0` → output: Milestone **{MILESTONE_FULL}**: `{CLOSED_COUNT}` closed, `{OPEN_COUNT}` still open

**If no milestone:** *(No milestone "{MILESTONE_FULL}" found — skipped)*

### Step P10: Delete RC Branch

RC is a frozen snapshot — all fixes live in *{BASE_BRANCH}*. No merge-back needed.

```bash
# Delete remote
git push origin --delete "$RC_BRANCH" 2>/dev/null || {
  echo "WARNING: Could not delete remote RC branch" >&2
}

# Delete local
git branch -d "$RC_BRANCH" 2>/dev/null || git branch -D "$RC_BRANCH" 2>/dev/null || true
```

### Step P11: Summary

**PROMOTED ── {VERSION}** ────────────────────
Tag: **{VERSION}** (on *{PROD_BRANCH}*)
PR:  **#{PR_NUMBER}** (squash merged)
Release: {release_url}
RC Branch:  *{RC_BRANCH}* (deleted)
Milestone:  **{MILESTONE_FULL}** — {status}

────────────────────────────────────────────
`/team-rc` to prepare next RC

💡 Tip: {random tip — read `~/.claude/commands/scripts/tw-tips.txt`, pick one non-comment line at random}

---

## Operation Promote Help

> Triggered by `/team-rc promote help`.

Output the following and **STOP**:

**`/team-rc promote` — Promote RC to Production**
────────────────────────────────────────────

**USAGE**
  `/team-rc promote`          Promote current RC to production

**WHAT IT DOES**
  1. Verify RC branch exists and CI is green
  2. Verify staging deployment succeeded (if configured)
  3. Squash merge RC → *main* (production branch)
  4. Create git tag with version
  5. Create GitHub Release with auto-generated notes
  6. Clean up RC branch

**WHEN TO USE**
  After RC has been tested on staging and approved.
  Flow: `/team-rc` → *(test staging)* → `/team-rc promote`

**PREREQUISITES**
  RC branch must exist (created by `/team-rc`)
  CI must be green on RC branch
  Staging deploy must be successful (if `deploy.staging_workflow` configured)

**TROUBLESHOOTING**
  "No RC branch found" → Run `/team-rc` first to cut an RC
  "CI not green" → Fix on *{base_branch}*, then `/team-rc cancel` + `/team-rc` to re-cut
  "Staging not verified" → Deploy to staging first, verify manually

**BUGFIX DURING RC**
  RC is a frozen snapshot — never commit directly to RC.
  Found a bug? Fix on *{base_branch}* → `/team-rc cancel` → `/team-rc` (re-cut).
  See also: `/team-rc cancel`
