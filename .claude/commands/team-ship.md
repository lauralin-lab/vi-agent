---
description: "Ship mission → PR. Try: /team-ship help"
version: "3.0.0"
---

# /team-ship — Deliver Mission

> Push your branch, create a PR that auto-closes the Issue, optionally watch CI, and clean up the local Contract.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Full ship flow (push, PR, CI, cleanup) |
| `done` | Post-merge cleanup (close Issue, update labels, clean worktree) |
| `done help` | Show done operation usage |
| `review` | AI code review on current PR |
| `review help` | Show review operation usage |
| `sync` | Rebase current branch on base branch |
| `sync help` | Show sync operation usage |
| `help` or `-h` | Show usage guide |

---

## Route by Argument

Parse `$ARGUMENTS`:
- If `help` or `-h` → output the following and **STOP**:

```
/team-ship — Deliver your mission

USAGE:
  /team-ship            Push + create PR + CI check + cleanup
  /team-ship done       After PR merge: close Issue, update labels, clean worktree
  /team-ship review     AI review current PR (correctness/security/architecture/quality)
  /team-ship sync       Rebase current branch on latest base branch

SHIP FLOW:
  1. Pre-flight: verify branch, sub-tasks done, tests pass
  2. Push branch to GitHub
  3. Create PR with "Closes #N" (auto-closes Issue on merge)
  4. Watch CI (if configured)
  5. Request review (if configured)
  6. Clean up local Contract, label Issue status:review

AFTER MERGE:
  /team-ship done closes the Issue, labels status:done, returns to base branch.
```

- If `done help` → jump to **Operation Done Help**
- If `done` → jump to **Operation Done**
- If `review help` → jump to **Operation Review Help**
- If `review` → jump to **Operation Review**
- If `sync help` → jump to **Operation Sync Help**
- If `sync` → jump to **Operation Sync**
- If empty or anything else → continue to **Step 0: Full Ship Flow**

---

## Step 0: Prerequisites

```bash
# Identity
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
if [ -z "$GH_USER" ]; then
  echo "ERROR: Cannot get GitHub user identity. Run 'gh auth login' first."
  exit 1
fi
```

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```

- If no config → "Teamwork not initialized. Run `/team` first." → **STOP**

Read `$TEAMWORK_DIR/config.yml` → extract project settings, conventions, quality preferences.

```bash
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
```

---

## Step 1: Find Active Contract

```bash
# Check for worktree mode
if [ -f .mission ]; then
  WORKTREE_MODE=true
  MISSION_ISSUE=$(cat .mission)
fi

ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null
```

- If no Contract found AND no `.mission` file → "No active mission. Nothing to ship." → **STOP**
- If no Contract but `.mission` exists → use Issue number from `.mission` to locate Contract or fetch Issue directly.
- **Worktree fallback**: If in worktree mode and Contract not found locally, check the main repo's `$TEAMWORK_DIR/active/` directory (parent of worktree path).
- If multiple Contracts found → "Multiple active contracts found. Keep one, remove the rest." → **STOP**

Read the Contract file fully. Extract from YAML frontmatter:
- `issue` number
- `title`
- `url`
- `branch`
- `priority`

Extract from body:
- **Sub-tasks** (with checkbox status)
- **Acceptance Criteria**
- **AI Notes**

---

## Step 2: Pre-flight Checks

### 2a: Verify branch

```bash
CURRENT_BRANCH=$(git branch --show-current)
```

Compare with Contract's `branch` field. If on wrong branch:

```bash
CONTRACT_BRANCH="{branch}"  # from Contract frontmatter
# Verify branch exists and switch to it
git checkout "$CONTRACT_BRANCH" 2>/dev/null || {
  echo "ERROR: Branch '$CONTRACT_BRANCH' not found locally or on origin."
  echo "Re-run /team-claim #{issue} to recreate the mission branch."
  exit 1
}
```

### 2a-bis: Branch Sync Check

Check how far behind base and remote:

```bash
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"

# Fetch latest to get accurate counts
git fetch origin "$BASE_BRANCH" --quiet 2>/dev/null || true
git fetch origin "$(git branch --show-current)" --quiet 2>/dev/null || true

BEHIND_BASE=$(git rev-list --count HEAD..origin/$BASE_BRANCH 2>/dev/null || echo "0")

