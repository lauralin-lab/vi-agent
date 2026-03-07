---
description: "Team dashboard + init. First time? Try: /team help"
version: "3.1.0"
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
| `doctor` | Run local git + issue health diagnostics |

---

## Route by Argument

Parse `$ARGUMENTS`:
- If `help` or `-h` → jump to **Operation Help**
- If `learn` → jump to **Operation Learn**
- If starts with `#` or is a number → jump to **Operation MC Detail**
- If `init` → jump to **Step 0** (skip config check, force init)
- If `queue` → jump to **Operation Queue**
- If `doctor` → jump to **Operation Doctor**
- If empty → continue to **Step 0** (auto-detect init vs dashboard)

---

## Operation Help

Output the following guide directly to the user, then **STOP**:

```
TEAMWORK v3.1.0 — AI-Native Team Coordination (Push Model)
Author: liyasong + casey | Released: 2026-03-06
═══════════════════════════════════════════

SETUP (one time):
  /team                 Auto-detect project, create config + CI + labels

DAILY WORKFLOW:
  /team                 See role-based dashboard (leader=team view, member=my view)
  /team #42             View MC #42 details (branch, commits, PRs)
  /team doctor          Local git + issue health diagnostics
  /team-issue <desc>    Create MC (solo: self-assign; team: prompt for assignee)
  /team-issue <desc> @user  Create MC + assign to @user
  /team-issue fix #N    Fix untracked Issue (add teamwork labels)
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

  /team-issue "用户登录"     → Issue #42 (create + assign + branch)
  /team-issue fix #94        → Fix untracked Issue (add labels)
  /team-claim 42             → Contract from develop
  /team-drive                → Code, test, commit
  /team-ship                 → PR → develop (squash)
  /team-rc                   → Cut RC → staging
  /team-rc promote           → Ship to production

UNTRACKED ISSUES:

  Issues assigned on GitHub but missing teamwork labels are "untracked".
  /team dashboard shows them in UNTRACKED section.
  Fix: /team-issue fix #N → adds mission + status + priority labels.

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
QUEUE ── {repo name} ── {total} open ───────

🔴 P0 CRITICAL
  #{N}  {title}  @{assignee}

🟠 P1 HIGH
  #{N}  {title}  @{assignee}

🟡 P2 MEDIUM
  #{N}  {title}  @{assignee}

⚪ P3 LOW
  #{N}  {title}  @{assignee}

▸ NO PRIORITY
  #{N}  {title}  @{assignee}

────────────────────────────────────────────
/team #{N} details │ /team-claim #{N} claim
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
  BRANCH_PATTERN="mission/{issue}-{slug}-{user}"
fi

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"

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
MC #{ISSUE_NUMBER} ── {title} ──────────────
Assignee:   @{assignee}
Status:     {wip/review/done}
Priority:   {Pn}
Milestone:  {milestone or "—"}
URL:        {issue url}
────────────────────────────────────────────
{Full Issue body}
────────────────────────────────────────────

▸ BRANCH  {branch or "(not created)"}
  Commits: {commit log or "(none)"}

▸ RELATED PRs
  #{pr}  {state}  {CI status}
  {If none:} (none)

────────────────────────────────────────────
/team-claim #{N} │ git checkout {branch}
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
| `conventions.branch_pattern` | team-claim | `"mission/{issue}-{slug}-{user}"` |
| `conventions.base_branch` | team-claim, team-ship, team-drive | `"main"` |
| `conventions.production_branch` | team-rc, protect-check | `"main"` |
| `deploy.staging_workflow` | team-rc | `""` (skip staging check) |
| `label_prefix` or `github.label_prefix` | all skills, post-merge Action | `status:`, `priority:` |

If critical fields are missing (no `project:` section at all, no `conventions.branch_pattern`), output a warning:

```
⚠ Config is missing some fields used by teamwork skills:
  - project.test_command: tests won't run during /team-drive and /team-ship
  - conventions.branch_pattern: will use default "mission/{issue}-{slug}-{user}"
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
sed -i '' "s/^skill_version:.*/skill_version: 3.1.0/" $TEAMWORK_DIR/config.yml
# Linux fallback: sed -i "s/^skill_version:.*/skill_version: 3.1.0/" $TEAMWORK_DIR/config.yml

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
   schema_version → 3 | skill_version → 3.1.0
   Preserved sections: {list of sections kept}
   Added sections: {list of sections appended, or "(none — already complete)"}
