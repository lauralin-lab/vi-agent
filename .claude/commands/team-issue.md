---
description: "Create mission Issue from natural language. Try: /team-issue help"
version: "2.5.1"
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
  2. Searches existing Issues for duplicates (semantic match)
  3. Scans codebase for relevant files
  4. Generates standardized mission-contract Issue body
  5. Shows preview for your confirmation
  6. Publishes to GitHub with correct labels

WHAT HAPPENS (update):
  1. Fetches current Issue from GitHub
  2. AI applies your described changes to the body
  3. Shows before/after diff for confirmation
  4. Updates Issue on GitHub

NEXT: /team-claim #{issue} to claim the created Issue
```

---

## Step 0: Prerequisites

```bash
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
if [ -z "$GH_USER" ]; then
  echo "ERROR: Cannot get GitHub user identity. Run 'gh auth login' first."
  exit 1
fi
```

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

```bash
# Extract current version/milestone if configured
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
```
- If `CURRENT_VERSION` is non-empty → Issues will be assigned to this milestone.

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

## Step 1b: Duplicate Check

Before investing in body generation, search for existing Issues that may already cover this problem.

**Extract 2-3 key terms** from the analyzed title/description (not the full title verbatim — wider net catches more).

```bash
gh issue list --search "{key terms}" --state open --json number,title,url --limit 10
```

**AI evaluates results**: Compare each returned Issue's title and purpose against the user's intent. Judge **semantic similarity**, not string match. "fix camera on Safari" and "iOS media permission broken" are the same problem even though they share zero words.

**If potential duplicates found** → display and ask:

```
⚠️ POTENTIAL DUPLICATES FOUND
──────────────────────────────────────
#12  fix: camera permission not triggering on Safari
#35  feat: add iOS Safari media support
──────────────────────────────────────
```

Use `AskUserQuestion`:
- "None of these — create new Issue" → continue to Step 2
- "Update #N instead" → redirect to **Operation Update** with user's original description as the change
- "Cancel" → **STOP**

**If no results or no semantic match** → continue to Step 2 silently.

---

## Step 2: Scan Codebase for Context

Use `Glob` and `Grep` with keywords from the description to find:
- Files likely to need modification
- Related test files
- Configuration files that might be affected

Add these to the Context section as "Relevant files".

---

## Step 3: Generate Issue Body

Format the Issue body using the canonical mission-contract structure:

```markdown
## Mission Contract

### Objective
{1-2 sentence summary of what needs to be done}

### Priority
{P0|P1|P2|P3}

### Estimated Size
{S (1-2 hours)|M (half-day to 1 day)|L (2-3 days)|XL (needs splitting)}

### Primary Domain
{domain}

### Success Criteria
- [ ] Criterion 1 — concrete, verifiable
- [ ] Criterion 2

### Sub-tasks
- [ ] Step 1
- [ ] Step 2

### Context & References
{Background, relevant files, technical details, links}

### Constraints
{Limitations, dependencies, things NOT to do}

### Verification Method
```bash
# verification commands
```
```

**Canonical field names** (always use these exactly — `team-claim` parses them by name):
- `Success Criteria` (NOT "Acceptance Criteria")
- `Context & References` (NOT "Context")
- `Sub-tasks` (NOT "Tasks" or "Steps")

---

## Step 4: Preview & Confirm

Display the full Issue preview to the user:

```
ISSUE PREVIEW
═══════════════════════════════════════
Title:    {title}
Labels:   mission-contract, priority:{Pn}, domain:{domain}, size:{size}, status:queued
Milestone:{CURRENT_VERSION if set, else "none"}
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
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
# Try github.mc_label (teamspace schema) then mc_label (teamwork schema)
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh github.mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"
```

```bash
# Add milestone if versions.current configured
MILESTONE_FLAG=""
if [ -n "$CURRENT_VERSION" ]; then
  MILESTONE_FLAG="--milestone \"$CURRENT_VERSION\""
fi
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
  --label "size:{size}" \
  $MILESTONE_FLAG
```

- If milestone assignment fails (milestone doesn't exist yet) → warn "Milestone '{CURRENT_VERSION}' not found on GitHub. Create it first: `gh api repos/{REPO}/milestones --method POST --field title='{CURRENT_VERSION}'`". Non-fatal: issue is still created without milestone.

---

## Step 6: Output

```
ISSUE CREATED
═══════════════════════════════════════
Issue:  #{issue} — {title}
URL:    {issue URL}
Labels: mission-contract, priority:{Pn}, domain:{domain}, size:{size}

Next: /team-claim #{issue} to claim this Issue
═══════════════════════════════════════
```

---

## Operation Update — Edit Existing Issue

> Triggered by `/team-issue #42 <changes>` or `/team-issue #42` (interactive).

### U1: Fetch current Issue

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
gh issue view {issue} --repo "$REPO" --json number,title,body,labels,state
```

- If Issue not found → "Issue #{issue} not found." → **STOP**
- If Issue is closed → "Issue #{issue} is closed. Reopen it first if you want to edit." → **STOP**

Display current Issue summary:
```
CURRENT ISSUE #{issue}
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
Issue:    #{issue}
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
gh issue edit {issue} \
  --repo "$REPO" \
  --title "{new title}" \
  --body "{updated body}"
```

If labels changed (priority, size, domain):
```bash
gh issue edit {issue} --repo "$REPO" \
  --remove-label "priority:{old}" --add-label "priority:{new}" \
  --remove-label "size:{old}" --add-label "size:{new}"
```

### U5: Output

```
ISSUE UPDATED
═══════════════════════════════════════
Issue:  #{issue} — {title}
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
- Label not found → create Issue without that label, warn user to run `bash ~/.claude/commands/scripts/setup-github-labels.sh` (installed with teamwork)