CURRENT_BRANCH=$(git branch --show-current)
if git rev-parse --verify "origin/$CURRENT_BRANCH" >/dev/null 2>&1; then
  BEHIND_REMOTE=$(git rev-list --count HEAD..origin/$CURRENT_BRANCH 2>/dev/null || echo "0")
else
  BEHIND_REMOTE="0"
fi
```

- If `BEHIND_BASE` > 30 → 🔴 "Branch is {N} commits behind base. Rebase before shipping to avoid painful merge conflicts. Run `/team-ship sync` first." → **STOP**
- If `BEHIND_BASE` > 10 → 🟡 "Branch is {N} commits behind base. Consider running `/team-ship sync` before shipping."
- If `BEHIND_REMOTE` > 0 → 🟡 "Local branch is behind remote by {N} commits. Run `git pull --rebase` to sync before pushing."

### 2b: Verify all sub-tasks complete

Check the Contract's sub-tasks section. Count `- [x]` vs `- [ ]`.
- If any unchecked sub-tasks remain → display them and say:
  "Not all sub-tasks are complete. Finish them with `/team-drive` first, or manually check them off in the Contract."
  → **STOP**

### 2c: Clean working tree

```bash
git status --porcelain
```

- If there are uncommitted changes → warn: "You have uncommitted changes. Committing them now."
  ```bash
  bash ~/.claude/commands/scripts/tw-git.sh commit "chore: pre-ship cleanup | Mission: #${ISSUE_NUMBER}"
  ```

### 2d: Run tests

Read config for service-aware testing:

```bash
# Check if project has services configured
# If project.services exists in config, run per-service tests for affected services
# Otherwise fall back to project.test_command

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"

# Determine affected services from changes
CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH...HEAD" 2>/dev/null)
```

Read `project.services` from config. For each service, check if any changed file is in that service's directory. Run the service's `test_command` for affected services. If no services configured, fall back to `project.test_command`:

```bash
TEST_CMD=$(bash ~/.claude/commands/scripts/tw-config.sh project.test_command "" 2>/dev/null)
if [ -z "$TEST_CMD" ]; then
  echo "⚠ No test_command configured in $TEAMWORK_DIR/config.yml — skipping pre-flight tests"
  echo "  Add 'test_command: \"npm test\"' to $TEAMWORK_DIR/config.yml to enable this check"
else
  echo "Running tests: $TEST_CMD"
  eval "$TEST_CMD"
fi
```

- If any test command exits non-zero → "Tests are failing. Fix them before shipping. Run /team-drive to fix, then retry /team-ship." → **STOP**

---

## Step 3: Push

```bash
bash ~/.claude/commands/scripts/tw-git.sh push {branch}
```

- If exit code 2 → push failed. Suggest `/team-ship sync` then retry push.
- If push still fails → "Push failed. Resolve the issue manually." → **STOP**

---

## Step 4: Create PR

### 4a: Check for existing PR

```bash
EXISTING_PR=$(bash ~/.claude/commands/scripts/tw-pr.sh exists {branch}) && {
  echo "PR already exists: $EXISTING_PR"
  # Skip PR creation, use existing PR number/url
}
```

If a PR already exists for this branch → skip PR creation, use existing PR.

Display existing PR status:
- CI status from PR statusCheckRollup
- Review decision
- Mergeable state
Output: "PR #{number} already exists — CI: {status}, Review: {status}. Pushing will update it."

### 4b: Generate PR body

Build the PR body from the Contract:

```markdown
Closes #{issue}

## Objective
{objective from Contract}

## Changes
{For each completed sub-task:}
- {sub-task description}

## Acceptance Criteria
{criteria from Contract}

## Test
{test command} — passing ✅

