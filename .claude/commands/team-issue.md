---
description: "Create mission Issue from natural language. Try: /team-issue help"
version: "3.0.0"
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
| `batch <milestone> -- ...` | Batch create milestone + MCs |
| `help` or `-h` | Usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/team-issue — Mission Contract Issue Manager (v3.0.0)

USAGE:
  /team-issue <description>                    Create MC (solo: self-assign; team: prompt)
  /team-issue <description> @assignee          Create MC and assign to @assignee
  /team-issue #42                              Show Issue #42 details
  /team-issue #42 <comment text>               Add comment to Issue #42
  /team-issue update #42 <changes>             AI-assisted update of Issue #42
  /team-issue update #42                       Interactive edit of Issue #42
  /team-issue batch V0.2 -- ...                Batch create milestone + MCs
  /team-issue help                             Show this guide

MILESTONE (for create):
  --milestone <name>   Override milestone (otherwise uses versions.current from config)

EXAMPLES (create):
  /team-issue fix camera permission on iOS Safari
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
if [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
else
  echo "NO_CONFIG"
fi
```
- If no config → "Teamwork not initialized. Run `/team` first." → **STOP**

Read `$TEAMWORK_DIR/config.yml` → extract labels, members, roles.

```bash
# Read mission label + status prefix from config
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh github.mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"

STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
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

3. **If starts with `#N`**:
   - Extract Issue number
   - If remaining text after `#N` → jump to **Operation Comment** with that text
   - If no remaining text → jump to **Operation Detail**

4. **Otherwise** → continue to **Create Flow** (new Issue)

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
```

**Extract @assignee** (if present in remaining args):
- Find `@mention` at end of description
- Match against config `members[].github` (exact) or `members[].name` (case-insensitive partial)
- Remove `@mention` from description text
- If `@mention` doesn't match any member → "Member '@{mention}' not found. Available: {list}" → **STOP**

---

## Create Flow

### Step 1: Determine Assignee

**Solo mode** (members==1): Auto-assign to self (`$GH_USER`). No prompt needed.

**Team mode** (members > 1):
- If `@assignee` provided → use that assignee (already validated in Route step)
- If no `@assignee` provided → Use `AskUserQuestion` to select assignee from config members list

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
ISSUE PREVIEW
═══════════════════════════════════════
Title:     {title}
Assignee:  @{assignee}
Labels:    mission-contract, priority:{Pn}, domain:{domain}, size:{size}, status:wip
Milestone: {MILESTONE if set, else "none"}
Priority:  {Pn}
Size:      {size}
Domain:    {domain}

Body:
──────────────────────────────────────
{formatted Issue body}
──────────────────────────────────────
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
  --label "priority:{Pn}" \
  --label "domain:{domain}" \
  --label "size:{size}" \
  --assignee "{assignee_github}" \
  ${MILESTONE:+--milestone "$MILESTONE"}
```

- If milestone assignment fails (milestone doesn't exist yet) → warn "Milestone '{MILESTONE}' not found on GitHub. Create it first: `gh api repos/{REPO}/milestones --method POST --field title='{MILESTONE}'`". Non-fatal: issue is still created without milestone.

Extract Issue number from output URL.

### Step 7: Create Branch

```bash
# Slugify title
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
BRANCH="mission/${ISSUE_NUMBER}-${SLUG}"

# Create and push branch from latest base branch
git fetch origin "$BASE_BRANCH"
git branch "$BRANCH" "origin/$BASE_BRANCH"
git push -u origin "$BRANCH"
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
MC CREATED
═══════════════════════════════════════
Issue:     #{issue} — {title}
Assignee:  @{assignee}
Branch:    {branch}
URL:       {issue URL}
Labels:    mission-contract, priority:{Pn}, domain:{domain}, size:{size}
Milestone: {milestone or "none"}

Notification sent to: {channels or "none configured"}

Next: Assignee runs /team-claim #{issue} to generate Contract
═══════════════════════════════════════
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
MISSION CONTRACT — #{N}
═══════════════════════════════════════
Title:     {title}
Assignee:  @{assignee or "unassigned"}
Status:    {status label}
Priority:  {priority label}
Size:      {size label}
Milestone: {milestone or "none"}
State:     {open/closed}
URL:       {url}
──────────────────────────────────────
{Full Issue body}
──────────────────────────────────────
```

Check for branch and PRs:

```bash
# Read branch convention from config
BRANCH_PATTERN=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.branch_pattern "" 2>/dev/null)
# Default: mission/{issue}-{slug}
# Check for branch matching the issue number
git ls-remote --heads origin "mission/${N}-*" 2>/dev/null
```

```bash
# Check for related PRs
gh pr list --repo "$REPO" --search "Closes #$N" --state all --json number,url,state --limit 5
```

```
BRANCH: {branch or "not created"}
RELATED PRs: {list or "none"}
═══════════════════════════════════════
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
COMMENT ADDED
═══════════════════════════════════════
Issue:   #{N} — {title}
Comment: {first 80 chars of text}...
URL:     {comment URL}
═══════════════════════════════════════
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
CURRENT ISSUE #{issue}
──────────────────────────────────────
Title:  {title}
Labels: {labels}

Body:
{current body}
──────────────────────────────────────
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

### B3: Batch MC Creation (if MC list provided)

For each MC entry:

1. Parse: description, @assignee, success criteria (indented checkboxes)
2. Verify assignee exists in config members
3. AI-analyze description → generate full MC body (same logic as Create Flow Steps 2-4)
4. Collect all generated MCs for preview

### B4: Preview Before Publishing

```
MILESTONE + MC PREVIEW
═══════════════════════════════════════
Milestone: {title}
Description: {desc}
MCs to create: {count}

  MC1: {title} → @{assignee} [{Pn}]
  MC2: {title} → @{assignee} [{Pn}]
  MC3: {title} → @{assignee} [{Pn}]
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
  --label "priority:{Pn}" \
  --assignee "{assignee_github}" \
  --milestone "$MILESTONE_TITLE"
```

Extract Issue number, then create branch:

```bash
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
BRANCH="mission/${ISSUE_NUMBER}-${SLUG}"
git fetch origin "$BASE_BRANCH"
git branch "$BRANCH" "origin/$BASE_BRANCH"
git push -u origin "$BRANCH"
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
MILESTONE CREATED
═══════════════════════════════════════
Milestone: {title}
URL:       {milestone_url}
MCs:       {count} created

  #{N1} {title1} → @{assignee1} [branch: mission/{N1}-{slug}]
  #{N2} {title2} → @{assignee2} [branch: mission/{N2}-{slug}]

Notifications sent to: {channels or "none configured"}
═══════════════════════════════════════
Next: /team to see dashboard
```

If milestone-only (no MCs):
```
MILESTONE CREATED
═══════════════════════════════════════
Milestone: {title}
URL:       {milestone_url}

Add MCs: /team-issue <description> @assignee --milestone {title}
═══════════════════════════════════════
```

---

## Error Handling

- Empty description → "Please provide a description. Example: `/team-issue fix camera not working on Safari`" → **STOP**
- GitHub API error → "Failed to create Issue. Check `gh auth status`." → **STOP**
- Label not found → create Issue without that label, warn user to run `bash ~/.claude/commands/scripts/setup-github-labels.sh` (installed with teamwork)
- No assignee (team mode) → AskUserQuestion to select from members list
- Assignee not in config → "Member '@{mention}' not found. Available: {list}" → **STOP**
- Branch already exists → warn but continue (non-fatal)
- Notification fails → warn but continue (non-fatal)
