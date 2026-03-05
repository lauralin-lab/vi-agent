---
description: "Team onboard + dashboard. Try: /team help"
version: "3.1.0"
---

# /team -- Onboard + Dashboard (Teamwork v3.1)

> Push-based team coordination. Leader creates and assigns MCs, members execute and report.
> **v3.1**: Role-based workflow guidance, suggested next action, local context files.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Auto: first run -> Onboard, subsequent -> Dashboard |
| `help` or `-h` | Show quick-start guide |
| `init` | Force re-initialize (create labels, CI, branch protection) |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
TEAMWORK v3.1 -- Quick Start Guide
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

LOCAL FILES (gitignored, per-user):
  .teamwork/local/my-status.md      Your current status snapshot
  .teamwork/local/workflow-guide.md  Role-specific command reference

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

- If `gh` not installed -> "GitHub CLI (`gh`) is required. Install: <https://cli.github.com/>" -> **STOP**
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
- `conventions.base_branch` (default: `"pre-launch"`)
- `conventions.production_branch` (default: `"product"`)
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
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"
CI_ENABLED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.ci "false" 2>/dev/null)
REVIEW_REQUIRED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.review_required "false" 2>/dev/null)
BRANCH_PROTECTION=$(bash ~/.claude/commands/scripts/tw-config.sh quality.branch_protection "false" 2>/dev/null)
```

If `quality.branch_protection` is `true`:

```bash
PROD_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.production_branch "product" 2>/dev/null)
PROD_BRANCH="${PROD_BRANCH:-product}"

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

# Protect pre-launch (base branch) — accepts MC PRs
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

