---
description: "Team dashboard + init. First time? Try: /team help"
version: "3.0.0"
---

# /team — Init + Dashboard (Teamwork v3)

> GitHub-first team coordination. Push-based task assignment with role-based permissions.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Auto: first run → Init, subsequent → Dashboard |
| `#N` or number | Show MC #N details (branch, commits, PRs, criteria) |
| `help` or `-h` | Show quick-start guide for new users |
| `learn` | Show design philosophy, visual diagrams, and manual |
| `init` | Force re-initialize (even if config exists) |
| `queue` | Show all open mission Issues (full list, sorted by priority) |

---

## Route by Argument

Parse `$ARGUMENTS`:
- If `help` or `-h` → jump to **Operation Help**
- If `learn` → jump to **Operation Learn**
- If starts with `#` or is a number → jump to **Operation MC Detail**
- If `init` → jump to **Step 0** (skip config check, force init)
- If `queue` → jump to **Operation Queue**
- If empty → continue to **Step 0** (auto-detect init vs dashboard)

---

## Operation Help

Output the following guide directly to the user, then **STOP**:

```
TEAMWORK v3.0.0 — AI-Native Team Coordination (Push Model)
Author: liyasong + casey | Released: 2026-03-05
═══════════════════════════════════════════

SETUP (one time):
  /team                 Auto-detect project, create config + CI + labels

DAILY WORKFLOW:
  /team                 See role-based dashboard (leader=team view, member=my view)
  /team #42             View MC #42 details (branch, commits, PRs)
  /team-issue <desc>    Create MC (solo: self-assign; team: prompt for assignee)
  /team-issue <desc> @user  Create MC + assign to @user
  /team-issue batch ... Batch create milestone + multiple MCs
  /team-claim #N        Claim assigned Issue → generate Contract + branch
  /team-claim list      Browse my assigned missions
  /team-drive           Execute mission (sub-tasks → test → commit loop)
  /team-ship            Push + create PR (auto-closes Issue on merge)
  /team-ship review     AI code review on PR

AFTER MERGE:
  /team-ship done       Close Issue, update labels, clean up
  /team-ship sync       Rebase branch on latest base branch

RC LIFECYCLE:
  /team-rc              Prepare: cut rc branch from develop → staging
  /team-rc promote      Promote: squash merge rc → main, tag, GitHub Release

LIFECYCLE (Push Model):
  /team-issue → assigns @member → Issue + branch created
  /team-claim #N → Contract → /team-drive → /team-ship → PR
  /team-rc → staging → /team-rc promote → production

  Any team member can create Issues and assign to anyone.
  Solo projects (1 member) auto-assign to self.

CONFIG:
  .teamwork/config.yml  (or .teamspace/config.yml)
  Edit roles, members, notifications, quality gates directly.

REQUIREMENTS:
  gh (GitHub CLI)       gh auth login
  git remote            git remote add origin <url>
═══════════════════════════════════════════
```

---

## Operation Learn

Read and present the design philosophy behind this workflow. Output the content from the manual with visual diagrams, then **STOP**.

### Step L1: Locate manual files

```bash
# Check for manual files in docs/ (erwin-managed repos)
# or in .teamwork/docs/ or .teamspace/docs/ (standalone repos)
MANUAL=""
GIT_MODEL=""

for dir in docs .teamwork/docs .teamspace/docs; do
  [ -f "$dir/teamwork-ai-manual.md" ] && MANUAL="$dir/teamwork-ai-manual.md"
  [ -f "$dir/git-model-v0.1.0.md" ] && GIT_MODEL="$dir/git-model-v0.1.0.md"
done
```

### Step L2: Present content

**If `MANUAL` found** → Read the file and present its full content to the user. This file contains:
- Why this model exists (AI commit frequency problem)
- The Four Branches diagram
- Why squash everything
- RC lifecycle (the key innovation)
- Complete end-to-end example
- The Six Skills overview

**If `GIT_MODEL` also found** → Mention it as deeper technical reference:
```
For the formal Git branching spec, see: {GIT_MODEL}
```

**If neither found** → Output the embedded overview below and **STOP**:

```
TEAMWORK — Design Philosophy
═══════════════════════════════════════════

WHY THIS MODEL?

Traditional teams: 6 people, manageable commit frequency.
Our reality: 6 people + AI assistants = 20-30x commit frequency.

Problem with simple model (GitHub Flow):

main ── feat/A ── feat/B ── feat/C ── feat/D ── feat/E ──►
        (merge)   (merge)   (merge)   (merge)   (merge)

        ↑ deploy staging here
        │ while verifying, D and E merge in
        │ deploy again → F and G merge in
        └── you can never verify a stable snapshot

Solution: separate dirty work (develop) from clean production (main).

develop ── A ── B ── C ── D ── E ──►     ← AI noise goes here
                        │
                   rc/V0.1.0              ← frozen snapshot
                        │
main ────────────── [V0.1.0] ──►          ← only verified code

THE FOUR BRANCHES:

┌──────────┬──────────────┬───────────────────────┬───────────────────┐
│ Branch   │ Role         │ Who writes to it      │ How clean?        │
├──────────┼──────────────┼───────────────────────┼───────────────────┤
│ main     │ Production   │ Only rc/* via PR      │ Always clean      │
│ develop  │ Dev trunk    │ All feature PRs       │ CI-verified       │
│ rc/*     │ Staging      │ Hotfixes only         │ Converging        │
│ feat/*   │ Work         │ You                   │ Dirty             │
└──────────┴──────────────┴───────────────────────┴───────────────────┘

WHY SQUASH EVERYTHING?

AI generates dozens of commits per feature. These are machine noise:

  Without squash:  fix typo → WIP → try approach → revert → fix → forgot save
  With squash:     feat: user login system (#42)

RC LIFECYCLE (the key innovation):

  /team-rc           → cut rc/V0.1.0 from develop (frozen)
  verify on staging  → hotfix if needed (cherry-pick to develop)
  /team-rc promote   → squash merge rc → main, tag V0.1.0, GitHub Release

  Think of RC as a bus: missed this one? Take the next one.
  Buses come frequently.

DAILY FLOW:

  /team-issue "用户登录"     → Issue #42
  /team-claim 42             → Branch from develop
  /team-drive                → Code, test, commit
  /team-ship                 → PR → develop (squash)
  /team-rc                   → Cut RC → staging
  /team-rc promote           → Ship to production

═══════════════════════════════════════════
Full manual: docs/teamwork-ai-manual.md
Git model:   docs/git-model-v0.1.0.md
═══════════════════════════════════════════
```

