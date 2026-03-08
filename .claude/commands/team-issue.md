---
description: "Create mission Issue from natural language. Try: /team-issue help"
version: "3.2.1"
---

# /team-issue — Mission Contract Issue Manager

> Create, view, comment, update, or batch-create GitHub Issues in mission-contract format.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `<description>` | Create MC (solo: self-assign; team: prompt for assignee) |
| `<description> @assignee` | Create MC and assign to @assignee |
| `#N` (no text) | Show Issue #N details |
| `#N <text>` | Add comment to Issue #N |
| `update #N` or `update #N <changes>` | AI-assisted update of Issue body |
| `fix #N` | Fix untracked Issue — add teamwork labels, optionally reformat |
| `batch <milestone> -- ...` | Batch create milestone + MCs |
| `help` or `-h` | Usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/team-issue — Mission Contract Issue Manager (v3.2.1)

USAGE:
  /team-issue <description>                    Create MC (solo: self-assign; team: prompt)
  /team-issue <description> @assignee          Create MC and assign to @assignee
  /team-issue #42                              Show Issue #42 details
  /team-issue #42 <comment text>               Add comment to Issue #42
  /team-issue update #42 <changes>             AI-assisted update of Issue #42
  /team-issue update #42                       Interactive edit of Issue #42
  /team-issue fix #42                        Fix untracked Issue into teamwork
  /team-issue batch V0.2 -- ...                Batch create milestone + MCs
  /team-issue help                             Show this guide

MILESTONE (for create):
  --milestone <name>   Override milestone (otherwise uses versions.current from config)

EXAMPLES (fix):
  /team-issue fix #94                        Add teamwork labels to Issue #94

EXAMPLES (create):
  /team-issue resolve camera permission on iOS Safari
  /team-issue add rate limiting to upload API @xxLe
  /team-issue --milestone V0.2 user registration flow @yuang-yang

EXAMPLES (comment):
  /team-issue #42 looks good, but add error handling for timeout

EXAMPLES (batch):
  /team-issue batch V0.2 -- User system and campaign basics
    MC1: user registration @yuang-yang
      - [ ] Email/password signup works
    MC2: campaign UI @xxLe
      - [ ] CRUD for campaign materials

WHAT HAPPENS (create):
  1. AI analyzes your description
  2. Searches existing Issues for duplicates
  3. Scans codebase for relevant files
  4. Generates mission-contract Issue body
  5. Shows preview for confirmation
  6. Publishes to GitHub with labels + assignee
  7. Creates branch: mission/{issue}-{slug}
  8. Notifies assignee via configured channels

WHAT HAPPENS (fix):
  1. Fetches existing Issue from GitHub
  2. AI analyzes to infer priority/size
  3. Shows label preview for confirmation
  4. Adds teamwork labels (mission, status, priority, size)
  5. Optionally reformats body into MC structure
  6. Creates mission branch if none exists

WHAT HAPPENS (update):
  1. Fetches current Issue from GitHub
  2. AI applies your described changes
  3. Shows before/after diff for confirmation
  4. Updates Issue on GitHub

NEXT: Assignee runs /team-claim #{issue} to generate Contract
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
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```

Read `$TEAMWORK_DIR/config.yml` → extract labels, members, roles.

```bash
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
```

```bash
# Extract current version/milestone if configured
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)

# Read base branch from config
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"

# Read repo
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
```

### Team Mode Detection

Read the full config file. Count entries in `members:` (or `team:` array for schema v1).

- If members count == 1 → **SOLO_MODE=true** (auto-assign to self, no assignee prompt)
- If members count > 1 → **SOLO_MODE=false** (team mode — prompt for assignee if not specified)

---

## Route: Parse Arguments

Parse `$ARGUMENTS`:

1. **If starts with `batch`** → jump to **Operation Batch**

2. **If starts with `update`** (followed by `#N`) → extract Issue number → jump to **Operation Update**

3. **If starts with `fix`** (followed by `#N`) → extract Issue number → jump to **Operation Fix**

4. **If starts with `#N`**:
   - Extract Issue number
   - If remaining text after `#N` → jump to **Operation Comment** with that text
   - If no remaining text → jump to **Operation Detail**

5. **Otherwise** → continue to **Create Flow** (new Issue)

For create flow, also extract:

```bash
# Extract --milestone if present
MILESTONE_OVERRIDE=""
if echo "$ARGUMENTS" | grep -q '\-\-milestone'; then
  MILESTONE_OVERRIDE=$(echo "$ARGUMENTS" | sed 's/.*--milestone  *\([^ ]*\).*/\1/')
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--milestone  *[^ ]*//' | sed 's/^ *//')
fi

# Final milestone: arg override > config > empty
MILESTONE="${MILESTONE_OVERRIDE:-$CURRENT_VERSION}"

# Resolve short milestone name to full GitHub title (prefix match)
# e.g. "V0.1" → "V0.1 — AI Camera Pipeline"
if [ -n "$MILESTONE" ]; then
  MILESTONE=$(bash ~/.claude/commands/scripts/tw-git.sh milestone-resolve "$MILESTONE" 2>/dev/null)
fi
```

**Extract @assignee** (if present in remaining args):
- Find `@mention` at end of description
- Match against config `members[].github` (exact) or `members[].name` (case-insensitive partial)
- Remove `@mention` from description text
- If `@mention` doesn't match any member → "Member '@{mention}' not found. Available: {list}" → **STOP**

---

## Create Flow

### Step 1: Determine Assignee

**If `@assignee` explicitly provided** (any mode): Use that assignee (already validated in Route step). This takes priority over solo mode auto-assign — the user explicitly chose a target.

**Solo mode** (members==1, no `@assignee`): Auto-assign to self (`$GH_USER`). No prompt needed.

**Team mode** (members > 1, no `@assignee`): Use `AskUserQuestion` to select assignee from config members list.

Any team member can create Issues and assign to anyone — no role restriction.

### Step 2: Analyze User Description

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

### Step 2b: Duplicate Check

Before investing in body generation, search for existing Issues that may already cover this problem.

**Extract 2-3 key terms** from the analyzed title/description (not the full title verbatim — wider net catches more).

```bash
gh issue list --search "{key terms}" --state open --json number,title,url --limit 10
```

**AI evaluates results**: Compare each returned Issue's title and purpose against the user's intent. Judge **semantic similarity**, not string match. "fix camera on Safari" and "iOS media permission broken" are the same problem even though they share zero words.

**If potential duplicates found** → display and ask:

```
POTENTIAL DUPLICATES FOUND
──────────────────────────────────────
#12  fix: camera permission not triggering on Safari
#35  feat: add iOS Safari media support
──────────────────────────────────────
```

Use `AskUserQuestion`:
- "None of these — create new Issue" → continue to Step 3
- "Update #N instead" → redirect to **Operation Update** with user's original description as the change
- "Cancel" → **STOP**

**If no results or no semantic match** → continue to Step 3 silently.

### Step 3: Scan Codebase for Context

Use `Glob` and `Grep` with keywords from the description to find:
- Files likely to need modification
- Related test files
- Configuration files that might be affected

Add these to the Context section as "Relevant files".

### Step 4: Generate Issue Body

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

### Step 5: Preview & Confirm

Display the full Issue preview to the user:

```
📋 PREVIEW ── {title} ──────────────────────
Assignee:   @{assignee}
{priority_dot} {Pn}  Size: {size}  Domain: {domain}
Labels:     {MISSION_LABEL}, {STATUS_PREFIX}wip, {PRIORITY_PREFIX}{Pn}, domain:{domain}, size:{size}
Milestone:  {MILESTONE or "—"}
────────────────────────────────────────────
{formatted Issue body}
────────────────────────────────────────────
```

Use `AskUserQuestion` to confirm:
- "Publish this Issue?" → Publish / Edit title / Edit priority / Cancel

If user wants edits → apply and re-preview.
If cancel → **STOP**

### Step 6: Publish

```bash
gh issue create \
  --repo "$REPO" \
  --title "{title}" \
  --body "{formatted body}" \
  --label "$MISSION_LABEL" \
  --label "${STATUS_PREFIX}wip" \
  --label "${PRIORITY_PREFIX}{Pn}" \
  --label "domain:{domain}" \
  --label "size:{size}" \
  --assignee "{assignee_github}" \
  ${MILESTONE:+--milestone "$MILESTONE"}
```

