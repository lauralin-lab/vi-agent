---
description: "Claim Issue → Contract → Branch. Try: /team-claim help"
version: "3.8.3"
---

# /team-claim — Claim Issue → Contract → Branch

> Claim a GitHub Issue, generate an AI-optimized Mission Contract, and create your working branch.

**Visual Encoding** (apply to ALL output — see `docs/visual-encoding-standard.md`):
`**bold**` → headers/labels (white) · `` `backtick` `` → commands/paths/counts (purple-blue) · `*italic*` → branches (dim) · `**#NNN**` → issues (light-blue clickable, 3+ digits) · `────` dividers · ⛔ NO code blocks around output

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `#42` or `42` | Claim specific assigned Issue |
| `list` | Browse MY assigned mission Issues |
| `help` or `-h` | Show usage guide |
| (empty) | Show my assigned Issues and pick one |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

**`/team-claim`** — Claim an assigned GitHub Issue as your mission

**USAGE**
  `/team-claim`           Show your assigned Issues and pick one
  `/team-claim #42`       Claim specific assigned Issue
  `/team-claim list`      Browse your assigned missions

**WHAT HAPPENS**
  `1.` Fetches Issue from GitHub
  `2.` Generates AI-enriched Mission Contract (`.teamwork/active/MISSION-N.md`)
     — scans project to discover relevant files (Context Files)
  `3.` Creates branch: *mission/{issue}-{slug}-{user}*
  `4.` Posts claim comment on GitHub

NOTE: Issues are assigned via `/team-issue` (any team member can create and assign).

NEXT: `/team-drive` to start executing

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
# Config (support both directory names)
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

- If no config → "**ERROR:** Teamwork not initialized. Run `/team` first." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

Read `$TEAMWORK_DIR/config.yml` → extract team roster, conventions, project settings.

```bash
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
# Now MISSION_LABEL, STATUS_PREFIX, PRIORITY_PREFIX are set
```

Verify `GH_USER` is in the team roster (check both `team:` and `members:` sections).
If not → "**ERROR:** You (`{GH_USER}`) are not in the team roster. Run `/team init` to re-initialize and add yourself." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

---

## Step 1: Check Active Mission

```bash
ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null
```

**Check worktree config (local per-user setting):**
```bash
# Worktree mode is stored in local git config, not shared config.yml
WORKTREE_ENABLED=$(git config --local teamwork.worktree 2>/dev/null || echo "false")
```

**If worktree DISABLED (default):** If any Contract exists → read it, display the active mission info, then offer options:

Use `AskUserQuestion`:
```
question: "已有活跃 mission: **#{issue}** — {title}。如何处理？"
options:
  - label: "继续当前 mission"
    description: "运行 /team-drive 继续执行"
  - label: "交付当前 mission"
    description: "运行 /team-ship 提交 PR"
  - label: "放弃当前 mission"
    description: "清理 Contract，释放 claim 位（代码保留在分支上）"
  - label: "取消"
    description: "不操作"
```

- If "继续当前 mission" → output "Run `/team-drive`" → **STOP**
- If "交付当前 mission" → output "Run `/team-ship`" → **STOP**
- If "放弃当前 mission" → delete Contract file → output "Contract cleared. You can now `/team-claim` a new Issue." → **STOP**
- If "取消" → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

**If worktree ENABLED:** Allow multiple active Contracts. Each mission gets its own worktree directory, so parallel work is safe.
- If any Contract exists → display it as info: "Active mission(s): **#{issue}** — {title}. Worktree mode: parallel claiming allowed."
- Continue to Step 2 (do NOT stop).

---

## Step 2: Route by Argument

### If `list`:

```bash
gh issue list --label "$MISSION_LABEL" --state open --assignee "$GH_USER" --json number,title,labels,milestone --limit 20
```

Show Issues assigned to the current user.

Format as numbered list:

**Your assigned missions:**
  🟠 `1.` **#042** Add user authentication
  🟠 `2.` **#045** Add rate limiting
  🟡 `3.` **#047** Write API docs

If none → "No missions assigned to you. Ask your team lead to assign one via `/team-issue`." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

Use `AskUserQuestion` to let user pick one, then proceed to Step 3 with the selected Issue number.

### If `#N` or number:

Extract Issue number. Proceed to Step 3.

### If empty:

```bash
gh issue list --label "$MISSION_LABEL" --state open --assignee "$GH_USER" --json number,title,labels --limit 10
```

Show the user's assigned Issues sorted by priority (P0 first, then P1, P2, P3).
If none → "No missions assigned to you. Ask your team lead to assign one via `/team-issue`." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

Use `AskUserQuestion` to let user confirm or pick one (even if only one issue — always confirm before claiming). Then proceed to Step 3.

---

## Step 3: Fetch Issue Details

```bash
gh issue view {issue} --json number,title,body,labels,milestone,assignees,url
```

Parse the Issue body. If the Issue was created with the mission template, extract structured fields:
- **Priority** from labels (P0/P1/P2/P3)
- **Objective** from `### Objective` section
- **Sub-tasks** from `### Sub-tasks` section (checkboxes)
- **Success Criteria** from `### Success Criteria` section (also accept `### Acceptance Criteria` for backward compat)
- **Context** from `### Context & References` section (also accept `### Context`)
- **Test Command** from `### Verification Method` section or config `project.test_command`

Also extract from the JSON response:
- **Milestone** — read from `milestone.title` field

```bash
# ISSUE_DATA is the full JSON from `gh issue view ... --json ...` above
ISSUE_MILESTONE=$(echo "$ISSUE_DATA" | jq -r '.milestone.title // empty' 2>/dev/null)
# Fall back to config versions.current if Issue has no milestone
if [ -z "$ISSUE_MILESTONE" ]; then
  ISSUE_MILESTONE=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
fi
```

If the Issue body is freeform (not from template), use AI understanding to extract:
- Objective: summarize what needs to be done
- Sub-tasks: break down into checkable items
- Success criteria: infer from the description

---

## Step 4: Generate Mission Contract

Create `$TEAMWORK_DIR/active/MISSION-{issue}.md` with this structure:

```markdown
---
issue: {issue}
url: {url}
title: "{title}"
assignee: {user}
priority: {priority}
labels: [{labels}]
branch: mission/{issue}-{slug}-{user}
milestone: "{milestone — from Issue JSON, falls back to config versions.current, or 'none'}"
claimed: {ISO_TIMESTAMP}
issue_content_hash: "$(bash ~/.claude/commands/scripts/tw-contract.sh hash "$TITLE" "$BODY")"
---

# MISSION-{issue}: {title}

## Objective
{Extracted from Issue body}

## Sub-tasks
{Extracted checkboxes from Issue body, or AI-generated breakdown}

**MANUAL task pre-tagging:** While extracting sub-tasks, identify any that require human action outside the codebase (server access, console operations, third-party configuration, deployment verification). Prepend `🔧 MANUAL:` to these tasks. This enables `/team-drive` to skip them during execution and surface them in the Manual Ops Handoff.

Example:
- [ ] Implement API authentication
- [ ] 🔧 MANUAL: Configure Firebase Console authorized domains
- [ ] 🔧 MANUAL: Deploy SA JSON to production server

## Success Criteria
{Extracted from Issue body, or AI-inferred}

## Context Files
{AI-generated: scan the project structure and list files relevant to this mission}
{Use Glob and Grep to find related code}

## Test Command
{From Issue body, or from config.yml project.test_command}

## AI Notes
(populated during /team-drive execution)
```

**The Context Files section is the key AI enhancement.** This is what makes the Contract more valuable than the raw Issue body. Scan the project to identify:
- Files that will likely need modification
- Related test files
- Configuration files that might be affected
- Documentation that should be updated

Use `Glob` and `Grep` with keywords from the Issue title and objective to discover relevant files.

---

## Step 5: Create Branch (+ optional worktree)

Read branch pattern from config: `conventions.branch_pattern` (or `worktree.branch_pattern` for `.teamspace` configs).
Default: `"mission/{issue}-{slug}-{user}"`.

Read worktree config from local git config: `git config --local teamwork.worktree` (per-user, not shared).

```bash
# Slugify the title: lowercase, replace spaces with hyphens, remove special chars, truncate
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$ISSUE_TITLE")
```

**If worktree DISABLED (default):**

Ensure you're on `base_branch` and up to date, then create branch:
```bash
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
```

