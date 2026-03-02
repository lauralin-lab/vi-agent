---
description: "Create mission Issue from natural language. Try: /team-issue help"
version: "2.3.0"
---

# /team-issue — Create Mission Contract Issue

> Turn natural language into a standardized GitHub Issue (mission-contract format).

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| Natural language description | AI-enrich → preview → publish (new Issue) |
| `#42 <changes>` or `update #42 <changes>` | Update existing Issue with described changes |
| `#42` or `update #42` | View and interactively edit existing Issue |
| `help` or `-h` | Show usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/team-issue — Create a mission-contract Issue on GitHub

USAGE:
  /team-issue <description>           AI-enrich and publish as new GitHub Issue
  /team-issue #42 <changes>           Update Issue #42 with described changes
  /team-issue #42                     View and interactively edit Issue #42
  /team-issue help                    Show this guide

EXAMPLES (create):
  /team-issue 共享 .env 导致多个 agent 抢 session，需要配置隔离
  /team-issue add rate limiting to the upload API
  /team-issue fix: camera permission dialog not showing on iOS Safari

EXAMPLES (update):
  /team-issue #42 增加一个约束：不能修改公共 API
  /team-issue #42 priority should be P0, add sub-task for migration
  /team-issue #42                     (interactive edit)

WHAT HAPPENS (create):
  1. AI analyzes your description
  2. Scans codebase for relevant files
  3. Generates standardized mission-contract Issue body
  4. Shows preview for your confirmation
  5. Publishes to GitHub with correct labels

WHAT HAPPENS (update):
  1. Fetches current Issue from GitHub
  2. AI applies your described changes to the body
  3. Shows before/after diff for confirmation
  4. Updates Issue on GitHub

