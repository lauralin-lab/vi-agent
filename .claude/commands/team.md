---
description: "Team onboard + dashboard. Try: /team help"
version: "3.0.0"
---

# /team -- Onboard + Dashboard (Teamwork v3)

> Push-based team coordination. Leader creates and assigns MCs, members execute and report.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Auto: first run -> Onboard, subsequent -> Dashboard |
| `help` or `-h` | Show quick-start guide |
| `init` | Force re-initialize (create labels, CI, branch protection) |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
TEAMWORK v3 -- Quick Start Guide
=============================================

SETUP (one time):
  /team                 First run: detect project, check config, onboard

LEADER WORKFLOW:
  /team                 Leader dashboard (all members, review queue, milestone)
  /create-milestone     Create milestone with optional batch MCs
  /create-mc            Create MC and assign to member
  /review-mc            Review submitted MCs (approve/request changes)

MEMBER WORKFLOW:
  /team                 Member dashboard (my assigned MCs, progress)
  /get-mc               View my assigned MCs with details
  /complete-mc          Submit completed MC (push, PR, notify leader)

LIFECYCLE:
  Leader: /create-mc @member -> MC created, member notified
  Member: /get-mc -> see details + checkout branch
          (code, test, commit)
  Member: /complete-mc -> PR created, leader notified
  Leader: /review-mc -> approve + merge, or request changes

CONFIG:
  .teamwork/config.yml  Team roles, members, services, quality gates

REQUIREMENTS:
  gh (GitHub CLI)       gh auth login
  git remote            git remote add origin <url>
=============================================
```

---

## Step 0: Prerequisites

```bash
# Check gh CLI
gh --version 2>/dev/null || echo "GH_MISSING"

# Check git remote
git remote get-url origin 2>/dev/null || echo "NO_REMOTE"
```

- If `gh` not installed -> "GitHub CLI (`gh`) is required. Install: https://cli.github.com/" -> **STOP**
- If no git remote -> "Not a GitHub-linked repository. Run `git remote add origin <url>` first." -> **STOP**

```bash
# Get identity
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
```

- If `gh api user` fails -> "Not authenticated. Run `gh auth login` first." -> **STOP**

```bash
# Get repo info
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
```

---

## Step 1: Route -- Init or Dashboard?

```bash
if [ "$ARGUMENTS" = "init" ]; then
  # Force init mode
  ROUTE="INIT"
elif [ -f .teamwork/config.yml ]; then
  ROUTE="DASHBOARD"
else
  ROUTE="INIT"
fi
```

- If `INIT` -> Jump to **Step 2: Initialize**
- If `DASHBOARD` -> Jump to **Step 3: Check Membership** then **Dashboard**

---

## Step 2: Initialize

> First-time setup or forced re-init. Checks config exists, creates labels + CI.

### 2a: Check config

```bash
if [ ! -f .teamwork/config.yml ]; then
  echo "ERROR: .teamwork/config.yml not found."
  echo "This file should be committed to the repo. Create it manually or copy from template."
  # STOP
fi
```

The v3 config is expected to already exist in the repo (committed by the leader during project setup). The `/team init` flow focuses on GitHub infrastructure:
- Labels
- Branch protection
- Repository merge settings

### 2b: Read config

```bash
cat .teamwork/config.yml
```

Parse config to extract:
- `labels.mission` (default: `"mission"`)
- `labels.status_prefix` (default: `"status:"`)
- `labels.priority_prefix` (default: `"priority:"`)
- `conventions.base_branch` (default: `"main"`)
- `quality.ci`, `quality.review_required`, `quality.branch_protection`
- `versions.current`

### 2c: Create labels

```bash
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "mission" 2>/dev/null)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "status:" 2>/dev/null)
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.priority_prefix "priority:" 2>/dev/null)

# Mission label
gh label create "$MISSION_LABEL" --color 0075ca --description "Mission Contract" --force