**If worktree ENABLED:**

⚠ Do NOT run `ensure-base` — it would `git checkout` the base branch, disrupting the current worktree's working state. Instead, create the worktree directly from the base branch ref:

```bash
# Derive main repo path (works from any worktree or the main repo)
MAIN_REPO=$(bash ~/.claude/commands/scripts/tw-git.sh worktree-main-repo)
REPO_NAME=$(basename "$MAIN_REPO")

# Fetch latest base to ensure worktree starts from up-to-date base
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
git fetch origin "$BASE_BRANCH" --quiet 2>/dev/null || true

# Build branch name from config pattern (script handles pattern substitution safely)
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh build-branch-name "$ISSUE_NUMBER" "$SLUG" "$GH_USER")

# Determine worktree root path from per-user config
WORKTREE_ROOT=$(git config --local teamwork.worktree-root 2>/dev/null || echo "")

if [ -n "$WORKTREE_ROOT" ]; then
  # Resolve relative paths (e.g. ".claude/worktrees/") against main repo root
  if [[ "$WORKTREE_ROOT" != /* ]]; then
    WORKTREE_ROOT="${MAIN_REPO}/${WORKTREE_ROOT}"
  fi
  mkdir -p "$WORKTREE_ROOT"
  WORKTREE_PATH="${WORKTREE_ROOT}/${SLUG}"
else
  # Default: sibling of main repo (backward compat)
  WORKTREE_PATH="${MAIN_REPO}/../${REPO_NAME}-wt-${SLUG}"
fi

# Check if branch is already checked out somewhere (main repo or another worktree)
BRANCH_WORKTREE=$(bash ~/.claude/commands/scripts/tw-git.sh worktree-find-by-branch "$BRANCH" 2>/dev/null) || true

if [ -n "$BRANCH_WORKTREE" ]; then
  # Branch already checked out — DON'T create new worktree, just point user there
  echo "BRANCH_ALREADY_CHECKED_OUT:$BRANCH_WORKTREE"
  # STOP — output will tell user to cd to existing worktree
  # 💡 Something wrong? Run /team doctor to diagnose, or /team doctor fix to auto-repair.
else
  git worktree add -b "$BRANCH" "$WORKTREE_PATH" "origin/$BASE_BRANCH" 2>/dev/null || {
    # Branch may already exist but not checked out — try without -b
    git worktree add "$WORKTREE_PATH" "$BRANCH" 2>/dev/null || {
      echo "ERROR: Could not create worktree at $WORKTREE_PATH"
      echo "Possible causes:"
      echo "  - Path already exists (another worktree or directory)"
      echo "  - Permission denied on parent directory"
      echo "  - Branch already checked out in another worktree"
      # 💡 Something wrong? Run /team doctor to diagnose, or /team doctor fix to auto-repair.
      exit 1
    }
  }
fi

echo "$ISSUE_NUMBER" > "$WORKTREE_PATH/.mission"

# Contract is gitignored (active/), so copy it into the worktree
mkdir -p "$WORKTREE_PATH/$TEAMWORK_DIR/active" || {
  echo "ERROR: Cannot create config directory in worktree. Check permissions."
  # 💡 Something wrong? Run /team doctor to diagnose, or /team doctor fix to auto-repair.
  exit 1
}
cp "$TEAMWORK_DIR/active/MISSION-$ISSUE_NUMBER.md" "$WORKTREE_PATH/$TEAMWORK_DIR/active/" || {
  echo "ERROR: Failed to copy Contract to worktree. Source: $TEAMWORK_DIR/active/MISSION-$ISSUE_NUMBER.md"
  # 💡 Something wrong? Run /team doctor to diagnose, or /team doctor fix to auto-repair.
  exit 1
}

# Copy config into worktree (needed for /team-drive and /team-ship to find config)
cp "$TEAMWORK_DIR/config.yml" "$WORKTREE_PATH/$TEAMWORK_DIR/" || {
  echo "ERROR: Failed to copy config.yml to worktree."
  # 💡 Something wrong? Run /team doctor to diagnose, or /team doctor fix to auto-repair.
  exit 1
}
```