NEXT: /team-claim #{N} to claim the created Issue
```

---

## Step 0: Prerequisites

```bash
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
```
- If fails → "Not authenticated. Run `gh auth login` first." → **STOP**

```bash
if [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
else
  echo "NO_CONFIG"
fi
```
- If no config → "Teamwork not initialized. Run `/team` first." → **STOP**

Read `$TEAMWORK_DIR/config.yml` → extract `team.repo`, `github.mc_label`, domain list, priority list.

---

## Route: Create or Update?

Parse `$ARGUMENTS`:
- If starts with `#N` or `update #N` → extract Issue number → jump to **Operation Update**
- Otherwise → continue to **Step 1: Create** (new Issue flow)

---

## Step 1: Analyze User Description

From the user's natural language input, use AI reasoning to determine:

1. **Title** — concise, prefixed with type (`fix:`, `feat:`, `refactor:`, etc.)
2. **Priority** — P0/P1/P2/P3 (default P2 if unclear)
3. **Size** — S/M/L/XL (default M if unclear)
4. **Domain** — which service area (from config `tags.services`)
5. **Objective** — 1-2 sentence summary of what needs to be done
6. **Success Criteria** — concrete, verifiable checkboxes
7. **Sub-tasks** — breakdown of implementation steps
8. **Context** — background info, related issues, technical details
9. **Constraints** — limitations or things NOT to do
10. **Verification** — how to verify completion

---

## Step 2: Scan Codebase for Context

Use `Glob` and `Grep` with keywords from the description to find:
- Files likely to need modification
- Related test files
- Configuration files that might be affected

Add these to the Context section as "Relevant files".

---

## Step 3: Generate Issue Body

Format the Issue body to match the mission-contract template output:

```markdown
## Mission Contract

### Priority
{P0|P1|P2|P3}

### Estimated Size
{S (1-2 hours)|M (half-day to 1 day)|L (2-3 days)|XL (needs splitting)}

### Primary Domain
{domain}

### Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Sub-tasks
- [ ] Step 1
- [ ] Step 2

### Context
{Background, relevant files, technical details}

### Constraints
{Limitations, dependencies, things NOT to do}

### Verification Method
```bash
# verification commands
```
```

---

## Step 4: Preview & Confirm

Display the full Issue preview to the user:

```
ISSUE PREVIEW
═══════════════════════════════════════
Title:    {title}
Labels:   mission-contract, priority:{Pn}, domain:{domain}, size:{size}, status:queued
Priority: {Pn}
Size:     {size}
Domain:   {domain}

Body:
──────────────────────────────────────
{formatted Issue body}
──────────────────────────────────────
```

Use `AskUserQuestion` to confirm:
- "Publish this Issue?" → Publish / Edit title / Edit priority / Cancel

If user wants edits → apply and re-preview.
If cancel → **STOP**

---

## Step 5: Publish

```bash
REPO=$(grep 'repo:' $TEAMWORK_DIR/config.yml | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"')
MISSION_LABEL=$(grep 'mc_label:' $TEAMWORK_DIR/config.yml | sed 's/^[^:]*://' | sed 's/^ *//' | sed 's/ *#.*//' | tr -d '"')
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission-contract"
```

```bash
gh issue create \
  --repo "$REPO" \
  --title "{title}" \
  --body "{formatted body}" \
  --label "$MISSION_LABEL" \
  --label "status:queued" \
  --label "priority:{Pn}" \
  --label "domain:{domain}" \
  --label "size:{size}"
```

---

## Step 6: Output

```
ISSUE CREATED
═══════════════════════════════════════
Issue:  #{N} — {title}
URL:    {issue URL}
Labels: mission-contract, priority:{Pn}, domain:{domain}, size:{size}

Next: /team-claim #{N} to claim this Issue
═══════════════════════════════════════
```

---

## Operation Update — Edit Existing Issue

> Triggered by `/team-issue #42 <changes>` or `/team-issue #42` (interactive).

### U1: Fetch current Issue

```bash
REPO=$(grep 'repo:' $TEAMWORK_DIR/config.yml | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"')
gh issue view {ISSUE_NUMBER} --repo "$REPO" --json number,title,body,labels,state
```

- If Issue not found → "Issue #{N} not found." → **STOP**
- If Issue is closed → "Issue #{N} is closed. Reopen it first if you want to edit." → **STOP**

Display current Issue summary:
```
CURRENT ISSUE #{N}
──────────────────────────────────────
Title:  {title}
Labels: {labels}

Body:
{current body}
──────────────────────────────────────
```

### U2: Determine changes

**If user provided change description** (e.g., `/team-issue #42 增加约束`):
- AI applies the described changes to the existing body
- Preserve the mission-contract structure (Priority, Size, Sub-tasks, etc.)
- Only modify sections affected by the change description

**If no change description** (e.g., `/team-issue #42`):
- Use `AskUserQuestion` to ask what to change:
  - "Edit title"
  - "Edit priority/size"
  - "Edit sub-tasks"
  - "Edit full body"
- Apply user's selection interactively

### U3: Preview changes

Display the updated Issue:
```
ISSUE UPDATE PREVIEW
═══════════════════════════════════════
Issue:    #{N}
Title:    {new title, or unchanged}

Changes:
──────────────────────────────────────
{Show what changed — highlight modified sections}
──────────────────────────────────────
```

Use `AskUserQuestion` to confirm:
- "Apply changes" → proceed to U4
- "Edit more" → return to U2
- "Cancel" → **STOP**

### U4: Apply update

```bash
gh issue edit {ISSUE_NUMBER} \
  --repo "$REPO" \
  --title "{new title}" \
  --body "{updated body}"
```

If labels changed (priority, size, domain):
```bash
gh issue edit {ISSUE_NUMBER} --repo "$REPO" \
  --remove-label "priority:{old}" --add-label "priority:{new}" \
  --remove-label "size:{old}" --add-label "size:{new}"
```

### U5: Output

```
ISSUE UPDATED
═══════════════════════════════════════
Issue:  #{N} — {title}
URL:    {issue URL}

Changes applied:
  {summary of what changed}

Note: If this Issue is claimed, the assignee will see
[UPDATED] on their dashboard and a freshness prompt
when they run /team-drive.
═══════════════════════════════════════
```

---

## Error Handling

- Empty description → "Please provide a description. Example: `/team-issue fix camera not working on Safari`" → **STOP**
- GitHub API error → "Failed to create Issue. Check `gh auth status`." → **STOP**
- Label not found → create Issue without that label, warn user to run `scripts/setup-github-labels.sh`
