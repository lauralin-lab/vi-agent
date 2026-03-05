---
description: "Submit completed MC -> PR -> notify leader. Try: /complete-mc help"
version: "3.0.0"
---

# /complete-mc -- Submit Completed Mission Contract

> Member submits their completed MC: pre-flight checks, push, create PR, notify leader for review.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `#{N}` or `N` | Complete specific MC |
| (empty) | Auto-detect from branch or assigned MCs |
| `help` or `-h` | Show usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/complete-mc -- Submit a completed Mission Contract for review

USAGE:
  /complete-mc            Auto-detect MC from branch name or assigned MCs
  /complete-mc #42        Complete specific MC

WHAT HAPPENS:
  1. Verify ownership (you must be the assignee)
  2. Pre-flight: correct branch, tests pass, rebase on main
  3. Push branch to GitHub
  4. Create PR with "Closes #N" (auto-closes Issue on merge)
  5. Update Issue label: wip -> review
  6. Notify leader for review

AFTER REVIEW:
  Leader runs /review-mc to approve or request changes.

SEE ALSO:
  /get-mc       View your assigned MCs
  /review-mc    (Leader) Review submitted MCs
  /team         Team dashboard
```

---

## Step 0: Prerequisites

```bash
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
if [ -z "$GH_USER" ]; then
  echo "ERROR: Not authenticated. Run 'gh auth login' first."
  # STOP
fi
```

```bash
if [ ! -f .teamwork/config.yml ]; then
  echo "ERROR: No teamwork config. Run /team init first."
  # STOP
fi
```

Read config values:

```bash
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "mission" 2>/dev/null)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "status:" 2>/dev/null)
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
```

---

## Step 1: Detect MC

### If `#{N}` or number provided:

Extract Issue number from `$ARGUMENTS`. Proceed to Step 2.

### If empty -- auto-detect:

**Method 1: Branch name**

```bash
CURRENT_BRANCH=$(git branch --show-current)
```

If branch matches `mission/{N}-{slug}` pattern -> extract N.

**Method 2: Assigned open MCs**

```bash
gh issue list --assignee "$GH_USER" --label "$MISSION_LABEL" --state open \
  --json number,title,labels --limit 10
```

- If exactly 1 assigned MC -> use it
- If multiple -> use `AskUserQuestion` to let user pick:
  ```
  question: "Which MC are you completing?"
  options:
    - label: "#42 Fix camera permission"
    - label: "#45 Add rate limiting"
  ```
- If zero -> "No assigned MCs found. Nothing to complete." -> **STOP**

---

## Step 2: Verify Ownership

```bash
ISSUE_DATA=$(gh issue view {issue} --json number,title,body,assignees,labels,milestone,url)
```

Extract assignees from Issue. Check that `$GH_USER` is in the assignee list.

If not assigned to current user:
- "MC #{issue} is assigned to @{actual_assignee}, not you (@{GH_USER}). You can only complete your own MCs." -> **STOP**

Extract from Issue data:
- `ISSUE_TITLE` -- Issue title
- `ISSUE_BODY` -- Issue body (for Success Criteria, Sub-tasks, Objective)
- `ISSUE_URL` -- Issue URL
- `ISSUE_MILESTONE` -- Milestone title (if set)

---

## Step 3: Pre-flight Checks

### 3a: Verify on correct branch

```bash
CURRENT_BRANCH=$(git branch --show-current)
```

Determine expected branch: `mission/{issue}-{slug}`.

```bash
SLUG=$(echo "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
EXPECTED_BRANCH="mission/${ISSUE_NUMBER}-${SLUG}"
```

If not on expected branch, check if expected branch exists:

```bash
git checkout "$EXPECTED_BRANCH" 2>/dev/null || \
  git checkout -b "$EXPECTED_BRANCH" "origin/$EXPECTED_BRANCH" 2>/dev/null
```

If branch doesn't exist at all -> warn: "Branch '$EXPECTED_BRANCH' not found. Creating from current branch."

### 3b: Check sub-tasks in Issue body

Parse the Issue body for `- [ ]` checkboxes under Success Criteria and Sub-tasks sections.

Count checked `- [x]` vs unchecked `- [ ]`.