## AI Notes
{notes from Contract's AI Notes section, if present}
```

### 4c: Create the PR

```bash
# Read base branch and extract Issue title from Contract
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
ISSUE_TITLE=$(bash ~/.claude/commands/scripts/tw-contract.sh read-field "$TEAMWORK_DIR/active/MISSION-{issue}.md" title)

# Determine commit type from title (deterministic heuristic)
COMMIT_TYPE=$(bash ~/.claude/commands/scripts/tw-pr.sh commit-type "$ISSUE_TITLE")

# Create PR (BODY is generated by LLM from Contract content — see Step 4b)
PR_RESULT=$(bash ~/.claude/commands/scripts/tw-pr.sh create {issue} "${COMMIT_TYPE}: {title}" "$PR_BODY" "$BASE_BRANCH" "{branch}")
PR_NUMBER=$(echo "$PR_RESULT" | cut -d' ' -f1)
PR_URL=$(echo "$PR_RESULT" | cut -d' ' -f2)
```

Capture the PR number and URL from the output.

### 4d: Post PR comment to Issue

```bash
bash ~/.claude/commands/scripts/tw-pr.sh comment {issue} "📦 PR #${PR_NUMBER} created — ${PR_URL}"
```

Non-fatal: if comment fails, warn but continue.

### 4e: Add labels

```bash
bash ~/.claude/commands/scripts/tw-label.sh pr-label {pr} review
```

If this fails (label doesn't exist), warn but continue.

### 4f: Notification

```bash
bash ~/.claude/commands/scripts/tw-notify.sh mc.completed \
  --issue "$ISSUE_NUMBER" --title "$TITLE" \
  --assignee "$GH_USER" --pr "$PR_URL"
```

Non-fatal: if notification fails, warn but continue.

---

## Step 5: CI Check (if configured)

Read `quality.ci` from config.

If CI is enabled:
```bash
bash ~/.claude/commands/scripts/tw-pr.sh watch {pr}
```

- If CI passes → "CI passed ✅"
- If CI fails → "CI failed ❌. Check the PR for details: {pr-url}" (do NOT stop — the PR is already created, user can fix and push again)
  "Fix the failures, commit, and push to {branch} — the PR will update automatically. Or run /team-drive to fix in mission mode."

If CI is not enabled → skip this step.

---

## Step 6: Request Review (if configured)

Read `quality.review_required` from config.

If review is required:
- Find the tech-lead from the team roster in config (use LLM to parse config and find team member with `role: tech-lead`).
- Request review:
  ```bash
  bash ~/.claude/commands/scripts/tw-pr.sh add-reviewer {pr} {tech-lead-github}
  ```
- If reviewer assignment fails (permissions), warn but continue.

If review is not required → skip this step.

---

## Step 7: Cleanup

### 7a: Update Issue labels

```bash
# Transition wip → review (reads prefix from config)
bash ~/.claude/commands/scripts/tw-label.sh transition {issue} wip review

# Verify the update
bash ~/.claude/commands/scripts/tw-label.sh verify {issue} review
```

- If verify returns "VERIFIED" → "Issue labeled review ✅"
- If verify returns "MISMATCH" → warn: "Label update incomplete"
- If verify fails (network) → "⚠ Could not verify labels. Assume update succeeded."
- Non-blocking in all cases: continue to 7b.

### 7b: Remove Contract

```bash
bash ~/.claude/commands/scripts/tw-contract.sh delete "$TEAMWORK_DIR/active/MISSION-{issue}.md"
```

The Contract has served its purpose. The PR body now contains the essential information. If the PR is rejected and the mission needs to be reworked, re-run `/team-claim #{issue}` to regenerate a fresh Contract.

---

## Step 8: Output Delivery Summary

```
📦 SHIPPED ── #{issue} {title} ─────────────
🔀 {branch}
🔀 PR: {pr-url}
{ci_icon} CI: {passing/failing/not configured}
Review:    {requested from @{reviewer} / not required}
Labels:    {actual current labels}

📋 SUB-TASKS DELIVERED
  ✅ {task 1}
  ✅ {task 2}

────────────────────────────────────────────
/team-ship done (after merge) │ /team-ship review │ /team
```

---

## Operation Done (post-merge cleanup)

> Triggered by `/team-ship done`. Verifies PR merged, closes Issue, cleans up worktree.

### D1: Find the Issue

Locate the Issue number from (in priority order):
1. Active Contract (`$TEAMWORK_DIR/active/MISSION-*.md` frontmatter)
2. `.mission` file (worktree mode)
3. Current branch name — extract first numeric segment after `/` (works for both `mission/42-slug` and `bugfix/T-044-slug` patterns)
4. `$ARGUMENTS` — if user passes `done #42` or `done 42`

If no Issue found → "Cannot determine Issue. Provide Issue number: `/team-ship done #42`" → **STOP**

### D2: Verify PR is merged

```bash
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh current)
bash ~/.claude/commands/scripts/tw-pr.sh verify-merged "$BRANCH"
```

- If exit code 1 → "No merged PR found for branch `{branch}`. PR must be merged before running `done`." → **STOP**

### D3: Close Issue (fallback — usually handled by "Closes #N" in PR)

```bash
ISSUE_STATE=$(gh issue view {issue} --json state --jq '.state' 2>/dev/null)
```

If Issue is still open (GitHub "Closes #N" didn't fire, or PR body didn't include it):
```bash
gh issue close {issue} --reason completed
```

If already closed → skip, output: `(Issue already closed — handled by PR merge)`

### D4: Update labels (fallback — usually handled by post-merge Action)

```bash
ISSUE_LABELS=$(gh issue view {issue} --json labels --jq '[.labels[].name] | join(",")' 2>/dev/null)
```

If `${STATUS_PREFIX}done` is NOT in labels (post-merge Action didn't run or failed):
```bash
bash ~/.claude/commands/scripts/tw-label.sh transition {issue} review done
```

If `${STATUS_PREFIX}done` already present → skip, output: `(Labels already updated — handled by post-merge Action)`

### D5: Clean up worktree (if applicable)

If `.mission` file exists (worktree mode):
- Ask user: "Remove worktree at `{worktree_path}`?" via `AskUserQuestion`
- If yes:
  ```bash
  WORKTREE_PATH=$(pwd)
  cd {original_repo_path}
  bash ~/.claude/commands/scripts/tw-git.sh worktree-remove "$WORKTREE_PATH"
  ```
- If no: `cd {original_repo_path}` first (must leave worktree for D6), then warn "Worktree kept. Remove manually with `git worktree remove {path}`."

### D6: Return to base branch

```bash
# Check for uncommitted changes BEFORE switching (exclude untracked-only)
DIRTY=$(git status --porcelain 2>/dev/null | grep -v '^??')
if [ -n "$DIRTY" ]; then
  STASH_MSG="team-ship-done: stashed from $(git branch --show-current) before cleanup"
  git stash push -u -m "$STASH_MSG" || {
    echo "ERROR: git stash failed. Commit or discard changes manually before cleanup."
    # STOP — do not proceed to checkout, risk losing changes
  }
  echo "⚠️ Stashed uncommitted changes. Recover with: git stash pop"
fi

bash ~/.claude/commands/scripts/tw-git.sh ensure-base || {
  echo "ERROR: Could not switch to base branch."
  if [ -n "$DIRTY" ]; then
    echo "Your changes are saved in stash. Recover with: git stash pop"
  fi
  # STOP
}
```

### D7: Clean up Contract

```bash
bash ~/.claude/commands/scripts/tw-contract.sh delete "$TEAMWORK_DIR/active/MISSION-{issue}.md"
```

### D8: Output summary

```
🏁 DONE ── #{issue} {title} ────────────────
Issue:     closed
🔀 PR: {pr-url} (merged)
Labels:    {STATUS_PREFIX}done
Worktree:  {removed/kept/n/a}
Branch:    {BASE_BRANCH}

────────────────────────────────────────────
/team-claim (next mission) │ /team (dashboard)
```

---

## Operation Review (AI PR review)

> Triggered by `/team-ship review`. Fetches PR diff, reviews code, publishes review.

### R1: Find PR

```bash
BRANCH=$(git branch --show-current)
gh pr list --head "$BRANCH" --state open --json number,url --limit 1
```

If `$ARGUMENTS` contains a PR number → use that instead.
If no open PR found → "No open PR found for branch `{branch}`." → **STOP**

### R2: Get PR diff

```bash
gh pr diff {pr}
```

### R3: Read changed files

For each file in the diff, read the full current content to understand context beyond just the diff hunks.

### R4: AI Review

Analyze the changes for:
- **Correctness**: Logic errors, missing edge cases, off-by-one errors
- **Security**: Injection vulnerabilities, exposed secrets, unsafe operations
- **Architecture**: Coupling, separation of concerns, pattern consistency
- **Quality**: Naming, readability, dead code, duplication
- **Performance**: N+1 queries, unnecessary allocations, missing indexes

### R5: Choose review action

Use `AskUserQuestion`:
```
question: "What review action?"
options:
  - label: "Approve"
    description: "Changes look good — approve the PR"
  - label: "Request changes"
    description: "Issues found — request fixes before merge"
  - label: "Comment only"
    description: "Leave feedback without approval decision"
```

### R6: Publish review

```bash
gh pr review {pr} --body "{review_body}" {--approve|--request-changes|--comment}
```

Output: "Review published on PR #{pr}: {approve/request-changes/comment}"

---

## Operation Sync (rebase on base branch)

> Triggered by `/team-ship sync`. Rebases current branch on latest base branch.

### S1: Verify on mission branch

```bash
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh current)
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
```

If on `$BASE_BRANCH` → "Already on $BASE_BRANCH. Nothing to sync." → **STOP**

### S2: Fetch and rebase

```bash
bash ~/.claude/commands/scripts/tw-git.sh rebase "$BASE_BRANCH"
```

- If exit 0 → "Branch `{branch}` rebased on latest $BASE_BRANCH."
- If exit 2 → "Rebase conflicts detected. Resolve them, then `git rebase --continue`." → **STOP** (do not abort automatically)

---

## Operation Done Help

> Triggered by `/team-ship done help`.

Output the following and **STOP**:

```
/team-ship done — Post-Merge Cleanup
═══════════════════════════════════════════

USAGE:
  /team-ship done           Auto-detect Issue from Contract/branch
  /team-ship done #42       Specify Issue number explicitly

WHAT IT DOES:
  1. Verify PR is merged (fails if PR still open)
  2. Close Issue (if not auto-closed by "Closes #N")
  3. Update labels: status:review → status:done
  4. Clean up worktree (if in worktree mode)
  5. Return to base branch
  6. Remove local Contract

WHEN TO USE:
  After your PR has been merged on GitHub.
  Usually the last step: /team-drive → /team-ship → (merge) → /team-ship done

TROUBLESHOOTING:
  "No merged PR found" → PR must be merged first. Check GitHub.
  "Cannot determine Issue" → Specify explicitly: /team-ship done #42
```

---

## Operation Review Help

> Triggered by `/team-ship review help`.

Output the following and **STOP**:

```
/team-ship review — AI Code Review
═══════════════════════════════════════════

USAGE:
  /team-ship review         Review PR for current branch
  /team-ship review #43     Review specific PR number

WHAT IT DOES:
  1. Find open PR for current branch
  2. Fetch full diff
  3. Read all changed files for context
  4. AI review: correctness, security, architecture, quality, performance
  5. Choose action: approve / request changes / comment only
  6. Publish review to GitHub

WHEN TO USE:
  Before merging a PR, or when a teammate asks for review.
```

---

## Operation Sync Help

> Triggered by `/team-ship sync help`.

Output the following and **STOP**:

```
/team-ship sync — Rebase on Base Branch
═══════════════════════════════════════════

USAGE:
  /team-ship sync           Rebase current branch on latest base

WHAT IT DOES:
  1. Verify you're on a mission branch (not base)
  2. Fetch latest base branch from remote
  3. Rebase your branch on top of latest base

WHEN TO USE:
  When /team doctor shows your branch is behind base or remote.
  Before /team-ship if branch has drifted.

TROUBLESHOOTING:
  "Rebase conflicts" → Resolve conflicts, then: git rebase --continue
  Already on base branch → Nothing to sync.
```

---

## Error Handling

- Config missing → "Run `/team` first to initialize teamwork." → **STOP**
- No active Contract → "No mission to ship. Run `/team-claim` first." → **STOP**
- Incomplete sub-tasks → warn with list of remaining tasks → **STOP**
- Tests fail → "Fix tests before shipping." → **STOP**
- Push fails → suggest rebase (`/team-ship sync`), if still fails → **STOP**
- PR creation fails → "Failed to create PR. Check `gh auth status` and try again." → **STOP**
- CI fails → warn but DO NOT stop (PR is already created, user can iterate)
- Label/reviewer operations fail → warn but continue (non-fatal)
- Contract removal fails → warn but continue (non-fatal)