- If milestone assignment fails (milestone doesn't exist yet) → warn "Issue created without milestone. Create the milestone on GitHub first, then assign: `gh issue edit #{N} --milestone '{MILESTONE}'`. Or re-run `/team init` to set up milestones." Non-fatal: issue is still created without milestone.

Extract Issue number from output URL.

### Step 7: Create Branch

```bash
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$TITLE")
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
git push -u origin "$BRANCH" 2>/dev/null || true
```

If branch already exists → warn but continue (non-fatal).

### Step 8: Notify

```bash
bash ~/.claude/commands/scripts/tw-notify.sh mc.created \
  --issue "$ISSUE_NUMBER" --title "$TITLE" \
  --assignee "$ASSIGNEE" --branch "$BRANCH"
```

Non-fatal: if notification fails, warn but continue.

### Step 9: Output

```
📦 CREATED ── #{issue} {title} ─────────────
Assignee:  @{assignee}
🔀 {branch}
{priority_dot} {Pn}  Size: {size}  Milestone: {milestone or "—"}
URL:       {issue URL}
{If notifications sent:} Notified: {channels}

────────────────────────────────────────────
/team-claim #{issue} to generate Contract
```

---

## Operation Detail — View Issue

> Triggered by `/team-issue #42` (number only, no text after).

```bash
gh issue view $N --repo "$REPO" --json number,title,body,labels,milestone,assignees,state,url
```

- If Issue not found → "Issue #N not found." → **STOP**

Format output:

```
🎯 MC #{N} ── {title} ──────────────────────
Assignee:   @{assignee or "unassigned"}
{priority_dot} {Pn}  Size: {size}  Status: {status}
Milestone:  {milestone or "—"}  State: {open/closed}
URL:        {url}
────────────────────────────────────────────
{Full Issue body}
────────────────────────────────────────────
```

Check for branch and PRs:

```bash
git ls-remote --heads origin "mission/${N}-*" 2>/dev/null
gh pr list --repo "$REPO" --search "Closes #$N" --state all --json number,url,state --limit 5
```

```
🔀 BRANCH  {branch or "(not created)"}
🔀 RELATED PRs  {list or "(none)"}
────────────────────────────────────────────
```

---

## Operation Comment — Add Comment to Issue

> Triggered by `/team-issue #42 some text here`.

```bash
gh issue comment $N --repo "$REPO" --body "$TEXT"
```

- If Issue not found → "Issue #N not found." → **STOP**

Output:

```
💬 COMMENT ── #{N} {title} ─────────────────
{first 80 chars of text}...
URL: {comment URL}
────────────────────────────────────────────
```

---

## Operation Update — Edit Existing Issue

> Triggered by `/team-issue update #42 <changes>` or `/team-issue update #42` (interactive).

### U1: Fetch current Issue

```bash
gh issue view {issue} --repo "$REPO" --json number,title,body,labels,state
```

- If Issue not found → "Issue #{issue} not found." → **STOP**
- If Issue is closed → "Issue #{issue} is closed. Reopen it first if you want to edit." → **STOP**

Display current Issue summary:
```
📋 CURRENT ── #{issue} {title} ─────────────
Labels:  {labels}
────────────────────────────────────────────
{current body}
────────────────────────────────────────────
```

### U2: Determine changes

**If user provided change description** (e.g., `/team-issue update #42 add constraint`):
- AI applies the described changes to the existing body
- Preserve the mission-contract structure (Priority, Size, Sub-tasks, etc.)
- Only modify sections affected by the change description

**If no change description** (e.g., `/team-issue update #42`):
- Use `AskUserQuestion` to ask what to change:
  - "Edit title"
  - "Edit priority/size"
  - "Edit sub-tasks"
  - "Edit full body"
- Apply user's selection interactively

### U3: Preview changes

Display the updated Issue:
```
✏️ UPDATE PREVIEW ── #{issue} ───────────────
Title:  {new title, or unchanged}

📝 CHANGES
  {Show what changed — highlight modified sections}
────────────────────────────────────────────
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
  --remove-label "${PRIORITY_PREFIX}{old}" --add-label "${PRIORITY_PREFIX}{new}" \
  --remove-label "size:{old}" --add-label "size:{new}"
```

### U5: Output

```
✏️ UPDATED ── #{issue} {title} ──────────────
URL:  {issue URL}

📝 CHANGES
  {summary of what changed}

Claimed assignees will see ⚡ on dashboard
and a freshness prompt on /team-drive.
────────────────────────────────────────────
```

---

## Operation Fix — Bring Untracked Issue into Teamwork

> Triggered by `/team-issue fix #42`. Adds teamwork labels to an existing GitHub Issue so it appears on `/team` dashboard. Optionally reformats the body into MC structure.

### A1: Fetch current Issue

```bash
gh issue view {issue} --repo "$REPO" --json number,title,body,labels,assignees,milestone,state
```

- If Issue not found → "Issue #{issue} not found." → **STOP**
- If Issue is closed → "Issue #{issue} is closed. Reopen it first." → **STOP**

Display current Issue:
```
🔍 ADOPT CANDIDATE ── #{issue} {title} ─────
Assignee:   @{assignee or "unassigned"}
Labels:     {current labels or "none"}
Milestone:  {milestone or "—"}
────────────────────────────────────────────
{current body (first 20 lines)}
────────────────────────────────────────────
```

### A2: Check existing labels

Check which teamwork labels are already present:
- Has `$MISSION_LABEL`? (e.g., `mission`)
- Has `${STATUS_PREFIX}*`? (e.g., `status:wip`)
- Has `${PRIORITY_PREFIX}*`? (e.g., `priority:P2`)
- Has `size:*`?

If ALL teamwork labels already present → "Issue #{issue} is already in teamwork." → **STOP**

### A3: Determine missing metadata

**AI analyzes** the existing title and body to infer:
- **Priority** — P0/P1/P2/P3 (default P2)
- **Size** — S/M/L/XL (default M)
- **Status** — default `wip` if assigned, `queued` if unassigned

### A4: Preview

```
🔍 ADOPT PREVIEW ── #{issue} {title} ───────
Assignee:  @{assignee or "unassigned"}

🏷️ LABELS TO ADD
  + {MISSION_LABEL}
  + {STATUS_PREFIX}{status}
  + {PRIORITY_PREFIX}{priority}
  + size:{size}

{If milestone not set and CURRENT_VERSION exists:}
Milestone: {CURRENT_VERSION} (from config)
Reformat:  {yes — MC structure | no — as-is}
────────────────────────────────────────────
```

Use `AskUserQuestion`:
- "Fix as-is" → add labels only, keep body unchanged
- "Fix + reformat body" → add labels AND restructure body into MC format (Objective, Success Criteria, Sub-tasks, etc.)
- "Edit priority/size" → adjust and re-preview
- "Cancel" → **STOP**

### A5: Apply labels

```bash
gh issue edit {issue} --repo "$REPO" \
  --add-label "$MISSION_LABEL" \
  --add-label "${STATUS_PREFIX}{status}" \
  --add-label "${PRIORITY_PREFIX}{priority}" \
  --add-label "size:{size}"
```

If milestone should be set:
```bash
if [ -n "$CURRENT_VERSION" ]; then
  MILESTONE=$(bash ~/.claude/commands/scripts/tw-git.sh milestone-resolve "$CURRENT_VERSION" 2>/dev/null)
fi
gh issue edit {issue} --repo "$REPO" --milestone "${MILESTONE:-$CURRENT_VERSION}"
```

### A6: Reformat body (if selected)

If user chose "Fix + reformat body":

1. AI restructures the existing body content into MC format (same structure as Create Flow Step 4)
2. Preserve all original information — do not discard content
3. Apply:

```bash
gh issue edit {issue} --repo "$REPO" --body "{reformatted body}"
```

### A7: Create branch (if not exists)

```bash
# Check if a mission branch already exists for this issue
EXISTING_BRANCH=$(git ls-remote --heads origin "mission/${ISSUE_NUMBER}-*" 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||' | head -1)

if [ -z "$EXISTING_BRANCH" ]; then
  SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$TITLE")
  bash ~/.claude/commands/scripts/tw-git.sh ensure-base
  BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
  git push -u origin "$BRANCH" 2>/dev/null || true
else
  BRANCH="$EXISTING_BRANCH"
fi
```

### A8: Output

```
✅ ADOPTED ── #{issue} {title} ──────────────
Assignee:   @{assignee or "unassigned"}
Labels:     {all labels}
🔀 {branch}  Milestone: {milestone or "—"}

────────────────────────────────────────────
/team-claim #{issue} to generate Contract
```

---

## Operation Batch — Create Milestone + MCs

> Triggered by `/team-issue batch V0.2 -- description\nMC1: ...\nMC2: ...`

### B1: Parse Arguments

Parse `$ARGUMENTS` (after removing `batch` prefix):

1. **Milestone title**: text before `--` separator
2. **Milestone description**: text after `--` on the first line
3. **MC list**: remaining lines starting with `MC1:`, `MC2:`, etc.

Each MC entry:
```
MCn: <description> @assignee
  - [ ] Success criterion 1
  - [ ] Success criterion 2
```

If no MC list → create milestone only.

### B2: Create GitHub Milestone

```bash
MILESTONE_URL=$(gh api "repos/$REPO/milestones" --method POST \
  --field title="$MILESTONE_TITLE" \
  --field description="$MILESTONE_DESC" \
  --jq '.html_url' 2>/dev/null)
```

If milestone already exists → warn "Milestone '$MILESTONE_TITLE' already exists" but continue (use existing).

```bash
# Resolve short name to full milestone title (prefix match)
# Handles case where milestone exists with longer title (e.g. "V0.2 — User System")
if [ -n "$MILESTONE_TITLE" ]; then
  MILESTONE_TITLE=$(bash ~/.claude/commands/scripts/tw-git.sh milestone-resolve "$MILESTONE_TITLE" 2>/dev/null)
fi
```

### B3: Batch MC Creation (if MC list provided)

For each MC entry:

1. Parse: description, @assignee, success criteria (indented checkboxes)
2. Verify assignee exists in config members
3. AI-analyze description → generate full MC body (same logic as Create Flow Steps 2-4)
4. Collect all generated MCs for preview

### B4: Preview Before Publishing

```
🏁 MILESTONE + MC PREVIEW
═══════════════════════════════════════
Milestone: {title}
Description: {desc}
MCs to create: {count}

  {priority_dot} MC1: {title} → @{assignee}
  {priority_dot} MC2: {title} → @{assignee}
  {priority_dot} MC3: {title} → @{assignee}
═══════════════════════════════════════
```

Use `AskUserQuestion`: "Publish all / Edit / Cancel"

- If Edit → allow modifications and re-preview
- If Cancel → **STOP** (milestone already created but no MCs)

### B5: Publish Each MC

For each MC:

```bash
gh issue create \
  --repo "$REPO" \
  --title "{title}" \
  --body "{body}" \
  --label "$MISSION_LABEL" \
  --label "${STATUS_PREFIX}wip" \
  --label "${PRIORITY_PREFIX}{Pn}" \
  --label "domain:{domain}" \
  --label "size:{size}" \
  --assignee "{assignee_github}" \
  --milestone "${MILESTONE_TITLE}"
```

Extract Issue number, then create branch:

```bash
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$TITLE")
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
git push -u origin "$BRANCH" 2>/dev/null || true
```

If individual MC creation fails → warn, continue with remaining MCs.
If assignee not found → skip that MC, warn which ones were skipped.

### B6: Send Notifications

```bash
bash ~/.claude/commands/scripts/tw-notify.sh milestone.created \
  --title "$MILESTONE_TITLE" --mc_count "$MC_COUNT"
```

For each MC created:
```bash
bash ~/.claude/commands/scripts/tw-notify.sh mc.created \
  --issue "$ISSUE_NUMBER" --title "$MC_TITLE" \
  --assignee "$ASSIGNEE" --branch "$BRANCH"
```

### B7: Output

```
🏁 MILESTONE ── {title} ────────────────────
URL:  {milestone_url}
MCs:  {count} created

  #{N1}  {title1}  @{assignee1}  🔀 mission/{N1}-{slug}
  #{N2}  {title2}  @{assignee2}  🔀 mission/{N2}-{slug}
{If notifications:} Notified: {channels}

────────────────────────────────────────────
/team to see dashboard
```

If milestone-only (no MCs):
```
🏁 MILESTONE ── {title} ────────────────────
URL:  {milestone_url}

────────────────────────────────────────────
/team-issue <desc> @user --milestone {title}
```

---

## Error Handling

- Empty description → "Please provide a description. Example: `/team-issue camera not working on Safari`" → **STOP**
- GitHub API error → "Failed to create Issue. Check `gh auth status`." → **STOP**
- Label not found → create Issue without that label, warn "Labels missing. Run `/team init` to set up project labels."
- No assignee (team mode) → AskUserQuestion to select from members list
- Assignee not in config → "Member '@{mention}' not found. Available: {list}" → **STOP**
- Branch already exists → warn but continue (non-fatal)
- Notification fails → warn but continue (non-fatal)