---

## Operation Queue

Show the full list of open mission issues, sorted by priority. Requires existing config (same prerequisite check as dashboard).

### Prerequisite: config detection

```bash
if [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
else
  echo "No teamwork config found. Run /team init first."
  # STOP
fi
```

### Fetch and display

```bash
# Read mission label + priority prefix from config
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh github.mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"

STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"

PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.priority "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.priority_prefix "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX="priority:"

# Fetch all open mission issues
gh issue list --label "$MISSION_LABEL" --state open --json number,title,labels,assignees --limit 100
```

Sort by priority: P0 first → P1 → P2 → P3 → no priority last. Show assignee for each.

Output formatted list:

```
OPEN MISSIONS — {repo name} ({total} issues)
════════════════════════════════════════════

P0 (critical):
  #{N} {title} [@{assignee} | unassigned]

P1 (high):
  #{N} {title} [@{assignee} | unassigned]

P2 (medium):
  #{N} {title} [@{assignee} | unassigned]

P3 (low):
  #{N} {title} [@{assignee} | unassigned]

No priority:
  #{N} {title} [@{assignee} | unassigned]

════════════════════════════════════════════
Details: /team #{N}
Claim:   /team-claim #{N}
```

Omit priority groups that have zero issues. Then **STOP**.

---

## Operation MC Detail

> Triggered by `/team #42` or `/team 42`. Shows full details of a Mission Contract.

### MD1: Parse Issue number

Extract the numeric Issue number from `$ARGUMENTS` (strip `#` prefix if present).

### MD2: Fetch Issue data

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
ISSUE_DATA=$(gh issue view $ISSUE_NUMBER --json number,title,body,labels,milestone,assignees,state,url)
```

If Issue not found → "Issue #$ISSUE_NUMBER not found." → **STOP**

### MD3: Compute branch and check remote

```bash
# Read branch pattern from config
BRANCH_PATTERN=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.branch_pattern "" 2>/dev/null)
if [ -z "$BRANCH_PATTERN" ]; then
  BRANCH_PATTERN="mission/{issue}-{slug}"
fi

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"