```

Do NOT overwrite `team`/`members`, `github`, `worktree`, `versions`, `roles`, `notifications`, or any unrecognized section.

---

#### FRESH INSTALL (config does not exist)

Write full config based on detected project info + user answers:

```yaml
schema_version: 3
skill_version: 3.1.0

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

Read the mission label and label prefixes from config:

```bash
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

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
```

**Performance: fetch data in parallel.** Make these calls using **parallel Bash tool calls** (not sequential):

```bash
# Call 1: ALL mission issues (replaces 3 separate calls — filter WIP/review/unassigned client-side from labels)
gh issue list --label "$MISSION_LABEL" --state open --json number,title,assignees,labels,milestone --limit 100

# Call 2: Open PRs
gh pr list --json number,title,author,headRefName,statusCheckRollup,reviewDecision --limit 20

# Call 3: All open issues (for untracked detection) — leader: all assigned; member: own only
gh issue list --state open --json number,title,labels,assignees --limit 100
# (member: add --assignee "$GH_USER" --limit 50)

# Call 4: Merged PR count
gh pr list --state merged --base "$BASE_BRANCH" --json author --limit 100

# Call 5 (if CURRENT_VERSION set): Milestone progress
# Use startswith for prefix matching — config stores short name (e.g. "V0.1")
# but milestone title may be longer (e.g. "V0.1 — AI Camera Pipeline")
gh api "repos/$REPO/milestones" --jq ".[] | select(.title | startswith(\"$CURRENT_VERSION\")) | {open: .open_issues, closed: .closed_issues}"
```

**Client-side filtering** from Call 1 results (no extra API calls):
- **WIP issues**: entries where labels contain `${STATUS_PREFIX}wip`
- **Review issues**: entries where labels contain `${STATUS_PREFIX}review`
- **Unassigned**: entries where assignees is empty
- **Priority**: extract from labels matching `${PRIORITY_PREFIX}P*`

**Compute untracked issues**: Call 3 results MINUS Call 1 results (by issue number). Issues in Call 3 but not in Call 1 are untracked — assigned on GitHub but missing the mission label.

### 6d: Format and display (role-based)

Output a formatted dashboard based on user's role level.

#### Solo / Leader Dashboard

```
TEAM DASHBOARD ── {repo name} ──────────────
{If CURRENT_VERSION:} {VERSION}  {progress_bar}  {pct}%  {done}/{total}

👥 TEAM ({member_count} members)
  {For each team member:}
  {username} ({role})
    {If WIP:}  🟢 #{N} {title} [{priority_dot}] {If STALE: ⚡}
    {If PR:}   🔀 #{pr} — {ci_icon}
    {If idle:} ⚪ (idle)

🔀 UNDER REVIEW ({count})
  🟡 #{N}  {title}  @{assignee}
  {If none:} (none)

📋 UNASSIGNED ({count})
  {priority_dot}  #{N}  {title}
  {If count > 5:} ... +{remaining} more → /team queue
  {If none:} (none)

⚠️ UNTRACKED ({count})
  #{N}  {title}  @{assignee}
  Fix: /team-issue fix #{N}
  {Omit entire section if count == 0}

📊 MERGES  {user}:{n}  {user}:{n}  ...

💡 Next: {one context-specific suggestion}
────────────────────────────────────────────
/team #N │ /team-issue │ /team-claim │ /team-drive │ /team-ship
```

**Visual encoding rules** (apply to ALL teamwork output):

| Symbol | Meaning | Used for |
|--------|---------|----------|
| 🔴 | P0 critical | Priority dot in issue lines |
| 🟠 | P1 high | Priority dot |
| 🟡 | P2 medium / under review | Priority dot / review status |
| ⚪ | P3 low / idle | Priority dot / member idle |
| 🟢 | Active / WIP | Member working status |
| ✅ | Done / CI passing | Completed items, CI green |
| ❌ | Failed / CI failing | CI red, errors |
| ⚡ | Stale / updated | Issue changed since claim |
| 🔀 | PR / merge | Pull request related |
| ▸ | Section marker | Generic section headers |

**Progress bar**: Map percentage to 10 chars: `█` for filled, `░` for empty. E.g., 14% → `█░░░░░░░░░`, 50% → `█████░░░░░`, 100% → `██████████`.

