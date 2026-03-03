---
name: team-ship
description: Ship mission → PR. Try: /team-ship help
---

# /team-ship — Deliver Mission

> Push your branch, create a PR that auto-closes the Issue, optionally watch CI, and clean up the local Contract.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Full ship flow (push, PR, CI, cleanup) |
| `done` | Post-merge cleanup (close Issue, update labels, clean worktree) |
| `review` | AI code review on current PR |
| `sync` | Rebase current branch on main |
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
  /team-ship sync       Rebase current branch on latest main

SHIP FLOW:
  1. Pre-flight: verify branch, sub-tasks done, tests pass
  2. Push branch to GitHub
  3. Create PR with "Closes #N" (auto-closes Issue on merge)
  4. Watch CI (if configured)
  5. Request review (if configured)
  6. Clean up local Contract, label Issue status:review

AFTER MERGE:
  /team-ship done closes the Issue, labels status:done, returns to main.
```

- If `done` → jump to **Operation Done**
- If `review` → jump to **Operation Review**
- If `sync` → jump to **Operation Sync**
- If empty or anything else → continue to **Step 0: Full Ship Flow**

---

## Step 0: Prerequisites

```bash
# Identity
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
```

- If fails → "Not authenticated. Run `gh auth login` first." → **STOP**

```bash
# Config (support both directory names)
if [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
else
  echo "NO_CONFIG"
fi
```

- If no config → "Teamwork not initialized. Run `/team` first." → **STOP**

Read `$TEAMWORK_DIR/config.yml` → extract project settings, conventions, quality preferences.

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

Compare with Contract's `branch` field.
- If on wrong branch → `git checkout {contract.branch}`
- If branch doesn't exist → "Branch {branch} not found. Cannot ship." → **STOP**

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
  git add -A
  git commit -m "chore: pre-ship cleanup | Mission: #{issue}"
  ```

### 2d: Run tests

Read `test_command` from config:
```bash
# From config.yml project.test_command
{TEST_CMD}
```

- If tests fail → "Tests are failing. Fix them before shipping." → **STOP**
- If no test command configured → warn "No test command configured. Skipping pre-flight tests."

---

## Step 3: Push

```bash
git push -u origin {branch}
```

- If push fails due to upstream changes → suggest:
  ```bash
  git pull --rebase origin {branch}
  git push -u origin {branch}
  ```
- If push still fails → "Push failed. Resolve the issue manually." → **STOP**

---

## Step 4: Create PR

### 4a: Check for existing PR

```bash
gh pr list --head {branch} --json number,url --limit 1
```

If a PR already exists for this branch → skip PR creation, use existing PR. Display: "PR already exists: {url}"

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

Read `base_branch` from config conventions (default: `main`).

```bash
gh pr create \
  --title "{commit_type}: {contract.title}" \
  --body "{generated PR body}" \
  --base {base_branch} \
  --head {branch}
```

Determine commit type from the Contract title/objective:
- If title contains "fix", "bug", "patch" → `fix`
- If title contains "refactor", "restructure" → `refactor`
- Otherwise → `feat`

Capture the PR number and URL from the output.

### 4d: Post PR comment to Issue

```bash
gh issue comment {issue} --body "📦 PR #{pr-number} created — {pr-url}"
```

Non-fatal: if comment fails, warn but continue.

### 4e: Add labels

```bash
gh pr edit {pr-number} --add-label "status:review"
```

If this fails (label doesn't exist), warn but continue.

---

## Step 5: CI Check (if configured)

Read `quality.ci` from config.

If CI is enabled:
```bash
gh pr checks {pr-number} --watch --interval 10
```

- If CI passes → "CI passed ✅"
- If CI fails → "CI failed ❌. Check the PR for details: {pr-url}" (do NOT stop — the PR is already created, user can fix and push again)

If CI is not enabled → skip this step.

---

## Step 6: Request Review (if configured)

Read `quality.review_required` from config.

If review is required:
- Find the tech-lead from the team roster in config:
  ```bash
  # Extract tech-lead github username from config
  ```
- Request review:
  ```bash
  gh pr edit {pr-number} --add-reviewer {tech-lead-github}
  ```
- If reviewer assignment fails (permissions), warn but continue.

If review is not required → skip this step.

---

## Step 7: Cleanup

### 7a: Update Issue labels

```bash
gh issue edit {issue} --remove-label "status:wip" --add-label "status:review"
```

If label operations fail, warn but continue.

### 7b: Remove Contract

```bash
rm $TEAMWORK_DIR/active/MISSION-{issue}.md
```

The Contract has served its purpose. The PR body now contains the essential information. If the PR is rejected and the mission needs to be reworked, re-run `/team-claim #{issue}` to regenerate a fresh Contract.

---

## Step 8: Output Delivery Summary

```
MISSION SHIPPED
═══════════════════════════════════════
Issue:  #{issue} — {title}
Branch: {branch}
PR:     {pr-url}
CI:     {passing/failing/not configured}
Review: {requested from {reviewer} / not required}

Sub-tasks delivered:
  [x] {task 1}
  [x] {task 2}
  ...

Contract: cleaned up ✅
Issue:    labeled "status:review" ✅
═══════════════════════════════════════
Next steps:
  - After merge: /team-ship done (close Issue, update labels, clean worktree)
  - To AI-review PR: /team-ship review
  - To claim next mission: /team-claim
  - To see team status: /team
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
BRANCH=$(git branch --show-current)
gh pr list --head "$BRANCH" --state merged --json number,url --limit 1
```

- If no merged PR found → "No merged PR found for branch `{branch}`. PR must be merged before running `done`." → **STOP**

### D3: Close Issue

```bash
gh issue view {ISSUE_NUMBER} --json state --jq '.state'
```

If Issue is still open:
```bash
gh issue close {ISSUE_NUMBER} --reason completed
```

### D4: Update labels

```bash
gh issue edit {ISSUE_NUMBER} --remove-label "status:review" --remove-label "status:wip" --add-label "status:done"
```

### D5: Clean up worktree (if applicable)

If `.mission` file exists (worktree mode):
- Ask user: "Remove worktree at `{worktree_path}`?" via `AskUserQuestion`
- If yes:
  ```bash
  WORKTREE_PATH=$(pwd)
  cd {original_repo_path}
  git worktree remove "$WORKTREE_PATH"
  ```
- If no: keep worktree, warn "Worktree kept. Remove manually with `git worktree remove {path}`."

### D6: Return to main

```bash
git checkout main && git pull
```

### D7: Clean up Contract

```bash
rm -f $TEAMWORK_DIR/active/MISSION-{issue}.md
```

### D8: Output summary

```
MISSION DONE ✅
═══════════════════════════════════════
Issue:     #{issue} — {title} (closed)
PR:        {pr-url} (merged)
Labels:    status:done
Worktree:  {removed/kept/not applicable}
Branch:    returned to main
═══════════════════════════════════════
Next: /team-claim to pick up next mission
      /team to see dashboard
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
gh pr diff {PR_NUMBER}
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
gh pr review {PR_NUMBER} --body "{review_body}" {--approve|--request-changes|--comment}
```

Output: "Review published on PR #{PR_NUMBER}: {approve/request-changes/comment}"

---

## Operation Sync (rebase on main)

> Triggered by `/team-ship sync`. Rebases current branch on latest main.

### S1: Verify on mission branch

```bash
BRANCH=$(git branch --show-current)
```

If on `main` → "Already on main. Nothing to sync." → **STOP**

### S2: Fetch and rebase

```bash
git fetch origin main
git rebase origin/main
```

- If rebase succeeds → "Branch `{branch}` rebased on latest main."
- If rebase conflicts → "Rebase conflicts detected. Resolve them, then `git rebase --continue`." → **STOP** (do not abort automatically)

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