# Search for branch matching this Issue number
BRANCH=$(git ls-remote --heads origin "mission/${ISSUE_NUMBER}-*" 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||' | head -1)

# If branch exists, get commit log
if [ -n "$BRANCH" ]; then
  COMMITS=$(git log "origin/$BASE_BRANCH..origin/$BRANCH" --oneline 2>/dev/null || echo "(fetch needed)")
fi

# Find related PRs
RELATED_PRS=$(gh pr list --search "Closes #$ISSUE_NUMBER" --state all --json number,url,state,statusCheckRollup --limit 5 2>/dev/null)
```

### MD4: Format and display

```
MISSION CONTRACT — #{ISSUE_NUMBER}
═══════════════════════════════════
Title:     {title}
Assignee:  @{assignee}
Status:    {status label, e.g., wip/review/done}
Priority:  {Pn from labels}
Milestone: {milestone title or "none"}
URL:       {issue url}
─────────────────────────────────
{Full Issue body}
─────────────────────────────────
BRANCH: {branch or "not found"}
  Remote: {exists/not found}
  Commits: {commit log or "no commits yet"}
RELATED PRs: {list with state and CI status}
═══════════════════════════════════
```

If branch exists and user is not currently on it, show:
```
Hint: git checkout {branch}
      or /team-claim #{ISSUE_NUMBER} to generate Contract
```

Then **STOP**.

---

## Step 0: Prerequisites

```bash
# Check gh CLI
gh --version 2>/dev/null || echo "GH_MISSING"

# Check git remote
git remote get-url origin 2>/dev/null || echo "NO_REMOTE"
```

- If `gh` not installed → "GitHub CLI (`gh`) is required. Install: https://cli.github.com/" → **STOP**
- If no git remote → "This is not a GitHub-linked repository. Run `git remote add origin <url>` first." → **STOP**

```bash
# Get identity
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
```

- If `gh api user` fails → "Not authenticated. Run `gh auth login` first." → **STOP**

```bash
# Get repo info
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
```

---

## Step 1: Route — Init or Dashboard?

```bash
# Force init if $ARGUMENTS == "init"
if [ "$ARGUMENTS" = "init" ]; then
  echo "INIT"
  # Preserve existing TEAMWORK_DIR if config found
  if [ -f .teamwork/config.yml ]; then
    TEAMWORK_DIR=".teamwork"
  elif [ -f .teamspace/config.yml ]; then
    TEAMWORK_DIR=".teamspace"
  else
    TEAMWORK_DIR=".teamwork"
  fi
else
  # Auto-detect: config exists → dashboard, otherwise → init
  if [ -f .teamwork/config.yml ]; then
    echo "DASHBOARD"
    TEAMWORK_DIR=".teamwork"
  elif [ -f .teamspace/config.yml ]; then
    echo "DASHBOARD"
    TEAMWORK_DIR=".teamspace"
  else
    echo "INIT"
    TEAMWORK_DIR=".teamwork"
  fi
fi
```

- If `DASHBOARD` → Continue to **Step 1b: Check Membership**
- If `INIT` → Jump to **Step 2: Initialize** (Step 4b merge mode handles existing config)

**Note**: Both `.teamwork/` and `.teamspace/` are supported as config directories. The system uses whichever exists. New installations default to `.teamwork/`.

---

## Step 1b: Check Membership

Read the config and check if `GH_USER` is in the team roster.

**Config format detection** (handle three schemas):
- If config has `members:` section → use it (v3 format + `.teamspace` format: `members:` is the member list)
- Else if config has `team:` as an ARRAY of `{github, role}` → use it (erwin v2 format, backward compat)
- Note: `.teamspace` configs have `team:` as metadata `{name, repo}`, NOT a member list — always check `members:` first
- **Role lookup**: If config has `roles:` section, look up the user's `role` value in `roles:` to find their `level` (leader/member). If no `roles:` section exists, treat everyone as leader (backward compat with schema v1).

Look for `github: {GH_USER}` (erwin) or `github: {GH_USER}` + `id: {GH_USER}` (.teamspace) in the member list.

If `GH_USER` is found in roster → Jump to **Step 1c: Config Health Check**

If `GH_USER` is NOT in roster → **onboard new member:**

1. Welcome message: "Welcome! You ({GH_USER}) are not yet in the team roster."

2. Read available roles from config:
   - If config has `roles:` section → list role options from there
   - If config has `team:` section → extract unique roles already in use, offer those + "Other"
   - If no roles defined → ask freeform

3. Use `AskUserQuestion` to pick a role:
   ```
   question: "What's your role on this team?"
   options:
     {For each role in config's roles section:}
     - label: "{role.label}"
       description: "{role.description}"
   ```

4. Add the user to config:
   - For erwin v2 format (`team:` section): append new entry
     ```yaml
     - github: {GH_USER}
       role: {selected_role_id}
     ```
   - For .teamspace format (`members:` section): append new entry
     ```yaml
     - id: {GH_USER}
       name: "{GH_USER}"
       role: {selected_role_id}
       github: {GH_USER}
     ```

5. Commit the config change:
   ```bash
   git add $TEAMWORK_DIR/config.yml
   git commit -m "feat(teamwork): add {GH_USER} as {role} to team roster"
   git push
   ```

6. Output: "Added you to the team as **{role.label}**. Showing dashboard..."

7. Continue to **Step 1c: Config Health Check**

---

## Step 1c: Config Health Check

After confirming membership, verify that the config has the fields needed by other skills. Check for:

| Field | Used by | Default if missing |
|-------|---------|-------------------|
| `project.test_command` | team-drive, team-ship | warn "No test command" |
| `project.lint_command` | git hooks | warn "No lint command" |
| `conventions.branch_pattern` | team-claim | `"mission/{issue}-{slug}"` |
| `conventions.base_branch` | team-claim, team-ship, team-drive | `"pre-launch"` |
| `conventions.production_branch` | team-rc, protect-check | `"main"` |
| `deploy.staging_workflow` | team-rc | `""` (skip staging check) |
| `label_prefix` or `github.label_prefix` | all skills, post-merge Action | `status:`, `priority:` |

If critical fields are missing (no `project:` section at all, no `conventions.branch_pattern`), output a warning:

```
⚠ Config is missing some fields used by teamwork skills:
  - project.test_command: tests won't run during /team-drive and /team-ship
  - conventions.branch_pattern: will use default "mission/{issue}-{slug}"
  Tip: run /team init to regenerate a complete config.
```

This is a **non-blocking warning** — continue to **Step 6: Dashboard**.

---

## Step 2: Detect Project

Auto-detect language and tooling by checking for marker files.

**First, check root-level markers:**

| Marker File | Language | Test | Lint | Build |
|-------------|----------|------|------|-------|
| `package.json` | Node/TypeScript | `npm test` | `npm run lint` | `npm run build` |
| `pyproject.toml` or `setup.py` | Python | `pytest` | `ruff check .` | `python -m build` |
| `go.mod` | Go | `go test ./...` | `golangci-lint run` | `go build ./...` |
| `Cargo.toml` | Rust | `cargo test` | `cargo clippy` | `cargo build` |
| `pom.xml` or `build.gradle` | Java | `mvn test` | — | `mvn package` |

```bash
ls package.json pyproject.toml setup.py go.mod Cargo.toml pom.xml build.gradle 2>/dev/null
```

**If no root markers found, check for monorepo structure:**

```bash
# Scan one level deep for service directories with their own marker files
ls */package.json */pyproject.toml */setup.py */go.mod */Cargo.toml */requirements.txt 2>/dev/null
```

If multiple services found → this is a **monorepo**. Set `IS_MONOREPO=true` and detect EACH service:

```bash
# For each subdirectory with a marker file, detect its language
for dir in */; do
  if [ -f "$dir/package.json" ]; then
    echo "$dir: node"
  elif [ -f "$dir/pyproject.toml" ] || [ -f "$dir/requirements.txt" ]; then
    echo "$dir: python"
  elif [ -f "$dir/go.mod" ]; then
    echo "$dir: go"
  fi
done
```

For monorepos, store a `services` list with per-service language/commands. The primary language is the most common one across services. Test/lint/build commands should reference the monorepo structure (e.g., `cd api-server && pytest`).

Store detected `LANGUAGE`, `TEST_CMD`, `LINT_CMD`, `BUILD_CMD`, and optionally `IS_MONOREPO`, `SERVICES[]`.

**If root-level `package.json` exists, also check for scripts:**
```bash
node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{}))" 2>/dev/null
```
Use actual script names (e.g., `npm run test`, `npm run lint`) if they exist.

---

## Step 3: Interactive Team Configuration

Use `AskUserQuestion` to configure the team.

**Question 1: Team Members**

```
question: "Who are the team members? (Enter GitHub usernames, comma-separated)"
options:
  - label: "Just me"
    description: "Solo project with teamwork structure for task tracking"
  - label: "2-3 people"
    description: "Small team. I'll list GitHub usernames."
  - label: "4-5 people"
    description: "Medium team. I'll list GitHub usernames."