**`{priority_dot}`** shorthand: replace `Pn` prefix with colored dot — `🔴` P0, `🟠` P1, `🟡` P2, `⚪` P3. E.g., `🟠 #134 Unified NanoClaw Architecture @initialneil`.

**`{ci_icon}`** shorthand: `✅` if all checks pass, `❌` if any fail, `⏳` if pending/running.

#### Member Dashboard

```
MY DASHBOARD ── {repo name} ────────────────
{If CURRENT_VERSION:} {VERSION}  {progress_bar}  {pct}%  {done}/{total}

🎯 MY MISSIONS
  🟢 #{N} {title} [{priority_dot}] {If STALE: ⚡}
    {branch}  {If Contract: → /team-drive │ Else: → /team-claim #{N}}
  {If none:} (none)

🔀 MY PRs
  #{pr} {title}  {ci_icon}  {review}
  {If none:} (none)

⚠️ UNTRACKED ({count})
  #{N}  {title}
  Fix: /team-issue fix #{N}
  {Omit entire section if count == 0}

────────────────────────────────────────────
👥 TEAM WIP ({count})
  {priority_dot}  #{N}  {title}  @{assignee}
  {List all WIP issues sorted by priority}
  {Omit entire section if solo mode}

🔀 UNDER REVIEW ({count})
  🟡 #{N}  {title}  @{assignee}
  {If none:} (none)

📊 MERGES  {user}:{n}  {user}:{n}  ...

💡 Next: {one context-specific suggestion}
────────────────────────────────────────────
/team #N │ /team-claim │ /team-drive │ /team-ship
```

---

## Operation Doctor

> Triggered by `/team doctor`. Read-only local git + issue health diagnostics with 3-layer visual report.
> Design spec: `docs/team-doctor-design.md`

### Prerequisites

Same as dashboard: config must exist, `gh` must be authenticated, must be in a git repo.

```bash
# Identity
GH_USER=$(gh api user --jq '.login' 2>/dev/null)

# Config
if [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
else
  echo "NO_CONFIG"
fi

# Read config values
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh github.mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh mc_label "" 2>/dev/null)
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
```

If no config → "Teamwork not initialized. Run `/team` first." → **STOP**

### Data Collection Phase

Run these commands to gather all raw data. Order doesn't matter — collect everything first, analyze second.

```bash
# 1. Local branches with tracking info
git branch -vv --no-color

# 2. Remote branches (for orphan detection)
git ls-remote --heads origin 2>/dev/null

# 3. Current branch
git branch --show-current

# 4. Uncommitted changes
git status --porcelain

# 5. Stash list with dates
git stash list --format='%gd|%ci|%s'

# 6. Worktree list
git worktree list --porcelain

# 7. All open mission issues (with state, labels, assignees)
gh issue list --label "$MISSION_LABEL" --state open --json number,title,state,labels,assignees --limit 50

# 8. Recently closed/merged mission issues (for orphan branch detection)
gh issue list --label "$MISSION_LABEL" --state closed --json number,title,closedAt --limit 30

# 9. Open PRs (with CI status, mergeable)
gh pr list --author "$GH_USER" --state open --json number,title,headRefName,mergeable,reviewDecision,statusCheckRollup,url --limit 20

# 10. Recently merged PRs (for orphan branch detection)
gh pr list --author "$GH_USER" --state merged --json number,title,headRefName,mergedAt --limit 20

# 11. Active contracts
ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null

# 12. Branch behind/ahead counts for mission branches
for branch in $(git branch --list 'mission/*' --format='%(refname:short)'); do
  echo "$branch: $(git rev-list --left-right --count origin/$BASE_BRANCH...$branch 2>/dev/null || echo 'N/A')"
done

# 13. Open mission issue bodies (for duplicate/overlap detection)
gh issue list --label "$MISSION_LABEL" --state open --json number,title,body,assignees,labels --limit 50
```

### Analysis Phase — 7 Diagnostic Checks

Each check produces findings with a severity level:

| Severity | Icon | Meaning |
|----------|------|---------|
| CRITICAL | 🔴 | Blocking work or risking data loss — fix before continuing |
| WARNING | 🟡 | Should fix soon, causes friction or accumulates debt |
| INFO | 🟢 | Cleanup opportunity, low urgency |