# Status labels
gh label create "${STATUS_PREFIX}wip" --color fbca04 --description "Work in progress" --force
gh label create "${STATUS_PREFIX}review" --color 7057ff --description "Awaiting review" --force
gh label create "${STATUS_PREFIX}done" --color 0e8a16 --description "Completed" --force
gh label create "${STATUS_PREFIX}blocked" --color d73a4a --description "Blocked" --force

# Priority labels
gh label create "${PRIORITY_PREFIX}P0" --color d73a4a --description "Critical" --force
gh label create "${PRIORITY_PREFIX}P1" --color e4e669 --description "High" --force
gh label create "${PRIORITY_PREFIX}P2" --color 0e8a16 --description "Medium" --force
gh label create "${PRIORITY_PREFIX}P3" --color cfd3d7 --description "Low" --force
```

### 2d: Repository merge settings

```bash
gh api "repos/$REPO" --method PATCH \
  --field delete_branch_on_merge=true \
  --field allow_squash_merge=true \
  --field allow_merge_commit=false \
  --field allow_rebase_merge=false \
  --field squash_merge_commit_title=PR_TITLE \
  --field squash_merge_commit_message=PR_BODY 2>/dev/null || \
  echo "WARNING: Could not update merge settings (permissions)"
```

### 2e: Branch protection (if enabled)

```bash
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
CI_ENABLED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.ci "false" 2>/dev/null)
REVIEW_REQUIRED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.review_required "false" 2>/dev/null)
BRANCH_PROTECTION=$(bash ~/.claude/commands/scripts/tw-config.sh quality.branch_protection "false" 2>/dev/null)
```

If `quality.branch_protection` is `true`:

```bash
# Build status checks
if [ "$CI_ENABLED" = "true" ]; then
  STATUS_CHECKS='"required_status_checks": {"strict": true, "contexts": ["quality"]}'
else
  STATUS_CHECKS='"required_status_checks": null'
fi

# Build review requirement
if [ "$REVIEW_REQUIRED" = "true" ]; then
  REVIEW_COUNT=1
else
  REVIEW_COUNT=0
fi