Key differences from non-worktree flow:
1. **No `ensure-base`** — avoids disrupting current worktree
2. **`git fetch` instead of `git pull`** — updates remote ref without touching working tree
3. **`git worktree add -b BRANCH PATH origin/BASE`** — creates branch from latest remote base directly
4. **Path from `teamwork.worktree-root`** — user configures root via `/team init`. If set, worktrees go under `{root}/{slug}`. If unset, falls back to sibling: `../{repo}-wt-{slug}`

---

## Step 6: Post Claim Comment

In the push model, Issues are already assigned and labeled `status:wip` during `/team-issue` creation. No assignment or label transition needed here.

```bash
gh issue comment {issue} --body "🚀 Claimed by @${GH_USER} — starting work on branch \`${BRANCH}\`"
```

Non-fatal: if comment fails, warn but continue.

---

## Step 7: Output Mission Briefing

Display a formatted briefing:

**CLAIMED** ──── **#{issue}** {title} ────────────
{priority_dot}  `{priority}`  Branch: *{branch}*
Contract:  `$TEAMWORK_DIR/active/MISSION-{issue}.md`
{If worktree:} Worktree:  `{path}`

**OBJECTIVE**
  {objective summary}

**SUB-TASKS**
  [ ] {task 1}
  [ ] {task 2}
  [ ] ...

**SUCCESS CRITERIA**
  {criteria}

**CONTEXT FILES**
  {list of relevant files}

{If worktree (newly created OR branch already had worktree):}
⚠️ **DO NOT run `/team-drive` in this terminal**
────────────────────────────────────────────
当前终端在主仓库。Worktree 模式下，所有操作必须在 worktree 目录中执行。
在这里运行 `/team-drive` 会操作错误的代码。

**打开新终端 tab，执行：**
  `cd {worktree_path} && claude`
  Then: `/team-drive` to execute │ `/team-ship` when done
────────────────────────────────────────────

{If branch was already checked out in main repo (BRANCH_ALREADY_CHECKED_OUT):}
⚠️ Branch *{branch}* 已在主仓库 checkout。Worktree 模式下不应在主仓库操作 mission 分支。
建议：在主仓库切回 base branch，然后为此 mission 创建 worktree：
  `git checkout {base_branch}`
  `/team-claim #{issue}` (重新 claim，会自动创建 worktree)
────────────────────────────────────────────

💡 Tip: {random tip — read `~/.claude/commands/scripts/tw-tips.txt`, pick one non-comment line at random}

{If not worktree:}
────────────────────────────────────────────
`/team-drive` to execute │ `/team-ship` when done

💡 Tip: {random tip — read `~/.claude/commands/scripts/tw-tips.txt`, pick one non-comment line at random}

---

## Error Handling

- Issue not found → "**ERROR:** Issue **#{issue}** not found. Check the number." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.
- Issue already assigned to someone else → warn but allow claiming (team member may be handing off)
- Issue is closed → "**ERROR:** Issue **#{issue}** is already closed." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.
- Branch already exists:
  - Check if corresponding Issue is still OPEN (via `gh issue view {issue} --json state --jq '.state'`)
  - If Issue is CLOSED → warn: "⚠ Branch exists but Issue **#{issue}** is closed. This is an orphan branch. Run `/team doctor fix` to clean up, then `/team-claim` again." → **STOP**
    💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.
  - If Issue is OPEN:
    - **If worktree DISABLED** → "Branch *{name}* already exists. Switching to it." → `git checkout {branch}`
    - **If worktree ENABLED** → Check if branch is already checked out in a worktree (`git worktree list`):
      - If branch has a worktree → find the worktree path, output:
        ⚠️ Branch *{name}* already has a worktree at `{worktree_path}`.
        **打开新终端 tab，执行：** `cd {worktree_path} && claude`
        Then: `/team-drive` to execute │ `/team-ship` when done
        → **STOP** (do NOT checkout in main repo — it would conflict with the worktree)
      - If branch exists but NO worktree → create worktree for it:
        `git worktree add "$WORKTREE_PATH" "$BRANCH"` (without `-b`, branch already exists)
        Then copy Contract + config into worktree (same as Step 5 worktree flow)
- Network errors → "**ERROR:** GitHub API error. Check your connection and `gh auth status`." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

**On any STOP:** Always append: 💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.