```

If team members selected, ask for usernames + roles via follow-up AskUserQuestion.

**Question 2: Quality preferences**

```
question: "Which quality gates do you want?"
multiSelect: true
options:
  - label: "Git hooks (pre-commit + pre-push)"
    description: "Local quality gates: lint on commit, test on push"
  - label: "GitHub Actions CI"
    description: "Remote quality gates: lint + test + build on every PR"
  - label: "Branch protection"
    description: "Require CI pass + PR review before merge to base branch"
  - label: "All of the above (Recommended)"
    description: "Full defense-in-depth: hooks + Actions + branch protection"
```

**Question 3: Development isolation** (optional — ask if team size > 1)

```
question: "Development isolation strategy?"
options:
  - label: "Branch only (Recommended)"
    description: "Simple branching — one working copy, switch between branches"
  - label: "Git worktree"
    description: "Parallel development — each mission gets its own working directory"
```

If "Git worktree" selected → set `worktree.enabled: true` in config.

---

## Step 4: Generate Files

### 4a: Create directory structure

```bash
mkdir -p $TEAMWORK_DIR/active .github/ISSUE_TEMPLATE .github/workflows .githooks
```

(Where `$TEAMWORK_DIR` is `.teamwork` for new installations, or whichever was detected in Step 1.)

### 4b: Write `$TEAMWORK_DIR/config.yml`

**First, check if config.yml already exists:**

```bash
ls $TEAMWORK_DIR/config.yml 2>/dev/null
```

---

#### MERGE MODE (config exists)

Preserve all existing content. Only update `skill_version` and append missing top-level sections.

**Step 1 — Update skill_version and schema_version in place:**

```bash
# Update skill_version line without touching anything else
sed -i '' "s/^skill_version:.*/skill_version: 3.0.0/" $TEAMWORK_DIR/config.yml
# Linux fallback: sed -i "s/^skill_version:.*/skill_version: 3.0.0/" $TEAMWORK_DIR/config.yml

# Update schema_version if present
if grep -q "^schema_version:" $TEAMWORK_DIR/config.yml; then
  sed -i '' "s/^schema_version:.*/schema_version: 3/" $TEAMWORK_DIR/config.yml
else
  # Prepend schema_version before skill_version
  sed -i '' "/^skill_version:/i\\
schema_version: 3" $TEAMWORK_DIR/config.yml
fi
```

**Step 2 — Detect which top-level sections are missing:**

```bash
# Detect missing top-level sections (no PyYAML dependency — pure grep)
for section in project conventions label_prefix quality roles members notifications; do
  if [ "$section" = "label_prefix" ]; then
    # Accept either label_prefix: or labels: (vi_agent schema compat)
    grep -q "^label_prefix:\|^labels:" $TEAMWORK_DIR/config.yml || echo "$section"
  else
    grep -q "^${section}:" $TEAMWORK_DIR/config.yml || echo "$section"
  fi
done
```

**Step 3 — Append only missing sections to the file:**

For each missing section, append the appropriate YAML block. Use the project info detected in Step 2 and answers from Step 3.

Standard section templates to append as needed:

```yaml
# Appended by /team init upgrade
project:
  language: {LANGUAGE}
  test_command: "{TEST_CMD}"
  lint_command: "{LINT_CMD}"
  build_command: "{BUILD_CMD}"
```

```yaml
conventions:
  branch_pattern: "{type}/{task-id}-{slug}"
  base_branch: develop
  production_branch: main
  commit_format: "type(scope): description | Mission: #{issue}"
```

```yaml
label_prefix:
  status: "status:"
  priority: "priority:"
  size: "size:"
```

```yaml
quality:
  hooks: {true/false from Step 3}
  ci: {true/false from Step 3}
  review_required: {true/false from Step 3}
  branch_protection: {true/false from Step 3}
```

```yaml
roles:
  - id: leader
    level: leader
    label: "Tech Lead"
    description: "Task creation, review, release"
  - id: engineer
    level: member
    label: "Engineer"
    description: "Feature development"
```

```yaml
members:
  - github: {GH_USER}
    name: "{GH_USER}"
    role: leader
```

```yaml
notifications:
  enabled: false
  channels:
    - type: slack
      channel: "#team"
      webhook: ""
      enabled: false
    - type: feishu
      webhook: ""
      enabled: false
  events:
    mc.created: [slack, feishu]
    mc.completed: [slack, feishu]
    milestone.created: [slack, feishu]
    milestone.done: [slack, feishu]
```

**Step 4 — Show merge summary:**

```
✅ Config updated (merge mode — existing config preserved)
   schema_version → 3 | skill_version → 3.0.0
   Preserved sections: {list of sections kept}
   Added sections: {list of sections appended, or "(none — already complete)"}
```

Do NOT overwrite `team`/`members`, `github`, `worktree`, `versions`, `roles`, `notifications`, or any unrecognized section.

---

#### FRESH INSTALL (config does not exist)

Write full config based on detected project info + user answers:

```yaml
schema_version: 3
skill_version: 3.0.0

roles:
  - id: leader
    level: leader
    label: "Tech Lead"
    description: "Task creation, assignment, review, release"
  - id: engineer
    level: member
    label: "Engineer"
    description: "Feature development"

members:
  - github: {GH_USER}
    name: "{GH_USER}"
    role: leader
  # ... additional members from Step 3

