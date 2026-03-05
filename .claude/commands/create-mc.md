---
description: "Create Mission Contract → assign to member. Try: /create-mc help"
version: "3.0.0"
---

# /create-mc -- Leader Creates Mission Contract

> Push-based: Leader creates MC, assigns to member, member gets notified.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `<description> @assignee` | Create MC and assign |
| `--milestone V0.2 <description> @assignee` | Create MC under specific milestone |
| `help` or `-h` | Show usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/create-mc -- Create a Mission Contract and assign to a team member

USAGE:
  /create-mc <description> @assignee
  /create-mc --milestone V0.2 <description> @assignee

EXAMPLES:
  /create-mc fix camera permission on iOS Safari @xxLe
  /create-mc add rate limiting to upload API, max 10 req/min @yuang-yang
  /create-mc --milestone V0.2 user registration flow @yuang-yang

WHAT HAPPENS:
  1. AI analyzes description -> generates structured MC
  2. Preview shown for confirmation
  3. GitHub Issue created with labels + milestone
  4. Branch auto-created: mission/{issue}-{slug}
  5. Assignee notified via configured channels

LEADER ONLY: Members cannot create MCs. Ask your leader.

SEE ALSO:
  /create-milestone   Create milestone with batch MCs
  /review-mc          Review submitted MCs
  /team               Team dashboard
```

---

## Step 0: Prerequisites + Permission Check

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

### Permission Check (Leader only)

Read `.teamwork/config.yml`. Find the current user's member entry by matching `github: {GH_USER}`. Get their `role` field. Look up that role in the `roles:` list and check `level`.

```bash
# Read config
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "mission" 2>/dev/null)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "status:" 2>/dev/null)
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.priority_prefix "priority:" 2>/dev/null)
```

To check permission, read the full config file and parse:
1. Find `members:` entry where `github:` matches `$GH_USER`
2. Get their `role:` value (e.g., `leader`)
3. Find that role in `roles:` list
4. Check if `level: leader`

If user's role level is NOT `leader`:
- Output: "Only leaders can create missions. Ask your leader to create one for you."
- **STOP**

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS` to extract:

1. **`--milestone`** flag (if present): extract milestone name, remove from remaining args
2. **`@assignee`**: find @-mention in arguments, match against config `members[].github` or `members[].name`
3. **Remaining text**: the MC description

```bash
# Extract --milestone if present
MILESTONE_OVERRIDE=""
if echo "$ARGUMENTS" | grep -q '\-\-milestone'; then
  MILESTONE_OVERRIDE=$(echo "$ARGUMENTS" | sed 's/.*--milestone  *\([^ ]*\).*/\1/')
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--milestone  *[^ ]*//' | sed 's/^ *//')
fi

# Final milestone: arg override > config versions.current > empty
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
MILESTONE="${MILESTONE_OVERRIDE:-$CURRENT_VERSION}"
```

**Assignee resolution**: Match `@mention` against:
- `members[].github` (exact match)
- `members[].name` (case-insensitive partial match)

If no @mention found:
- Use `AskUserQuestion` to select from config members list

If @mention doesn't match any member:
- "Member '@{mention}' not found in config. Available members: {list}" -> **STOP**

Verify the assignee is a member-level role (not assigning to self as leader, which is allowed but unusual).

---

## Step 2: AI-Analyze Description

From the user's description, generate:

1. **Title** -- concise, prefixed with type (`feat:`, `fix:`, `refactor:`, etc.)
2. **Priority** -- P0/P1/P2/P3 (default P2 if unclear)
3. **Size** -- S/M/L/XL (default M if unclear)
4. **Objective** -- 1-2 sentence summary
5. **Success Criteria** -- concrete, verifiable checkboxes (REQUIRED from description)
6. **Sub-tasks** -- AI-generated implementation breakdown
7. **Context Files** -- Use `Glob` and `Grep` to scan codebase for relevant files
8. **Verification Method** -- test commands from config + custom

### Context File Discovery

Scan the project using keywords from the description:

```bash
# Use Glob to find related files
# Use Grep to search for related code patterns
# Reference config project.services for service-specific paths
```

List discovered files in the Context section.

---

## Step 3: Generate Issue Body

Format using the canonical mission contract structure:

```markdown
## Mission Contract

### Objective
{1-2 sentence summary}

### Priority
{P0|P1|P2|P3}

### Estimated Size
{S (1-2 hours)|M (half-day to 1 day)|L (2-3 days)|XL (needs splitting)}

### Success Criteria
- [ ] Criterion 1 -- concrete, verifiable
- [ ] Criterion 2

### Sub-tasks
- [ ] Step 1
- [ ] Step 2

### Context & References
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

Display the full MC preview:

```
MC PREVIEW
=============================================
Title:     {title}
Assignee:  @{assignee_github}
Priority:  {Pn}
Size:      {size}
Milestone: {milestone or "none"}
Labels:    mission, status:wip, priority:{Pn}

Body:
---------------------------------------------
{formatted Issue body}
---------------------------------------------
```

Use `AskUserQuestion`:
- "Publish / Edit / Cancel"

If Edit -> apply changes and re-preview.
If Cancel -> **STOP**.

---

## Step 5: Create GitHub Issue

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)

gh issue create \
  --title "{title}" \
  --body "{formatted body}" \
  --label "$MISSION_LABEL" \
  --label "${STATUS_PREFIX}wip" \
  --label "${PRIORITY_PREFIX}{Pn}" \
  --assignee "{assignee_github}" \
  ${MILESTONE:+--milestone "$MILESTONE"}
```

Extract Issue number from output URL.

**Note**: Status is `wip` (not `queued`) because in push model the task is directly assigned and active.

If milestone assignment fails (milestone doesn't exist):
- Warn: "Milestone '{MILESTONE}' not found. Create it first with /create-milestone."
- Issue still created without milestone (non-fatal).

---

## Step 6: Create Branch

```bash
# Read base branch from config
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"

# Slugify title
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
BRANCH="mission/${ISSUE_NUMBER}-${SLUG}"

# Create and push branch from latest base branch (pre-launch)
git fetch origin "$BASE_BRANCH"
git branch "$BRANCH" "origin/$BASE_BRANCH"
git push -u origin "$BRANCH"
```

If branch already exists -> warn but continue (non-fatal).

---

## Step 7: Send Notification

```bash
bash ~/.claude/commands/scripts/tw-notify.sh mc.created \
  --issue "$ISSUE_NUMBER" --title "$TITLE" \
  --assignee "$ASSIGNEE_GITHUB" --branch "$BRANCH"
```

Non-fatal: if notification fails, warn but continue.

---

## Step 8: Output

```
MC CREATED
=============================================
Issue:     #{N} -- {title}
Assignee:  @{assignee}
Branch:    {branch}
Priority:  {Pn}
Milestone: {milestone or "none"}

Notification sent to: {channels}

Assignee can run: /get-mc to see details
=============================================
```

---

## Error Handling

- No description -> "Please provide a description. Example: `/create-mc fix camera permission @xxLe`" -> **STOP**
- No assignee -> AskUserQuestion to select from members list
- Assignee not in config -> "Member not found" -> **STOP**
- Not a leader -> "Only leaders can create missions" -> **STOP**
- GitHub API error -> "Failed to create Issue. Check `gh auth status`." -> **STOP**
- Label not found -> create Issue without that label, warn to run label setup
