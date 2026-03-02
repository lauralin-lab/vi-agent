---
description: "Claim a GitHub Issue as your mission. Generates AI execution contract, creates branch, assigns you."
---

# /team-claim — Claim Issue → Contract → Branch

> Claim a GitHub Issue, generate an AI-optimized Mission Contract, and create your working branch.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `#42` or `42` | Claim specific Issue |
| `list` | Browse available mission Issues |
| `create "title"` | Create new Issue from mission template |
| (empty) | Auto-select next unassigned Issue by priority (P0 > P1 > P2 > P3) |

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

Read `$TEAMWORK_DIR/config.yml` → extract team roster, conventions, project settings.

```bash
# Read mission label from config (teamspace uses mc_label, teamwork v2 defaults to "mission")
MISSION_LABEL=$(grep 'mc_label:' $TEAMWORK_DIR/config.yml | sed 's/.*mc_label: *//' | sed 's/ *#.*//' | tr -d '"' || echo "mission")
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"
```

Verify `GH_USER` is in the team roster. If not → "You ({GH_USER}) are not in the team roster. Add yourself to `$TEAMWORK_DIR/config.yml` first." → **STOP**

---

## Step 1: Check Active Mission

```bash
ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null
```

If any Contract exists → read it, display the active mission info.
- "You already have an active mission: #{issue} — {title}. Complete it with `/team-ship` first, or remove `$TEAMWORK_DIR/active/MISSION-{N}.md` to abandon."
- **STOP** (enforce one-at-a-time rule)

---

## Step 2: Route by Argument

### If `list`:

```bash
gh issue list --label "$MISSION_LABEL" --state open --json number,title,labels,assignees,milestone --limit 20
```

Filter to show:
- **Unassigned** Issues (available to claim)
- **Assigned to you** but not yet in-progress

Format as numbered list:
```
Available missions:
  1. #42 Add user authentication [P1] — unassigned
  2. #45 Add rate limiting [P1] — unassigned
  3. #47 Write API docs [P2] — unassigned
```

Use `AskUserQuestion` to let user pick one, then proceed to Step 3 with the selected Issue number.

### If `create "title"`:

```bash
gh issue create --title "{title}" --label "$MISSION_LABEL" --template mission.yml
```

If the Issue template prompts are not filled, open the browser:
```bash
gh issue create --title "{title}" --label "$MISSION_LABEL" --web
```

Output the created Issue number and suggest: "Issue created. Run `/team-claim #{N}` to claim it."
→ **STOP** (user should fill in the Issue body via GitHub, then claim)

### If `#N` or number:

Extract Issue number. Proceed to Step 3.

### If empty:

```bash
gh issue list --label "$MISSION_LABEL" --state open --assignee "" --json number,title,labels --limit 10
```

Sort by priority (P0 first, then P1, P2, P3). Pick the first one.
If no unassigned Issues → "No available missions. Create one with `/team-claim create \"title\"`." → **STOP**

Proceed to Step 3 with the auto-selected Issue number.

---

## Step 3: Fetch Issue Details

```bash
gh issue view {ISSUE_NUMBER} --json number,title,body,labels,milestone,assignees,url
```

Parse the Issue body. If the Issue was created with the mission template, extract structured fields:
- **Priority** from labels (P0/P1/P2/P3)
- **Objective** from body
- **Sub-tasks** from body (checkboxes)
- **Acceptance Criteria** from body
- **Context** from body
- **Test Command** from body

If the Issue body is freeform (not from template), use AI understanding to extract:
- Objective: summarize what needs to be done
- Sub-tasks: break down into checkable items
- Acceptance criteria: infer from the description

---

## Step 4: Generate Mission Contract

Create `$TEAMWORK_DIR/active/MISSION-{N}.md` with this structure:

```markdown
---
issue: {ISSUE_NUMBER}
url: {ISSUE_URL}
title: "{ISSUE_TITLE}"
assignee: {GH_USER}
priority: {PRIORITY}
labels: [{labels}]
branch: mission/{ISSUE_NUMBER}-{SLUG}-{GH_USER}
milestone: "{MILESTONE or none}"
version: "{VERSION from config, or omit if not configured}"
claimed: {ISO_TIMESTAMP}
---

# MISSION-{N}: {ISSUE_TITLE}

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

Read branch pattern from config: `conventions.branch_pattern`
Read `worktree.enabled` from config (default: false).

Generate branch name:
```bash
# Slugify the title: lowercase, replace spaces with hyphens, remove special chars, truncate
SLUG=$(echo "{ISSUE_TITLE}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
BRANCH="mission/{ISSUE_NUMBER}-${SLUG}-${GH_USER}"
```

**If worktree enabled:**
```bash
REPO_NAME=$(basename $(pwd))
WORKTREE_PATH="../${REPO_NAME}-wt-${SLUG}"
git worktree add -b "$BRANCH" "$WORKTREE_PATH"
echo "{ISSUE_NUMBER}" > "$WORKTREE_PATH/.mission"
```

**If worktree disabled (default):**
```bash
git checkout -b "$BRANCH"
```

---

## Step 6: Assign Issue on GitHub

```bash
gh issue edit {ISSUE_NUMBER} --add-assignee "$GH_USER" --remove-label "status:queued" --add-label "status:wip"
```

If assignee add fails (permissions), warn but continue — the local Contract is the source of truth for the claim.

### 6b: Post claim comment

```bash
gh issue comment {ISSUE_NUMBER} --body "🚀 Claimed by @${GH_USER} — starting work on branch \`${BRANCH}\`"
```

Non-fatal: if comment fails, warn but continue.

---

## Step 7: Output Mission Briefing

Display a formatted briefing:

```
MISSION CLAIMED
═══════════════════════════════════════
Issue:    #{N} — {title}
Priority: {P1}
Branch:   {branch name}
Contract: $TEAMWORK_DIR/active/MISSION-{N}.md
{If worktree:} Worktree: {worktree path}
{If worktree:} Hint: cd {worktree path} to work in isolation

Objective:
  {objective summary}

Sub-tasks:
  - [ ] {task 1}
  - [ ] {task 2}
  - [ ] ...

Acceptance Criteria:
  {criteria}

Context Files:
  {list of relevant files}
═══════════════════════════════════════
Next: /team-drive to start execution
      /team-ship when complete
```

---

## Error Handling

- Issue not found → "Issue #{N} not found. Check the number." → **STOP**
- Issue already assigned to someone else → warn but allow claiming (team member may be handing off)
- Issue is closed → "Issue #{N} is already closed." → **STOP**
- Branch already exists → "Branch {name} already exists. Switching to it." → `git checkout {branch}`
- Network errors → "GitHub API error. Check your connection and `gh auth status`." → **STOP**