If unchecked sub-tasks remain:
- Display them as warnings
- **Do NOT block** -- warn only: "Note: {N} sub-tasks still unchecked. Proceeding anyway."

### 3c: Clean working tree

```bash
git status --porcelain
```

If uncommitted changes exist:
- "Uncommitted changes detected. Committing now."
  ```bash
  git add -A
  git commit -m "chore: pre-ship cleanup | Mission: #{issue}"
  ```

### 3d: Run tests

Read test commands from config for affected services:

```bash
# Read config to determine project services and test commands
cat .teamwork/config.yml
```

Parse `project.services` from config. For each service, check if files in the current branch diff touch that service directory. If so, run its `test_command`.

If no service-level config, try top-level:
```bash
TEST_CMD=$(bash ~/.claude/commands/scripts/tw-config.sh project.test_command "" 2>/dev/null)
```

If test command exists and is non-empty, run it. If tests fail:
- "Tests are failing. Fix them before submitting." -> **STOP**

If no test command configured:
- Warn: "No test_command configured -- skipping pre-flight tests."

### 3e: Rebase on base branch

```bash
git fetch origin "$BASE_BRANCH"
git rebase "origin/$BASE_BRANCH"
```

If rebase conflicts:
- "Rebase conflicts detected. Resolve them, then run `/complete-mc` again."
- Help the user resolve conflicts if possible.
- **STOP** until conflicts are resolved.

---

## Step 4: Push Branch

```bash
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH"
```

If push fails:
- "Push failed. Try `git pull --rebase` and resolve, then retry." -> **STOP**

---

## Step 5: Create PR

### 5a: Check for existing PR

```bash
EXISTING_PR=$(bash ~/.claude/commands/scripts/tw-pr.sh exists "$BRANCH" 2>/dev/null)
```

If PR already exists -> use existing PR number and URL. Skip PR creation.

### 5b: Generate PR body

Build PR body from Issue content:

```markdown
Closes #{issue}

## Objective
{extracted from Issue body}

## Changes
{AI summary of changes: scan git diff or commit messages on branch}

## Verification
{test results or test commands from config}
```

### 5c: Create the PR

```bash
# Determine commit type from title
COMMIT_TYPE=$(bash ~/.claude/commands/scripts/tw-pr.sh commit-type "$ISSUE_TITLE")

PR_RESULT=$(bash ~/.claude/commands/scripts/tw-pr.sh create \
  "$ISSUE_NUMBER" "${COMMIT_TYPE}(scope): ${ISSUE_TITLE}" "$PR_BODY" "$BASE_BRANCH" "$BRANCH")
PR_NUMBER=$(echo "$PR_RESULT" | cut -d' ' -f1)
PR_URL=$(echo "$PR_RESULT" | cut -d' ' -f2)
```

If PR creation fails:
- "Failed to create PR. Check `gh auth status`." -> **STOP**

---

## Step 6: Update Issue Labels

```bash
bash ~/.claude/commands/scripts/tw-label.sh transition {issue} wip review
```

Non-fatal: if label update fails, warn but continue.

---

## Step 7: Send Notification

```bash
bash ~/.claude/commands/scripts/tw-notify.sh mc.completed \
  --issue "$ISSUE_NUMBER" --title "$ISSUE_TITLE" \
  --assignee "$GH_USER" --pr "$PR_URL"
```

Non-fatal: if notification fails, warn but continue.

---

## Step 8: Output

```
MC SUBMITTED
=============================================
Issue:   #{N} -- {title}
PR:      {pr-url}
Tests:   {passing / skipped}
Status:  Awaiting Leader review

Leader notified via: {channels}
=============================================
Next: Leader runs /review-mc #{N} to review
      /team to see dashboard
```

---

## Error Handling

- No MC detected -> "Cannot detect MC. Provide Issue number: `/complete-mc #42`" -> **STOP**
- Not assignee -> "You can only complete MCs assigned to you." -> **STOP**
- Tests fail -> "Fix tests before submitting." -> **STOP**
- Rebase conflicts -> help resolve, **STOP** until clean
- Push fails -> suggest rebase, **STOP**
- PR creation fails -> "Check `gh auth status`" -> **STOP**
- Label/notification failures -> warn but continue (non-fatal)
