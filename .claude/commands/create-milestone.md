---
description: "Create milestone with optional batch MCs. Try: /create-milestone help"
version: "3.0.0"
---

# /create-milestone -- Leader Creates Iteration Goal

> Create a GitHub Milestone and optionally batch-create Mission Contracts.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `<title> -- <description>` | Create milestone only |
| `<title> -- <description>\nMC1: ...\nMC2: ...` | Create milestone + batch MCs |
| `help` or `-h` | Show usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/create-milestone -- Create a milestone and optionally batch-create MCs

USAGE:
  /create-milestone V0.2 -- User system and campaign basics
  /create-milestone V0.2 -- description
    MC1: user registration @yuang-yang
      - [ ] Email/password signup works
      - [ ] JWT auth on all protected routes
    MC2: campaign UI @xxLe
      - [ ] CRUD for campaign materials

WHAT HAPPENS:
  1. Creates GitHub Milestone
  2. If MC list provided: creates each MC (same as /create-mc)
  3. Batch notifications sent

LEADER ONLY.

SEE ALSO:
  /create-mc    Create individual MC
  /team         Team dashboard
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

Same as `/create-mc`: Read config, find current user's role, verify `level: leader`.
If not leader -> "Only leaders can create milestones." -> **STOP**

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "mission" 2>/dev/null)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "status:" 2>/dev/null)
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.priority_prefix "priority:" 2>/dev/null)
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"
```

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS`:

1. **Milestone title**: text before `--` separator (or the entire first line if no `--`)
2. **Milestone description**: text after `--` on the first line
3. **MC list**: remaining lines starting with `MC1:`, `MC2:`, etc. (optional)

Each MC entry in batch mode:
```
MCn: <description> @assignee
  - [ ] Success criterion 1
  - [ ] Success criterion 2
```

If no MC list is provided, this is a milestone-only creation.

---

## Step 2: Create GitHub Milestone

```bash
MILESTONE_URL=$(gh api "repos/$REPO/milestones" --method POST \
  --field title="$MILESTONE_TITLE" \
  --field description="$MILESTONE_DESC" \
  --jq '.html_url' 2>/dev/null)
```

If milestone already exists -> warn "Milestone '$MILESTONE_TITLE' already exists" but continue (use existing).

Extract milestone number for later MC assignment.

---

## Step 3: Batch MC Creation (if MC list provided)

For each MC entry in the list:

1. Parse: description, @assignee, success criteria (indented checkboxes)
2. Verify assignee exists in config members
3. AI-analyze description -> generate full MC body (same logic as `/create-mc` Step 2-3)
4. Create GitHub Issue with `--milestone "$MILESTONE_TITLE"`:
   ```bash
   gh issue create \
     --title "{title}" \
     --body "{body}" \
     --label "$MISSION_LABEL" \
     --label "${STATUS_PREFIX}wip" \
     --label "${PRIORITY_PREFIX}{Pn}" \
     --assignee "{assignee_github}" \
     --milestone "$MILESTONE_TITLE"
   ```
5. Create branch:
   ```bash
   SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
   BRANCH="mission/${ISSUE_NUMBER}-${SLUG}"
   git fetch origin "$BASE_BRANCH"
   git branch "$BRANCH" "origin/$BASE_BRANCH"
   git push -u origin "$BRANCH"
   ```

### Preview Before Publishing

Before creating any Issues, preview the full batch:

```
MILESTONE PREVIEW
=============================================
Milestone: {title}
Description: {desc}
MCs to create: {count}

  MC1: {title} -> @{assignee} [{Pn}]
  MC2: {title} -> @{assignee} [{Pn}]
  MC3: {title} -> @{assignee} [{Pn}]
=============================================
```

Use `AskUserQuestion`: "Publish all / Edit / Cancel"

---

## Step 4: Update Config

If this milestone represents a new version iteration:

```bash
# Update versions.current in config if appropriate
# Only if the milestone title looks like a version (V0.2, V1.0, etc.)
```

This is optional and should be confirmed with the user.

---

## Step 5: Send Notifications

```bash
bash ~/.claude/commands/scripts/tw-notify.sh milestone.created \
  --title "$MILESTONE_TITLE" --mc_count "$MC_COUNT"
```

If batch MCs were created, also send individual mc.created notifications:
```bash
for each MC:
  bash ~/.claude/commands/scripts/tw-notify.sh mc.created \
    --issue "$ISSUE_NUMBER" --title "$MC_TITLE" \
    --assignee "$ASSIGNEE" --branch "$BRANCH"
```

---

## Step 6: Output

```
MILESTONE CREATED
=============================================
Milestone: {title}
URL:       {milestone_url}
MCs:       {count} created

  #{N1} {title1} -> @{assignee1} [branch: mission/{N1}-{slug}]
  #{N2} {title2} -> @{assignee2} [branch: mission/{N2}-{slug}]
  #{N3} {title3} -> @{assignee3} [branch: mission/{N3}-{slug}]

Notifications sent to: {channels}
=============================================
Next: /team to see dashboard
      /create-mc --milestone {title} to add more MCs
```

If no MCs were created (milestone-only):
```
MILESTONE CREATED
=============================================
Milestone: {title}
URL:       {milestone_url}

Add MCs: /create-mc --milestone {title} <description> @assignee
=============================================
```

---

## Error Handling

- Empty title -> "Please provide a milestone title." -> **STOP**
- Not a leader -> "Only leaders can create milestones." -> **STOP**
- Milestone API fails -> "Failed to create milestone. Check permissions." -> **STOP**
- Individual MC creation fails -> warn, continue with remaining MCs
- Assignee not found -> skip that MC, warn which ones were skipped