#### Check 1: Orphan Branches

A local branch is orphan if its corresponding issue is CLOSED or its PR is MERGED.

```
For each local branch matching mission/* pattern:
  1. Extract issue number from branch name (first numeric segment after /)
  2. Check if issue number appears in closed issues list → ORPHAN
  3. Check if branch name appears in merged PRs list → ORPHAN
  4. If orphan → severity 🟢, recommend: git branch -d {branch}
```

Edge cases:
- Branch name doesn't contain an issue number → skip (not a mission branch)
- Branch has unmerged local commits not in any PR → severity 🟡 instead of 🟢
  - Detect: `git log origin/$BASE_BRANCH..{branch} --oneline` has commits not in merged PR
  - Message: "Branch has local commits that may not be merged. Verify before deleting."

#### Check 2: Cross-Contamination (Dirty Branches)

Uncommitted changes on the current branch may belong to a different MC. This is the highest-value check and requires LLM judgment.

```
1. Get current branch name → extract its issue number
2. Get git status --porcelain → list of changed files
3. For each changed file:
   a. Read the diff (git diff -- {file} + git diff --cached -- {file})
   b. Cross-reference with open issues:
      - Does the file path or change content relate to a DIFFERENT open issue?
      - Does the diff match the description/title of another MC?
4. Group findings:
   - Changes that belong to current MC → OK
   - Changes that likely belong to another MC → 🔴 CRITICAL
   - Changes that don't match any MC → 🟡 WARNING (untracked work)
```

Heuristics for cross-referencing (LLM should use judgment, not rigid rules):
- File path matches another issue's title keywords
- Diff content matches another issue's description
- File is completely unrelated to current branch's issue scope

Edge case: No uncommitted changes → skip this check, output nothing.

#### Check 3: Branch Staleness (Behind Base)

Mission branches that fall too far behind base branch will have painful merges later.

```
For each local mission/* branch:
  1. Count commits behind: git rev-list --count {branch}..origin/$BASE_BRANCH
  2. Thresholds:
     - 0-10 behind → OK (don't report)
     - 11-30 behind → 🟡 WARNING
     - 31+ behind → 🔴 CRITICAL
  3. Only report for branches with corresponding OPEN issues (skip orphans)
```

#### Check 4: Stale Stashes

Stashes older than 7 days or whose parent branch is deleted/merged are likely forgotten.

```
For each stash entry:
  1. Parse date from git stash list --format='%gd|%ci|%s'
  2. Parse branch name from stash message (usually "WIP on {branch}: ...")
  3. Check age:
     - < 7 days → OK
     - 7-30 days → 🟢 INFO
     - > 30 days → 🟡 WARNING
  4. Check if parent branch still exists:
     - Branch deleted or merged → 🟡 WARNING (stash is likely orphaned)
  5. Check size:
     - > 10 files → 🟡 WARNING (too large for stash, needs its own MC)
  6. Show stash content summary: git stash show stash@{N} --stat
```

#### Check 5: Worktree Health

Detect prunable worktrees and worktrees on deleted/merged branches.

```
Parse git worktree list --porcelain output:
  For each worktree (skip the main one):
    1. Check if marked "prunable" → 🟡 prunable
    2. Check if branch is an orphan (issue closed / PR merged) → 🟡 orphan
    3. Check if worktree directory exists on disk → if not, 🔴 broken (corrupted)
```

#### Check 6: Shippable PRs

PRs that are ready to merge but sitting idle.

```
For each open PR:
  1. Check CI status (statusCheckRollup) → all passing?
  2. Check mergeable → MERGEABLE?
  3. Check reviewDecision → APPROVED or no review required?
  4. If all three → this PR is shippable
  5. Severity: 🟡 WARNING (it's blocking progress)
```

#### Check 7: Issue Health (Duplicates, Overlap, Orphans)

LLM reads all open mission issue titles + bodies and cross-references for problems. This check requires LLM judgment — semantic similarity detection, not string matching.