project:
  language: {LANGUAGE}
  test_command: "{TEST_CMD}"
  lint_command: "{LINT_CMD}"
  build_command: "{BUILD_CMD}"
  # Optional: monorepo services (enables per-service testing in /team-drive, /team-ship)
  # services:
  #   - name: api
  #     path: api/
  #     language: python
  #     test_command: "cd api && pytest"
  #     lint_command: "cd api && ruff check ."
  #   - name: web
  #     path: web/
  #     language: node
  #     test_command: "cd web && npm test"
  #     lint_command: "cd web && npm run lint"

conventions:
  branch_pattern: "{type}/{task-id}-{slug}"
  base_branch: develop
  production_branch: main
  commit_format: "type(scope): description | Mission: #{issue}"

# Optional: Deployment pipeline (required for staging gate in /team-rc)
# deploy:
#   staging_workflow: "deploy-staging.yml"  # GitHub Actions workflow name

label_prefix:
  status: "status:"
  priority: "priority:"
  size: "size:"

quality:
  hooks: {true/false from Step 3}
  ci: {true/false from Step 3}
  review_required: {true/false from Step 3}
  branch_protection: {true/false from Step 3}

notifications:
  enabled: false
  channels:
    - type: slack
      channel: "#team"
      webhook: ""
      enabled: false
    - type: feishu
      webhook: ""
      enabled: false
  events:
    mc.created: [slack, feishu]
    mc.completed: [slack, feishu]
    milestone.created: [slack, feishu]
    milestone.done: [slack, feishu]

# Optional: Git worktree isolation (from Question 3)
# worktree:
#   enabled: true
#   path_pattern: "../{repo}-wt-{slug}"

# Optional: Version tracking (required for /team-rc)
# versions:
#   current: "V1.0"
#   spec_path: ".claude/drive/v1.0-definition/spec.md"  # optional: enables AI audit in /team-rc
#   lifecycle: [dev, qa, released]
```

If worktree was selected in Question 3, uncomment and enable the `worktree` section.
If the project uses version tracking, uncomment and configure the `versions` section.

### 4c: Write `.github/ISSUE_TEMPLATE/mission.yml`

**First, check if Issue template already exists:**

```bash
ls .github/ISSUE_TEMPLATE/mission*.yml 2>/dev/null
```

If exists → read it, ask user whether to keep or regenerate (same as CI detection).

If not exists → generate.

**Read `mc_label` from config** (default: `"mission"`). Use this value in the template labels:

```yaml
name: Mission Contract
description: Structured task for team execution
labels: ["{MISSION_LABEL}", "{STATUS_PREFIX}wip"]
body:
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0 (critical)
        - P1 (high)
        - P2 (medium)
        - P3 (low)
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Estimated Size
      options:
        - S (1-2 hours)
        - M (half-day to 1 day)
        - L (2-3 days)
        - XL (needs splitting)
    validations:
      required: true

  - type: textarea
    id: objective
    attributes:
      label: Objective
      description: What needs to be accomplished?
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Success Criteria
      description: What must be true for this mission to be DONE? Use checkboxes.
      placeholder: |
        - [ ] Criterion 1 — concrete, verifiable
        - [ ] Criterion 2 — ...
    validations:
      required: true

  - type: textarea
    id: subtasks
    attributes:
      label: Sub-tasks
      description: Break down the work into specific steps.
      placeholder: |
        - [ ] Step 1
        - [ ] Step 2
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Context & References
      description: Relevant files, docs, links, related issues.
      placeholder: "Relevant files: src/..., Related to #..."

  - type: textarea
    id: constraints
    attributes:
      label: Constraints
      description: Any limitations, dependencies, or things NOT to do.
      placeholder: "Must not break existing API..."

  - type: textarea
    id: verification
    attributes:
      label: Verification Method
      description: How to verify this mission is complete (test commands, manual checks).
      placeholder: |
        ```bash
        npm test -- --grep auth
        ```