# Protect product (production branch) — strict, only accepts RC promotes
gh api "repos/$REPO/branches/$PROD_BRANCH/protection" \
  --method PUT \
  --input - <<EOF
{
  "required_status_checks": {"strict": true, "contexts": ["quality"]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 1},
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
  pre-launch: PR required (MC merge target)
  product:    strict (release only via /team-rc)
Milestone:  {version or "none"}

Config:     .teamwork/config.yml
=============================================
Branch model:
  product      <- strict, production
  pre-launch   <- MC PRs merge here
  mission/*    <- feature branches

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

### If found

Extract:

- `role` -- the member's role ID (e.g., `leader`, `backend-engineer`)
- Look up role in `roles:` list to get `level` (leader or member) and `label`

Continue to **Step 4: Dashboard**.

### If NOT found -- Onboard

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

Read GitHub data and display role-appropriate dashboard with workflow guidance.

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
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"
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

⚡ SUGGESTED NEXT ACTION:
  {see logic below}

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

YOUR WORKFLOW (Leader Loop)
─────────────────────────────────────────
  ┌─────────────────────────────────────┐
  │  1. /team          → See dashboard  │
  │  2. /create-mc     → Assign tasks   │
  │  3. (members work...)               │
  │  4. /review-mc     → Review & merge │
  │  └──→ repeat from 1                 │
  └─────────────────────────────────────┘

HOW TO USE (right now):
  • Review queue has items?  → /review-mc
  • Members are idle?       → /create-mc <desc> @member
  • Need a new iteration?   → /create-milestone V0.2 -- desc
  • Need batch planning?    → /create-milestone with MC list

QUICK REFERENCE:
  /create-mc <desc> @user   Create MC and assign to member
  /create-milestone V0.2    Create milestone + batch MCs
  /review-mc                Review queue
  /review-mc approve #42    Approve and merge specific MC
=============================================
Status saved → .teamwork/local/my-status.md
```

**Suggested Next Action logic (Leader):**

1. If review queue has items → "Run `/review-mc` — {N} MC(s) await your review"
2. Else if any member is idle → "Run `/create-mc <description> @{idle_member}` to assign work"
3. Else → "All members are working. Check back later or run `/review-mc` when MCs are submitted."

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

⚡ SUGGESTED NEXT ACTION:
  {see logic below}

ACTIVE:
  #{N} {title} [{priority}] [{status}]
      Branch: mission/{N}-{slug}
      Success Criteria:
        - [ ] Criterion 1
        - [x] Criterion 2

COMPLETED (recent):
  #{N} {title} -- merged {timeago}

MILESTONE: {version} -- {closed}/{total} tasks done ({pct}%)

YOUR WORKFLOW (Member Loop)
─────────────────────────────────────────
  ┌─────────────────────────────────────┐
  │  1. /team          → See my missions│
  │  2. /get-mc        → Get MC details │
  │  3. (code, test, commit)            │
  │  4. /complete-mc   → Submit for     │
  │  │                   review         │
  │  └──→ repeat from 1                 │
  └─────────────────────────────────────┘

HOW TO USE (right now):
  • Have active MCs?     → /get-mc #{N} to see details, then code
  • Finished coding?     → /complete-mc to submit PR for review
  • No assigned MCs?     → Ask your leader to create one for you
  • Want status update?  → /team

QUICK REFERENCE:
  /get-mc               View all my assigned MCs
  /get-mc #42           View details + checkout branch
  /complete-mc          Submit completed MC (push, PR, notify)
  /complete-mc #42      Complete specific MC
=============================================
Status saved → .teamwork/local/my-status.md
```

**Suggested Next Action logic (Member):**

1. If has active MC with `status:wip` → "Continue working on `#{N} {title}`, then run `/complete-mc` when done"
2. If has active MC with `status:review` → "MC `#{N}` is under leader review. Wait for feedback or start another MC if available"
3. If no active MCs → "No assigned missions — ask your leader to create one with `/create-mc`"

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

## Step 5: Generate Local Context Files

> After displaying the dashboard, generate per-user files in `.teamwork/local/` (gitignored).

```bash
mkdir -p .teamwork/local
```

### 5a: Generate `my-status.md`

Write `.teamwork/local/my-status.md` with the following content:

```markdown
# My Status — @{GH_USER}

> Auto-generated by `/team` on {YYYY-MM-DD HH:MM}. Do not commit.

## Identity
- **GitHub**: @{GH_USER}
- **Role**: {role_label} ({level})
- **Team**: {team.name}

## Active Missions
{For each active MC:}
- [ ] #{N} {title} [{priority}] [{status}]
  - Branch: `mission/{N}-{slug}`
  - Milestone: {milestone or "none"}

{If no active MCs: "No active missions."}

## Recently Completed
{For each recently closed MC:}
- [x] #{N} {title} — merged {date}

## Suggested Next Action
{Same logic as dashboard suggested action, written as a sentence}

## Quick Reference
{Role-appropriate commands only}
```

### 5b: Generate `workflow-guide.md`

Write `.teamwork/local/workflow-guide.md` with role-specific content:

**For Leader:**

```markdown
# Workflow Guide — Leader

> Auto-generated by `/team`. Your role-specific reference. Do not commit.

## Your Loop

```

1. /team            → Check dashboard, see who's working, review queue
2. /create-mc       → Create mission and assign to a member
3. (members work on their missions)
4. /review-mc       → Review submitted MCs, approve or request changes
└──→ back to 1

```

## Commands Available to You

| Command | What it does |
|---------|-------------|
| `/team` | Dashboard — team status, review queue, milestone progress |
| `/create-mc <desc> @user` | Create MC and assign to member |
| `/create-milestone V0.2 -- desc` | Create milestone, optionally batch-create MCs |
| `/review-mc` | Show review queue |
| `/review-mc #42` | Review specific MC — view diff + AI analysis |
| `/review-mc approve #42` | Approve and merge MC |
| `/review-mc changes #42` | Request changes, send back to member |

## Common Scenarios

| Situation | Action |
|-----------|--------|
| New iteration starting | `/create-milestone V0.2 -- description` with MC list |
| Need to assign work | `/create-mc fix upload API @yuang-yang` |
| MC submitted for review | `/review-mc` to see queue, then approve/reject |
| Member is blocked | Check their MC, help resolve, or reassign |
| Check progress | `/team` for overview |

## Tips
- Always review promptly — members are blocked until you approve
- Use batch MC creation in `/create-milestone` for sprint planning
- P0 MCs should be reviewed same-day
```

**For Member:**

```markdown
# Workflow Guide — {role_label}

> Auto-generated by `/team`. Your role-specific reference. Do not commit.

## Your Loop

```

1. /team            → Check your missions and what's assigned
2. /get-mc #N       → Read MC details, checkout branch
3. (code, test, commit on the mission branch)
4. /complete-mc     → Push, create PR, notify leader for review
└──→ back to 1

```

## Commands Available to You

| Command | What it does |
|---------|-------------|
| `/team` | Dashboard — your assigned MCs, progress, milestone |
| `/get-mc` | View all your assigned open MCs |
| `/get-mc #42` | View specific MC details + checkout command |
| `/complete-mc` | Submit completed MC — push, PR, notify leader |
| `/complete-mc #42` | Complete specific MC |

## Common Scenarios

| Situation | Action |
|-----------|--------|
| Just joined team | `/team` to onboard, then check for assigned MCs |
| Have a new MC assigned | `/get-mc #N` to see details, then `git checkout mission/N-slug` |
| Ready to submit work | `/complete-mc` — it handles push, PR, and notification |
| Changes requested by leader | Fix issues, then `/complete-mc` again |
| No MCs assigned | Ask your leader to create one with `/create-mc` |

## Tips
- Always rebase on pre-launch before `/complete-mc`
- Check Success Criteria in your MC — those are what the leader reviews against
- Commit format: `type(scope): description | Mission: #N`
- One MC = one branch = one PR
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
- `.teamwork/local/` write fails -> warn but continue (dashboard still shown)