```
Sub-checks:

A. DUPLICATE DETECTION
   For each pair of open mission issues:
     1. Compare titles semantically (not string match)
     2. Compare objectives/descriptions
     3. If high overlap → 🟡 WARNING "Issues #X and #Y appear to be duplicates"
     Action: close one with gh issue close N --reason "not planned" --comment "Duplicate of #M"

B. UNASSIGNED ISSUES
   For each open mission issue:
     1. Check if assignees list is empty
     2. If unassigned and older than 3 days → 🟡 WARNING
     Action: assign via gh issue edit N --add-assignee USER

C. STALE ISSUES (no activity)
   For each open mission issue:
     1. Check if status:wip but no branch exists and no PR exists
     2. If claimed (status:wip) but no commits on branch for >7 days → 🟡 WARNING
     Action: re-evaluate priority or reassign

D. ORPHAN CONTRACTS
   For each file in $TEAMWORK_DIR/active/MISSION-*.md:
     1. Extract issue number from filename
     2. Check if corresponding GitHub issue is still open
     3. If issue closed but contract still exists → 🟡 WARNING
     Action: rm $TEAMWORK_DIR/active/MISSION-N.md
```

Heuristics for duplicate detection (LLM judgment):
- "fix camera on Safari" and "iOS media access broken" are the same problem even with zero shared words
- "add rate limiting" and "rate limit upload API" overlap but may be different scope — flag as potential, not definite
- Issues sharing >50% sub-tasks are likely duplicates

### Output Format — 3-Layer Visual Report