```

### 4d: Write `.github/workflows/ci.yml`

**First, check if CI already exists:**

```bash
ls .github/workflows/ci.yml .github/workflows/CI.yml .github/workflows/*.yml 2>/dev/null
```

- If `.github/workflows/ci.yml` (or similar) already exists → **DO NOT overwrite**. Read the existing file, display a summary, and ask: "CI workflow already exists. Keep existing? Or regenerate?" (via AskUserQuestion). If the user keeps existing, skip to Step 4e.
- If no CI workflow exists → generate based on detected language.

**Branch triggers**: Use `{BASE_BRANCH}` from config (not hardcoded `main`). In dual-branch mode (when `RELEASE_BRANCH != BASE_BRANCH`), include both branches in `push` triggers so CI runs on release branch merges too:

```yaml
# Single-branch mode (default):
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]

# Dual-branch mode (RELEASE_BRANCH configured):
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}, {RELEASE_BRANCH}]
```

**For monorepo projects** (`IS_MONOREPO=true`), generate a multi-service CI that runs each service's checks in a separate job:

```yaml
name: CI
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]  # add {RELEASE_BRANCH} if dual-branch mode

jobs:
  # One job per detected service
  {service-name}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - # language-specific setup
      - run: cd {service-dir} && {lint-cmd}
      - run: cd {service-dir} && {test-cmd}
```

**For single-language projects**, generate based on detected language:

**Node/TypeScript:**
```yaml
name: CI
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: {LINT_CMD}
      - run: {TEST_CMD}
      - run: {BUILD_CMD}
```

**Python:**
```yaml
name: CI
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -e ".[dev]"
      - run: {LINT_CMD}
      - run: {TEST_CMD}
```

**Go:**
```yaml
name: CI
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: stable
      - run: {LINT_CMD}
      - run: {TEST_CMD}
      - run: {BUILD_CMD}
```

For other languages or if language not detected, generate a minimal workflow with just checkout and a comment explaining what to add.

### 4e: Write `.github/workflows/post-merge.yml`

**First, check if post-merge workflow already exists:**

```bash
ls .github/workflows/post-merge.yml 2>/dev/null
```

- If exists → read, ask "Keep existing? Or regenerate?" (same pattern as ci.yml)
- If not exists → generate:

Read label prefixes from config for substitution:

```bash
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
```

```yaml
name: Post-Merge Cleanup
on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Update linked Issues
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.pull_request.body || '';
            // Match all GitHub-recognized closing keywords
            const pattern = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
            const numbers = [...new Set(
              [...body.matchAll(pattern)].map(m => parseInt(m[1], 10))
            )];

            for (const num of numbers) {
              console.log(`Processing Issue #${num}`);

              // 1. Update labels: remove wip/review → add done
              const statusLabels = ['{STATUS_PREFIX}wip', '{STATUS_PREFIX}review'];
              for (const label of statusLabels) {
                try {
                  await github.rest.issues.removeLabel({
                    ...context.repo, issue_number: num, name: label
                  });
                } catch (e) { /* label might not exist */ }
              }
              await github.rest.issues.addLabels({
                ...context.repo, issue_number: num, labels: ['{STATUS_PREFIX}done']
              });

              // 2. Check all checkboxes in Issue body
              const issue = await github.rest.issues.get({
                ...context.repo, issue_number: num
              });
              if (issue.data.body) {
                const updated = issue.data.body.replace(/- \[ \]/g, '- [x]');
                if (updated !== issue.data.body) {
                  await github.rest.issues.update({
                    ...context.repo, issue_number: num, body: updated
                  });
                  console.log(`Checked ${(issue.data.body.match(/- \[ \]/g) || []).length} checkboxes`);
                }
              }

              // 3. Check milestone completion
              // Race condition: GitHub may not have processed "Closes #N" yet,
              // so milestone.open_issues count may be stale. Instead, query
              // actual open issues and exclude the one we're closing.
              if (issue.data.milestone) {
                const openInMs = await github.rest.issues.listForRepo({
                  ...context.repo,
                  milestone: issue.data.milestone.number,
                  state: 'open',
                  per_page: 5
                });
                const othersOpen = openInMs.data.filter(i => i.number !== num);
                if (othersOpen.length === 0) {
                  const total = issue.data.milestone.closed_issues + issue.data.milestone.open_issues;
                  await github.rest.issues.createComment({
                    ...context.repo, issue_number: num,
                    body: `🎉 Milestone **${issue.data.milestone.title}** is now 100% complete (${total} issues). Ready for \`/team-rc\`.`
                  });
                }
              }
            }

            if (numbers.length === 0) {
              console.log('No closing keywords found in PR body — skipping cleanup');
            }
```

**Note**: `{STATUS_PREFIX}` is substituted at generation time with the value from config (default: `status:`). This means the generated workflow contains literal strings like `status:wip`, not template variables.

### 4f: Write git hooks (if enabled)

**`.githooks/pre-commit`:**
```bash
#!/bin/bash
# Teamwork v3 — local quality gate (fast)
set -e
CONFIG="$([ -f .teamwork/config.yml ] && echo .teamwork/config.yml || echo .teamspace/config.yml)"
[ -f "$CONFIG" ] || exit 0
LINT_CMD=$(grep -v '^\s*#' "$CONFIG" | grep 'lint_command:' | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | sed 's/ *#.*//' | tr -d '"')
if [ -n "$LINT_CMD" ]; then
  echo "Running lint..."
  eval "$LINT_CMD"
fi
```

**`.githooks/pre-push`:**
```bash
#!/bin/bash
# Teamwork v3 — local quality gate (thorough)
set -e
CONFIG="$([ -f .teamwork/config.yml ] && echo .teamwork/config.yml || echo .teamspace/config.yml)"
[ -f "$CONFIG" ] || exit 0
TEST_CMD=$(grep -v '^\s*#' "$CONFIG" | grep 'test_command:' | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | sed 's/ *#.*//' | tr -d '"')
if [ -n "$TEST_CMD" ]; then
  echo "Running tests..."
  eval "$TEST_CMD"
fi
```

Make hooks executable:
```bash
chmod +x .githooks/pre-commit .githooks/pre-push
```

Configure git to use local hooks:
```bash
git config core.hooksPath .githooks
```

### 4g: Update `.gitignore`

Append if not already present:
```
# Teamwork ephemeral contracts
.teamwork/active/
.teamspace/active/
```

---

## Step 5: Configure GitHub

### 5a: Create labels

Use the `setup-github-labels.sh` script installed with teamwork:

```bash
# Preferred: use installed script (reads config for prefixes, idempotent)
bash ~/.claude/commands/scripts/setup-github-labels.sh
```

If the script is not available (e.g., installed without scripts):
```bash
# Fallback: inline label creation (read prefixes from config)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.priority "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.priority_prefix "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX="priority:"

gh label create "$MISSION_LABEL" --color 0075ca --description "Team mission" --force
gh label create "${STATUS_PREFIX}queued" --color c2e0c6 --description "Ready to be claimed" --force
gh label create "${STATUS_PREFIX}wip" --color fbca04 --description "Currently being worked on" --force
gh label create "${STATUS_PREFIX}review" --color 7057ff --description "PR open, awaiting merge" --force
gh label create "${STATUS_PREFIX}done" --color 0e8a16 --description "Completed" --force
gh label create "${STATUS_PREFIX}blocked" --color d73a4a --description "Blocked by dependency" --force
gh label create "${PRIORITY_PREFIX}P0" --color d73a4a --description "Critical priority" --force
gh label create "${PRIORITY_PREFIX}P1" --color e4e669 --description "High priority" --force
gh label create "${PRIORITY_PREFIX}P2" --color 0e8a16 --description "Medium priority" --force
gh label create "${PRIORITY_PREFIX}P3" --color cfd3d7 --description "Low priority" --force
```

If `versions.current` is set in config, also create the milestone via GitHub API (not a label — use Milestones).

### 5b: Repository merge settings

Configure merge strategy and branch cleanup at the repo level:

```bash
gh api "repos/$REPO" --method PATCH \
  --field delete_branch_on_merge=true \
  --field allow_squash_merge=true \
  --field allow_merge_commit=false \
  --field allow_rebase_merge=false \
  --field allow_auto_merge=true \
  --field squash_merge_commit_title=PR_TITLE \
  --field squash_merge_commit_message=PR_BODY