gh api "repos/$REPO/branches/$BASE_BRANCH/protection" \
  --method PUT \
  --input - <<EOF
{
  $STATUS_CHECKS,
  "enforce_admins": false,
  "required_pull_request_reviews": {"required_approving_review_count": $REVIEW_COUNT},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

If branch protection fails -> warn but continue (non-fatal).

### 2f: Create milestone (if versions.current set)

```bash
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
if [ -n "$CURRENT_VERSION" ]; then
  gh api "repos/$REPO/milestones" --method POST \
    --field title="$CURRENT_VERSION" 2>/dev/null || \
    echo "Milestone '$CURRENT_VERSION' may already exist"
fi
```

### 2g: Output

```
TEAMWORK INITIALIZED
=============================================
Labels:     created (mission, status:*, priority:*)
Merge:      squash-only, auto-delete branches
Protection: {enabled/disabled}
Milestone:  {version or "none"}

Config:     .teamwork/config.yml
=============================================
Next: /create-mc to create and assign missions
      /team to see dashboard
```

---

## Step 3: Check Membership

Read `.teamwork/config.yml` and check if `GH_USER` is in the `members:` list.

```bash
cat .teamwork/config.yml
```

Look for a member entry where `github:` matches `$GH_USER`.

### If found:

Extract:
- `role` -- the member's role ID (e.g., `leader`, `backend-engineer`)
- Look up role in `roles:` list to get `level` (leader or member) and `label`

Continue to **Step 4: Dashboard**.

### If NOT found -- Onboard:

1. Welcome: "Welcome! You (@{GH_USER}) are not in the team roster."

2. Read `roles:` from config. Display role options using `AskUserQuestion`:
   ```
   question: "What's your role on this team?"
   options:
     - label: "Backend Engineer"
       description: "API server, database, backend services"
     - label: "Frontend Engineer"
       description: "React frontend, UI/UX implementation"
     {... each role from config roles: list}
   ```

3. Add user to config `members:` section:
   ```yaml
   - github: {GH_USER}
     name: "{GH_USER}"
     role: {selected_role_id}
   ```

4. Commit and push:
   ```bash
   git add .teamwork/config.yml
   git commit -m "feat(teamwork): add {GH_USER} as {role} to team roster"
   git push
   ```

5. Output: "Added you as **{role_label}**. Showing dashboard..."

6. Continue to **Step 4: Dashboard**.

---

## Step 4: Dashboard

Read GitHub data and display role-appropriate dashboard.

### 4a: Read config

```bash
cat .teamwork/config.yml
```

Parse:
- `members:` list with github, name, role
- `roles:` list with levels
- `versions.current`

Determine the current user's role level (leader or member).

### 4b: Fetch GitHub data

```bash
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "mission" 2>/dev/null)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "status:" 2>/dev/null)
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)

# All open mission issues
gh issue list --label "$MISSION_LABEL" --state open \
  --json number,title,assignees,labels,milestone --limit 50

# Review queue (status:review)
gh issue list --label "$MISSION_LABEL" --label "${STATUS_PREFIX}review" \
  --state open --json number,title,assignees --limit 20

# Recent merged PRs (for merge count)
gh pr list --state merged --base "$BASE_BRANCH" --json author,title --limit 50

# Milestone progress
if [ -n "$CURRENT_VERSION" ]; then
  gh api "repos/$REPO/milestones" --jq ".[] | select(.title == \"$CURRENT_VERSION\")"
fi
```

### 4c: Leader Dashboard

If user's role level is `leader`, display:

```
TEAM DASHBOARD -- {team name}
Milestone: {version} -- {closed}/{total} tasks ({pct}%)
=============================================

MEMBERS:
  @{member1_github} ({role_label})
    Working: #{N} {title} [{priority}]

  @{member2_github} ({role_label})
    Working: #{N} {title} [{priority}]

  @{member3_github} ({role_label})
    Idle -- no assigned MC

REVIEW QUEUE (pending Leader review):
  #{N} -- Submitted by @{assignee}, PR #{pr}
  #{N} -- Submitted by @{assignee}, PR #{pr}

PRODUCT DATA:
  (No data sources configured)

=============================================
Commands: /create-mc | /review-mc | /create-milestone
```

For each member in config:
- Find their assigned open Issues with `${STATUS_PREFIX}wip` label
- If WIP issue -> show "Working: #{N} {title} [{priority}]"
- If review issue -> show "Review: #{N} {title}"
- If no assigned issues -> show "Idle -- no assigned MC"

Review queue: all Issues with `${STATUS_PREFIX}review` label. For each, find associated PR:
```bash
gh pr list --search "Closes #{issue}" --state open --json number,url --limit 1
```

Product data section: read `data_sources` from config. If empty -> show placeholder.

### 4d: Member Dashboard

If user's role level is `member`, display:

```
MY MISSIONS -- @{username} ({role_label})
=============================================

ACTIVE:
  #{N} {title} [{priority}] [{status}]
      Branch: mission/{N}-{slug}
      Success Criteria:
        - [ ] Criterion 1
        - [x] Criterion 2

COMPLETED (recent):
  #{N} {title} -- merged {timeago}

MILESTONE: {version} -- {closed}/{total} tasks done ({pct}%)
=============================================
Commands: /get-mc | /complete-mc
```

For the active section:
- Fetch Issues assigned to `$GH_USER` with `$MISSION_LABEL` label, state open
- Parse Issue body for Success Criteria section
- Determine branch name from conventions: `mission/{issue}-{slug}`

For completed section:
- Fetch recently closed Issues assigned to `$GH_USER`
```bash
gh issue list --assignee "$GH_USER" --label "$MISSION_LABEL" \
  --state closed --json number,title,closedAt --limit 5
```

---

## Error Handling

- `gh` not installed -> "Install GitHub CLI" -> **STOP**
- Not authenticated -> "Run `gh auth login`" -> **STOP**
- No git remote -> "Add origin remote" -> **STOP**
- No config -> "Config not found. Create .teamwork/config.yml" -> **STOP**
- Config malformed -> warn and suggest re-creating
- GitHub API errors (labels, protection) -> warn but continue (non-fatal)
- User not in roster -> trigger onboard flow