1. **Snapshot tables** — structured data, one table per dimension (branches, PRs, stashes, worktrees, issues)
2. **Diagnosis** — LLM cross-referencing analysis (the high-value part humans can't do with `git status`)
3. **Action Plan** — prioritized fix list, grouped by urgency

#### Layer 1: Snapshot Tables

Each table shows raw state with inline emoji status indicators. Tables use box-drawing characters for visual clarity. Only show tables that have content worth reporting (skip empty/clean dimensions).

**Branches table** — all local mission/* branches:
- Status column: `🔴 dirty` (uncommitted changes), `🟢 clean`, `🟡 stale` (>30 commits behind), `💀 orph` (issue closed / PR merged)

**Open PRs table** — only if there are open PRs:
- Ready? column: `🟢 SHIP` (all green), `🔴 CI fail`, `🟡 review`, `🔴 conflict`, `⏳ pending`

**Stashes table** — only if stashes exist:
- Verdict column: `🟢 KEEP` (recent + active branch), `🟡 REVIEW` (old but active branch), `🟡 LARGE` (>10 files), `🔴 DROP` (parent branch deleted/merged)

**Worktrees table** — only if non-main worktrees exist:
- Health column: `🟢 active`, `🟡 prunable`, `🟡 orphan` (branch merged/deleted), `🔴 broken` (dir missing)

**Issues table** — only if issues have problems (duplicates, unassigned, stale):
- Health column: `🟡 DUP?` (potential duplicate), `🟡 NOBODY` (unassigned >3d), `🟡 STALE` (wip but no activity), `🟢 OK` (healthy)

#### Layer 2: Diagnosis

After the tables, cross-reference all data and output narrative findings. This is where the real intelligence lives — connecting dots across dimensions that no single `git` command can show.

Rules:
- Use emoji severity prefix: 🔴 / 🟡 / 🟢
- Group related findings (e.g., multiple orphan branches in one finding, not separate entries)
- Explain the cross-dimensional insight (WHY this is a problem, not just WHAT)
- Prioritize cross-contamination and shippable PRs — these block real work
- If a check finds nothing wrong, report it as 🟢 with a one-liner

#### Layer 3: Action Plan

Concrete commands, grouped by severity (🔴 first, then 🟡, then 🟢). Each action maps to a diagnosis finding.

Rules:
- Every action has a numbered step + the exact command(s) to run
- Stash drops must be ordered from highest index first (indices shift on drop)
- Cross-contamination fixes suggest both options (discard vs stash for later)
- Shippable PRs suggest both `gh pr merge` and `/team-ship done`
- Duplicate issues suggest `gh issue close N --reason "not planned" --comment "Duplicate of #M"`
- Large stashes suggest creating a new MC via `/team-issue`

#### Clean State Output

If all checks pass:

```
🏥 LOCAL HEALTH — {repo name}
══════════════════════════════════════════════════
🟢 All clear.
   {N} mission branches — all active, no contamination
   {N} stashes — all recent
   {N} worktrees — all healthy
   {N} open PRs — none ready to ship yet
   {N} open issues — no duplicates, all assigned
══════════════════════════════════════════════════
```

No tables, no diagnosis, no action plan. Just the summary.

#### Report Format Example

```
🏥 LOCAL HEALTH — {repo name}
   Current: {current branch} | Base: {base branch}
══════════════════════════════════════════════════════════════════════════

📋 BRANCHES ({N} local)
┌──────────────────────────────┬────────────┬──────────┬──────────────────────────────────────┐
│ Branch                       │ Status     │ vs Base  │ Issue / PR                           │
├──────────────────────────────┼────────────┼──────────┼──────────────────────────────────────┤
│ mission/42-feat-* [cur]      │ 🔴 dirty   │ +6, -1   │ #42 OPEN  │ PR #43 ✅ pass          │
│ mission/29-fix-*             │ 💀 orph    │ +0, -38  │ #29 CLOSED│ PR #30 merged            │
└──────────────────────────────┴────────────┴──────────┴──────────────────────────────────────┘

📋 OPEN PRS ({N})
┌──────┬───────────────────────────────┬──────┬───────────┬────────┬──────────┐
│  PR  │ Title                         │ CI   │ Mergeable │ Review │ Ready?   │
├──────┼───────────────────────────────┼──────┼───────────┼────────┼──────────┤
│ #43  │ feat: user login              │ ✅   │ ✅        │ —      │ 🟢 SHIP │
└──────┴───────────────────────────────┴──────┴───────────┴────────┴──────────┘

📋 STASHES ({N})
┌───────────┬─────────┬──────────────────────────┬──────────────────────┬──────────┐
│ Stash     │ Age     │ Message                  │ Content              │ Verdict  │
├───────────┼─────────┼──────────────────────────┼──────────────────────┼──────────┤
│ stash@{0} │ 3 days  │ WIP on mission/42: feat  │ 14 files (~2800 ln)  │ 🟡 LARGE │
│ stash@{1} │ 42 days │ WIP on mission/18: fix   │ 1 file               │ 🔴 DROP  │
└───────────┴─────────┴──────────────────────────┴──────────────────────┴──────────┘

📋 WORKTREES ({N} extra)
┌──────────────────────────────────────┬────────────────────┬─────────────┐
│ Path                                 │ Branch             │ Health      │
├──────────────────────────────────────┼────────────────────┼─────────────┤
│ ../repo-wt-feat                      │ mission/42-feat    │ 🟢 active   │
│ ../repo-wt-old                       │ (missing)          │ 🟡 prunable │
└──────────────────────────────────────┴────────────────────┴─────────────┘

📋 ISSUES ({N} problems in {M} open)
┌───────┬──────────────────────────────────┬──────────────┬─────────────┬───────────┐
│ Issue │ Title                            │ Assignee     │ Status      │ Health    │
├───────┼──────────────────────────────────┼──────────────┼─────────────┼───────────┤
│ #50   │ fix: Safari camera permission    │ user1        │ status:wip  │ 🟡 DUP?  │
│ #52   │ fix: iOS media access broken     │ user1        │ status:wip  │ 🟡 DUP?  │
│ #48   │ feat: add usage analytics        │ (none)       │ status:wip  │ 🟡 NOBODY│
└───────┴──────────────────────────────────┴──────────────┴─────────────┴───────────┘

🔍 DIAGNOSIS
──────────────────────────────────────────────────────────────────────────

{🔴/🟡/🟢 severity findings — LLM cross-references all data and outputs
 narrative insights. Group related findings. Explain WHY, not just WHAT.
 Prioritize cross-contamination and shippable PRs first.}

📌 ACTION PLAN ({N} actions)
══════════════════════════════════════════════════════════════════════════

 🔴 Critical
 ───────────────────
 [1] {action}: {exact command(s)}

 🟡 Warning
 ───────────────────
 [2] {action}: {exact command(s)}

 🟢 Cleanup
 ───────────────────
 [3] {action}: {exact command(s)}

══════════════════════════════════════════════════════════════════════════
SUMMARY: 🔴 {N} critical │ 🟡 {N} warnings │ 🟢 {N} cleanup
══════════════════════════════════════════════════════════════════════════
```

Then **STOP**.

---

## Error Handling

- `gh` commands may fail due to network, permissions, or rate limits
- On non-fatal errors (label creation fails, branch protection fails): warn and continue
- On fatal errors (no gh, no remote, not authenticated): clear message and STOP
- If config.yml exists but is malformed: warn and offer to regenerate