```

- `delete_branch_on_merge` — auto-delete feature branch after PR merge (no stale branches)
- `allow_squash_merge` only — one Issue = one squash commit on base branch, clean history
- `squash_merge_commit_message=PR_BODY` — preserves `Closes #N` so Issue auto-closes on merge

If API fails (permissions) → warn but continue. These can be set manually in GitHub Settings → General.

### 5b2: Ensure develop branch exists

If `base_branch` is not the current default branch (i.e., config says `develop` but repo only has `main`), create it:

```bash
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "develop" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-develop}"

# Check if base branch exists on remote
if ! git ls-remote --heads origin "$BASE_BRANCH" | grep -q "$BASE_BRANCH"; then
  # Create develop from current main
  git checkout -b "$BASE_BRANCH"
  git push -u origin "$BASE_BRANCH"
  echo "Created $BASE_BRANCH branch from $(git branch --show-current)"
fi

# Set develop as GitHub default branch (so PRs target it by default)
gh api "repos/$REPO" --method PATCH --field default_branch="$BASE_BRANCH"
```

If the branch already exists, skip. If API fails, warn but continue.

### 5b3: Ensure production branch exists

If `production_branch` differs from `base_branch` and doesn't exist on remote, create it from the current default branch (usually `main`):

```bash
PROD_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.production_branch "main" 2>/dev/null)
PROD_BRANCH="${PROD_BRANCH:-main}"

if [ "$PROD_BRANCH" != "$BASE_BRANCH" ]; then
  if ! git ls-remote --heads origin "$PROD_BRANCH" | grep -q "$PROD_BRANCH"; then
    # Create production branch from main (or current default)
    DEFAULT_BRANCH=$(gh api "repos/$REPO" --jq '.default_branch' 2>/dev/null || echo "main")
    git fetch origin "$DEFAULT_BRANCH"
    git branch "$PROD_BRANCH" "origin/$DEFAULT_BRANCH"
    git push -u origin "$PROD_BRANCH"
    echo "Created $PROD_BRANCH branch from $DEFAULT_BRANCH"
  fi
fi
```

If the branch already exists, skip.

### 5c: Branch protection (if enabled)

Read config flags to build the protection rule dynamically:

```bash
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "develop" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-develop}"
PROD_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.production_branch "main" 2>/dev/null)
PROD_BRANCH="${PROD_BRANCH:-main}"

# Read quality flags — protection rule adapts to team's config
CI_ENABLED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.ci "false" 2>/dev/null)
REVIEW_REQUIRED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.review_required "false" 2>/dev/null)

# Build status checks: null if CI not enabled, "quality" context if enabled
if [ "$CI_ENABLED" = "true" ]; then
  STATUS_CHECKS='"required_status_checks": {"strict": true, "contexts": ["quality"]}'
else
  STATUS_CHECKS='"required_status_checks": null'
fi

# Build review requirement: 1 if review_required, 0 if not (still requires PR, blocks direct push)
if [ "$REVIEW_REQUIRED" = "true" ]; then
  REVIEW_COUNT=1
else
  REVIEW_COUNT=0
fi
```

Apply protection to base branch:

```bash
# Protect base branch (where PRs merge)
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

Also protect production branch (main):

```bash
if [ "$PROD_BRANCH" != "$BASE_BRANCH" ]; then
  gh api "repos/$REPO/branches/$PROD_BRANCH/protection" \
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
fi
```

**Config → Protection mapping:**

| `quality.ci` | `quality.review_required` | Result |
|---|---|---|
| true | true | CI must pass + 1 reviewer required |
| true | false | CI must pass + PR required (no reviewer) |
| false | true | No CI check + 1 reviewer required |
| false | false | No CI check + PR required (blocks direct push + force push) |

If branch protection fails (e.g., free plan limitations), warn but continue — it's not a blocker.

---

### 5d: Commit and Push

```bash
git add $TEAMWORK_DIR/config.yml .github/ .githooks/ .gitignore
git commit -m "feat(teamwork): initialize GitHub-first teamwork v3

Generate config (schema v3), CI workflow, Issue template, git hooks.
Team: {member list}"
git push
```

Output: "Teamwork initialized! Next: create Issues using the Mission template, then `/team-claim` to start working."

---

## Step 6: Dashboard

Read data from GitHub and config, then display a role-based formatted dashboard.

### 6a: Read config + determine role
```bash
cat $TEAMWORK_DIR/config.yml
```

**Determine current user's role level:**
```bash
# Count members
MEMBER_COUNT=$(grep -c "github:" $TEAMWORK_DIR/config.yml 2>/dev/null || echo "1")

# Solo mode: if only 1 member, show unified dashboard (no role distinction)
if [ "$MEMBER_COUNT" -le 1 ]; then
  USER_LEVEL="solo"
