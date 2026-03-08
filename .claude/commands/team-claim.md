---
description: "Claim Issue → Contract → Branch. Try: /team-claim help"
version: "3.2.1"
---

# /team-claim — Claim Issue → Contract → Branch

> Claim a GitHub Issue, generate an AI-optimized Mission Contract, and create your working branch.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `#42` or `42` | Claim specific assigned Issue |
| `list` | Browse MY assigned mission Issues |
| `help` or `-h` | Show usage guide |
| (empty) | Show my assigned Issues and pick one |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/team-claim — Claim an assigned GitHub Issue as your mission

USAGE:
  /team-claim           Show your assigned Issues and pick one
  /team-claim #42       Claim specific assigned Issue
  /team-claim list      Browse your assigned missions

WHAT HAPPENS:
  1. Fetches Issue from GitHub
  2. Generates AI-enriched Mission Contract (.teamwork/active/MISSION-N.md)
     — scans project to discover relevant files (Context Files)
  3. Creates branch: mission/{issue}-{slug}-{user}
  4. Posts claim comment on GitHub

NOTE: Issues are assigned via /team-issue (any team member can create and assign).

NEXT: /team-drive to start executing
```

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

- If no config → "Teamwork not initialized. Run `/team` first." → **STOP**

Read `$TEAMWORK_DIR/config.yml` → extract team roster, conventions, project settings.

```bash
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
# Now MISSION_LABEL, STATUS_PREFIX, PRIORITY_PREFIX are set
```

Verify `GH_USER` is in the team roster (check both `team:` and `members:` sections).
If not → "You ({GH_USER}) are not in the team roster. Run `/team init` to re-initialize and add yourself." → **STOP**

---

## Step 1: Check Active Mission

```bash
ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null
```

**Check worktree config:**
```bash
# Read worktree setting: if worktree: section exists → enabled (unless worktree.enabled is explicitly false)
WORKTREE_ENABLED=$(bash ~/.claude/commands/scripts/tw-config.sh worktree.enabled "" 2>/dev/null)
if [ -z "$WORKTREE_ENABLED" ]; then
  # Check if worktree: section exists at all (presence = enabled)
  grep -q "^worktree:" $TEAMWORK_DIR/config.yml 2>/dev/null && WORKTREE_ENABLED="true" || WORKTREE_ENABLED="false"
fi
```

**If worktree DISABLED (default):** If any Contract exists → read it, display the active mission info.
- "You already have an active mission: #{issue} — {title}. Complete it with `/team-ship` first. To abandon: `rm $TEAMWORK_DIR/active/MISSION-{issue}.md` (you can re-claim the Issue later with `/team-claim`)."
- **STOP** (enforce one-at-a-time rule)

**If worktree ENABLED:** Allow multiple active Contracts. Each mission gets its own worktree directory, so parallel work is safe.
- If any Contract exists → display it as info: "Active mission(s): #{issue} — {title}. Worktree mode: parallel claiming allowed."
- Continue to Step 2 (do NOT stop).

---

## Step 2: Route by Argument

### If `list`:

```bash
gh issue list --label "$MISSION_LABEL" --state open --assignee "$GH_USER" --json number,title,labels,milestone --limit 20
```

Show Issues assigned to the current user.

Format as numbered list:
```
Your assigned missions:
  🟠 1. #42 Add user authentication
  🟠 2. #45 Add rate limiting
  🟡 3. #47 Write API docs
```

If none → "No missions assigned to you. Ask your team lead to assign one via `/team-issue`." → **STOP**

Use `AskUserQuestion` to let user pick one, then proceed to Step 3 with the selected Issue number.

### If `#N` or number:

Extract Issue number. Proceed to Step 3.

### If empty:

```bash
gh issue list --label "$MISSION_LABEL" --state open --assignee "$GH_USER" --json number,title,labels --limit 10
```

Show the user's assigned Issues sorted by priority (P0 first, then P1, P2, P3).
If none → "No missions assigned to you. Ask your team lead to assign one via `/team-issue`." → **STOP**

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

## Acceptance Criteria
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

Read worktree config: if `worktree:` section exists in config → treat as enabled (unless `worktree.enabled` is explicitly `false`). If no `worktree:` section → disabled.

Ensure you're on `base_branch` and up to date before creating the feature branch:
```bash
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
```

Generate branch name and create branch:
```bash
# Slugify the title: lowercase, replace spaces with hyphens, remove special chars, truncate
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$ISSUE_TITLE")

# Create branch from config pattern (handles pattern substitution + existing branch detection)
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
```

**If worktree enabled:**
```bash
REPO_NAME=$(basename $(pwd))
WORKTREE_PATH="../${REPO_NAME}-wt-${SLUG}"
bash ~/.claude/commands/scripts/tw-git.sh worktree-add "$BRANCH" "$WORKTREE_PATH"
echo "{issue}" > "$WORKTREE_PATH/.mission"

# Contract is gitignored (active/), so copy it into the worktree
mkdir -p "$WORKTREE_PATH/$TEAMWORK_DIR/active"
cp "$TEAMWORK_DIR/active/MISSION-$ISSUE_NUMBER.md" "$WORKTREE_PATH/$TEAMWORK_DIR/active/"
```

**If worktree disabled (default):**
Branch already created/switched by `tw-git.sh create-branch` above.

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

```
📋 CLAIMED ── #{issue} {title} ─────────────
{priority_dot}  {priority}  Branch: {branch}
Contract:  $TEAMWORK_DIR/active/MISSION-{issue}.md
{If worktree:} Worktree:  {path}

🎯 OBJECTIVE
  {objective summary}

📋 SUB-TASKS
  [ ] {task 1}
  [ ] {task 2}
  [ ] ...

✅ ACCEPTANCE CRITERIA
  {criteria}

📁 CONTEXT FILES
  {list of relevant files}

────────────────────────────────────────────
/team-drive to execute │ /team-ship when done
```

---

## Error Handling

- Issue not found → "Issue #{issue} not found. Check the number." → **STOP**
- Issue already assigned to someone else → warn but allow claiming (team member may be handing off)
- Issue is closed → "Issue #{issue} is already closed." → **STOP**
- Branch already exists:
  - Check if corresponding Issue is still OPEN (via `gh issue view {issue} --json state --jq '.state'`)
  - If Issue is CLOSED → warn: "⚠ Branch exists but Issue #{issue} is closed. This is an orphan branch. Run `/team doctor fix` to clean up, then `/team-claim` again." → **STOP**
  - If Issue is OPEN → "Branch {name} already exists. Switching to it." → `git checkout {branch}`
- Network errors → "GitHub API error. Check your connection and `gh auth status`." → **STOP**
