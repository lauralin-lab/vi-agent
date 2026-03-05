---
description: "View assigned Mission Contracts. Try: /get-mc help"
version: "3.0.0"
---

# /get-mc -- View Assigned Mission Contracts

> Member views their assigned MCs with details: priority, branch, success criteria, sub-tasks, context files, milestone.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Show all my assigned open MCs |
| `#{N}` or `N` | Show specific MC with full details |
| `help` or `-h` | Show usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/get-mc -- View your assigned Mission Contracts

USAGE:
  /get-mc             Show all my assigned open MCs
  /get-mc #42         Show details for MC #42
  /get-mc 42          Same as above

WHAT IT SHOWS:
  - Issue number + title
  - Priority, size, milestone
  - Branch name (from conventions)
  - Success Criteria checkboxes
  - Sub-tasks with status
  - Context files

SPECIFIC MC (#N) also shows:
  - Full Issue body
  - Related PRs
  - Commit history on branch
  - Checkout command

SEE ALSO:
  /create-mc          Leader creates MC
  /complete-mc        Submit completed MC
  /team               Team dashboard
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
REPO=$(bash ~/.claude/commands/scripts/tw-config.sh team.repo "" 2>/dev/null)
BRANCH_PATTERN=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.branch_pattern "mission/{issue}-{slug}" 2>/dev/null)
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
```

Also read the user's role from config (by matching `members[].github` == `$GH_USER`), to display in the output header.

---

## Flow A: Show All My MCs (empty arguments)

### Step 1: Fetch assigned open MCs

```bash
gh issue list --assignee "$GH_USER" --label "$MISSION_LABEL" \
  --state open --json number,title,body,labels,milestone --limit 50
```

If zero results:
- Output: "No assigned missions. Ask your leader to create one with /create-mc."
- **STOP**

### Step 2: Parse and display each MC

For each issue, parse from labels:
- **Priority**: label matching `priority:*` (e.g., `priority:P1` -> `P1`)
- **Size**: label matching `size:*` (e.g., `size:M` -> `M`), default to `-` if missing
- **Status**: label matching `status:*` (e.g., `status:wip` -> `wip`)

For each issue, parse from body:
- **Success Criteria**: lines starting with `- [ ]` or `- [x]` under `### Success Criteria`
- **Sub-tasks**: lines starting with `- [ ]` or `- [x]` under `### Sub-tasks`
- **Context Files**: content under `### Context & References`

Compute branch name from convention:
```bash
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
BRANCH="mission/${ISSUE_NUMBER}-${SLUG}"
```

### Step 3: Output format

```
MY MISSIONS -- @{GH_USER} ({role})
=============================================

#{N} {title} [{priority}] [{size}]
    Branch:    {branch}
    Status:    {status}
    Milestone: {milestone title or "none"}

    Success Criteria:
      - [ ] Criterion 1
      - [x] Criterion 2 (done)

    Sub-tasks:
      - [ ] Step 1
      - [ ] Step 2
      - [x] Step 3

    Context Files:
      {file paths from body}

#{N2} {title2} [{priority}] [{size}]
    ...

=============================================
Start working: git checkout {first_branch}
Done? Run: /complete-mc #{N}
```

---

## Flow B: Show Specific MC (`#{N}` or `N`)

### Step 1: Parse issue number

Extract number from `$ARGUMENTS`. Handle both `#42` and `42` formats:

```bash
ISSUE_NUM=$(echo "$ARGUMENTS" | grep -oE '[0-9]+' | head -1)
```

If empty, output "Please specify an issue number" and **STOP**.

### Step 2: Fetch full issue details

```bash
gh issue view "$ISSUE_NUM" --json number,title,body,labels,milestone,assignees,state,url
```

If issue not found or not labeled with `$MISSION_LABEL`:
- "Issue #${ISSUE_NUM} is not a Mission Contract (missing '$MISSION_LABEL' label)."
- **STOP**

### Step 3: Fetch related PRs

```bash
gh pr list --search "Closes #${ISSUE_NUM}" --state all \
  --json number,url,state,statusCheckRollup --limit 5
```

### Step 4: Check branch and commit history

Compute expected branch name:
```bash
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
BRANCH="mission/${ISSUE_NUM}-${SLUG}"
```

Check if branch exists remotely:
```bash
git ls-remote --heads origin "$BRANCH" 2>/dev/null
```

If branch exists, get commit log:
```bash
git log origin/main..origin/${BRANCH} --oneline --limit 20 2>/dev/null
```

Check if local branch exists:
```bash
git rev-parse --verify "$BRANCH" 2>/dev/null
```

### Step 5: Output format (detailed)

```
MISSION CONTRACT -- #{N}
=============================================
Title:     {title}
Assignee:  @{assignee}
Status:    {status label}
Priority:  {Pn}
Size:      {size}
Milestone: {milestone or "none"}
URL:       {issue url}

---------------------------------------------
{Full Issue body rendered}
---------------------------------------------

BRANCH: {branch}
  Local:  {exists | not found}
  Remote: {exists | not found}

  Recent commits:
    {commit log or "no commits yet"}

RELATED PRs:
  {PR #N - state - url}
  {or "No PRs found"}

=============================================
```

### Step 6: Offer checkout

If the branch exists (locally or remotely) and user is NOT already on it:

```bash
# Check current branch
CURRENT=$(git branch --show-current)
```

If `$CURRENT` != `$BRANCH`:
- Output: `To start working: git checkout {branch}`
- If only remote exists: `git checkout -b {branch} origin/{branch}`

If branch does not exist:
- Output: "Branch not created yet. Leader creates it via /create-mc."

---

## Body Parsing Rules

The Issue body follows this structure (created by `/create-mc`):

```markdown
## Mission Contract

### Objective
{text}

### Priority
{P0|P1|P2|P3}

### Estimated Size
{S|M|L|XL}

### Success Criteria
- [ ] ...
- [ ] ...

### Sub-tasks
- [ ] ...

### Context & References
{text, file paths}

### Constraints
{text}

### Verification Method
{code block}
```

Parse each section by finding `### {Section Name}` headers and extracting content until the next `###` or end of body.

---

## Error Handling

- Not authenticated -> "Run `gh auth login` first." -> **STOP**
- No config -> "Run `/team init` first." -> **STOP**
- No assigned MCs -> "No assigned missions." -> **STOP**
- Issue not found -> "Issue #N not found." -> **STOP**
- Issue not a MC -> "Issue #N is not a Mission Contract." -> **STOP**
- Branch not found -> inform, suggest asking leader -> continue (non-fatal)
- gh command fails -> clear error message with fix suggestion -> **STOP**