else
  # Find user's role in members, look up level in roles
  # If config has roles: section → find user's role id → find role's level
  # If no roles: section → treat everyone as leader (backward compat with schema v1)
  USER_ROLE=$(# find GH_USER in members, get their role value)
  USER_LEVEL=$(# find that role id in roles, get its level — "leader" or "member")
  # If roles: section doesn't exist, USER_LEVEL="leader" (backward compat)
fi
```

### 6b: Check Issue freshness for active Contracts

For each `$TEAMWORK_DIR/active/MISSION-*.md` Contract:

```bash
for CONTRACT_PATH in $TEAMWORK_DIR/active/MISSION-*.md; do
  [ -f "$CONTRACT_PATH" ] || continue

  # Read issue number from Contract
  ISSUE_NUMBER=$(bash ~/.claude/commands/scripts/tw-contract.sh read-field "$CONTRACT_PATH" issue 2>/dev/null)

  # Check freshness via script (exit 0=FRESH, 1=STALE, 2=NO_HASH)
  FRESHNESS=$(bash ~/.claude/commands/scripts/tw-contract.sh check-freshness "$CONTRACT_PATH" "$ISSUE_NUMBER" 2>/dev/null) || true
done
```

- If `issue_content_hash` is not in Contract (pre-v2.3.0) → skip check
- If `gh issue view` fails (network) → skip check (non-fatal)
- If `CURRENT_HASH ≠ CONTRACT_HASH` → set `ISSUE_STALE=true` for this Issue
- If hashes match → Issue content unchanged since claim

### 6c: Fetch GitHub data

Read the mission label from config. If config has `mc_label` field → use it. If config has the teamwork v2 schema → use `mission`. Default: `mission`.

```bash
# Determine the mission label — try github.mc_label (teamspace schema) then mc_label (teamwork schema)
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh github.mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"

# Determine label prefixes from config (flat schema: label_prefix.status; nested schema: defaults)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.priority "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.priority_prefix "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX="priority:"

# All mission issues
gh issue list --label "$MISSION_LABEL" --json number,title,assignees,labels,state,milestone --limit 50

# WIP issues (for "working on" display)
gh issue list --label "$MISSION_LABEL" --label "${STATUS_PREFIX}wip" --json number,title,assignees --limit 20

# Review issues (shipped, PR open, awaiting merge)
gh issue list --label "$MISSION_LABEL" --label "${STATUS_PREFIX}review" --json number,title,assignees,url --limit 20

# Open PRs
gh pr list --json number,title,author,headRefName,statusCheckRollup,reviewDecision --limit 20

# Merge count per team member (merged PRs to base branch)
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "pre-launch" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-pre-launch}"
gh pr list --state merged --base "$BASE_BRANCH" --json author --limit 100

# Version progress (if versions.current configured in config)
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
if [ -n "$CURRENT_VERSION" ]; then
  # Use GitHub Milestones for version progress tracking
  gh api "repos/$REPO/milestones" --jq ".[] | select(.title == \"$CURRENT_VERSION\") | {open: .open_issues, closed: .closed_issues}"
fi
```

If `versions.current` is set, query version-tagged issues and calculate done/total percentage for the dashboard header.

### 6d: Format and display (role-based)

Output a formatted dashboard based on user's role level.

#### Solo / Leader Dashboard

```
TEAM DASHBOARD — {repo name} (v3.0.0)
{If CURRENT_VERSION set and milestone found:} Version {CURRENT_VERSION}: {closed}/{closed+open} tasks done ({pct}%)
════════════════════════════════════════════

TEAM STATUS:
{For each team member from config:}
  {username} ({role label})
     {If has assigned status:wip issue:} Working on: #{N} {title} [{priority}] {If ISSUE_STALE:} [UPDATED]
     {If has open PR:} PR: #{pr} — {CI status}
     {If idle:} Idle — no active mission

UNDER REVIEW ({review_count}):
  {Issues with label "${STATUS_PREFIX}review":}
     #{N} {title} [@{assignee}]

UNASSIGNED ({unassigned_count}):
  {Issues with no assignee, sorted by priority, show top 5:}
     #{N} {title} [{priority}]
  {If unassigned_count > 5:} ... and {unassigned_count - 5} more — run /team queue to see all

MERGE COUNT:
  {username}: {count} | {username}: {count} | ...

SUGGESTED NEXT ACTION:
  {If unassigned issues exist:} Assign missions: /team-issue <desc> @user
  {If all issues assigned:} Check review queue: /team-ship review
  {If milestone near complete:} Prepare release: /team-rc
════════════════════════════════════════════
Commands: /team #N | /team-issue | /team-claim | /team-drive | /team-ship
```

#### Member Dashboard

```
MY DASHBOARD — {repo name} (v3.0.0)
{If CURRENT_VERSION set:} Version {CURRENT_VERSION}: {closed}/{closed+open} tasks done ({pct}%)
════════════════════════════════════════════

MY MISSIONS:
  {For each Issue assigned to GH_USER with status:wip:}
     #{N} {title} [{priority}] {If ISSUE_STALE:} [UPDATED]
     Branch: {branch}
     {If has local Contract:} Contract: ready → /team-drive
     {If no Contract:} Next: /team-claim #{N}

  {If no wip missions:} No active missions assigned to you.

MY PRs:
  {For each open PR by GH_USER:}
     #{pr} {title} — {CI status} {review decision}

SUGGESTED NEXT ACTION:
  {If has wip issue without Contract:} Claim your mission: /team-claim #{N}
  {If has Contract:} Start execution: /team-drive
  {If has completed mission:} Ship it: /team-ship
  {If idle:} No missions assigned — ask your team lead
════════════════════════════════════════════
Commands: /team #N | /team-claim | /team-drive | /team-ship
```

---

## Error Handling

- `gh` commands may fail due to network, permissions, or rate limits
- On non-fatal errors (label creation fails, branch protection fails): warn and continue
- On fatal errors (no gh, no remote, not authenticated): clear message and STOP
- If config.yml exists but is malformed: warn and offer to regenerate
