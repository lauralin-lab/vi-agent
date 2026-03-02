---
description: "Initialize GitHub-first teamwork system or show team dashboard. Run first to set up, then anytime for overview."
---

# /team — Init + Dashboard (Teamwork v2)

> GitHub-first team coordination. Issues are tasks, PRs are delivery, Actions are quality gates.

**Two modes:**
1. **First run** (no config found): Initialize teamwork system — detect project, configure team, generate CI/hooks/templates
2. **Subsequent runs**: Show team dashboard from GitHub data

**User input**: $ARGUMENTS

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
# Check for existing teamwork config (support both directory names)
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
```

- If `DASHBOARD` → Jump to **Step 6: Dashboard** (use whichever config dir was found)
- If `INIT` → Continue to **Step 2: Initialize**

**Note**: Both `.teamwork/` and `.teamspace/` are supported as config directories. The system uses whichever exists. New installations default to `.teamwork/`.

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
    description: "Require CI pass + PR review before merge to main"
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

Write based on detected project info + user answers:

```yaml
schema_version: 1
skill_version: 2.1.0

team:
  - github: {GH_USER}
    role: tech-lead
  # ... additional members from Step 3

project:
  language: {LANGUAGE}
  test_command: "{TEST_CMD}"
  lint_command: "{LINT_CMD}"
  build_command: "{BUILD_CMD}"

conventions:
  branch_pattern: "mission/{issue}-{slug}-{user}"
  base_branch: main
  commit_format: "type(scope): description | Mission: #{issue}"

label_prefix:
  status: "status:"
  priority: "priority:"
  size: "size:"

quality:
  hooks: {true/false from Step 3}
  ci: {true/false from Step 3}
  review_required: {true/false from Step 3}
  branch_protection: {true/false from Step 3}

# Optional: Git worktree isolation (from Question 3)
# worktree:
#   enabled: true
#   path_pattern: "../{repo}-wt-{slug}"

# Optional: Version tracking
# versions:
#   current: "V1.0"
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

If not exists → generate:

```yaml
name: Mission Contract
description: Structured task for team execution
labels: ["mission", "status:queued"]
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
- If no CI workflow exists → generate based on detected language:

**For monorepo projects** (`IS_MONOREPO=true`), generate a multi-service CI that runs each service's checks in a separate job:

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

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
    branches: [main]
  push:
    branches: [main]

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
    branches: [main]
  push:
    branches: [main]

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
    branches: [main]
  push:
    branches: [main]

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

### 4e: Write git hooks (if enabled)

**`.githooks/pre-commit`:**
```bash
#!/bin/bash
# Teamwork v2 — local quality gate (fast)
set -e
CONFIG="$([ -f .teamwork/config.yml ] && echo .teamwork/config.yml || echo .teamspace/config.yml)"
[ -f "$CONFIG" ] || exit 0
LINT_CMD=$(grep 'lint_command:' "$CONFIG" | sed 's/.*lint_command: *//' | sed 's/ *#.*//' | tr -d '"')
if [ -n "$LINT_CMD" ]; then
  echo "Running lint..."
  eval "$LINT_CMD"
fi
```

**`.githooks/pre-push`:**
```bash
#!/bin/bash
# Teamwork v2 — local quality gate (thorough)
set -e
CONFIG="$([ -f .teamwork/config.yml ] && echo .teamwork/config.yml || echo .teamspace/config.yml)"
[ -f "$CONFIG" ] || exit 0
TEST_CMD=$(grep 'test_command:' "$CONFIG" | sed 's/.*test_command: *//' | sed 's/ *#.*//' | tr -d '"')
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

### 4f: Update `.gitignore`

Append if not already present:
```
# Teamwork ephemeral contracts
.teamwork/active/
.teamspace/active/
```

---

## Step 5: Configure GitHub

### 5a: Create labels

Read `label_prefix` from config. If config has `label_prefix` section → use those prefixes. If config has `github.label_prefix` (`.teamspace` format) → use those. Otherwise → no prefix (legacy fallback).

```bash
# Category label (no prefix — it's a category, not a status)
gh label create mission --color 0075ca --description "Team mission" --force

# Priority labels (prefixed)
gh label create "priority:P0" --color d73a4a --description "Critical priority" --force
gh label create "priority:P1" --color e4e669 --description "High priority" --force
gh label create "priority:P2" --color 0e8a16 --description "Medium priority" --force
gh label create "priority:P3" --color cfd3d7 --description "Low priority" --force

# Status labels (prefixed)
gh label create "status:queued" --color c2e0c6 --description "Ready to be claimed" --force
gh label create "status:wip" --color fbca04 --description "Currently being worked on" --force
gh label create "status:review" --color 7057ff --description "Ready for review" --force
gh label create "status:done" --color 0e8a16 --description "Completed" --force
gh label create "status:blocked" --color d73a4a --description "Blocked by dependency" --force

# Version label (if versions configured in config)
# gh label create "version:${CURRENT_VERSION}" --color 006b75 --description "Version ${CURRENT_VERSION}" --force
```

If `versions.current` is set in config, create the version label.

### 5b: Branch protection (if enabled)

```bash
gh api repos/{REPO}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["quality"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null
```

If branch protection fails (e.g., free plan limitations), warn but continue — it's not a blocker.

---

## Step 5c: Commit and Push

```bash
git add $TEAMWORK_DIR/config.yml .github/ .githooks/ .gitignore
git commit -m "feat(teamwork): initialize GitHub-first teamwork v2

Generate config, CI workflow, Issue template, git hooks.
Team: {member list}"
git push
```

Output: "Teamwork initialized! Next: create Issues using the Mission template, then `/team-claim` to start working."

---

## Step 6: Dashboard

Read data from GitHub and config, then display formatted dashboard.

### 6a: Read config
```bash
cat $TEAMWORK_DIR/config.yml
```

### 6b: Fetch GitHub data

Read the mission label from config. If config has `mc_label` field → use it. If config has the teamwork v2 schema → use `mission`. Default: `mission`.

```bash
# Determine the mission label from config
# teamwork v2 schema: label is "mission"
# teamspace schema: look for mc_label field (e.g., "mission-contract")
MISSION_LABEL=$(grep 'mc_label:' $TEAMWORK_DIR/config.yml | sed 's/.*mc_label: *//' | sed 's/ *#.*//' | tr -d '"' || echo "mission")
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"

# Determine label prefixes from config
# Check label_prefix section first, then github.label_prefix (.teamspace), then no prefix
# Note: sed 's/^[^:]*://' splits on FIRST colon only (values like "status:" contain colons)
STATUS_PREFIX=$(grep '^\s*status:' $TEAMWORK_DIR/config.yml | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' || echo "status:")
PRIORITY_PREFIX=$(grep '^\s*priority:' $TEAMWORK_DIR/config.yml | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' || echo "priority:")

# All mission issues
gh issue list --label "$MISSION_LABEL" --json number,title,assignees,labels,state,milestone --limit 50

# WIP issues (for "working on" display)
gh issue list --label "$MISSION_LABEL" --label "${STATUS_PREFIX}wip" --json number,title,assignees --limit 20

# Review issues
gh issue list --label "$MISSION_LABEL" --label "${STATUS_PREFIX}review" --json number,title,assignees --limit 20

# Open PRs
gh pr list --json number,title,author,headRefName,statusCheckRollup,reviewDecision --limit 20

# Merge count per team member (merged PRs to base branch)
gh pr list --state merged --base main --json author --limit 100

# Version progress (if versions.current configured)
# CURRENT_VERSION=$(grep 'current:' $TEAMWORK_DIR/config.yml | tail -1 | sed 's/.*: *//' | tr -d '"')
# if [ -n "$CURRENT_VERSION" ]; then
#   gh issue list --label "$MISSION_LABEL" --label "version:${CURRENT_VERSION}" --json state --limit 100
# fi
```

If `versions.current` is set, query version-tagged issues and calculate done/total percentage for the dashboard header.

### 6c: Format and display

Output a formatted dashboard like this:

```
TEAM DASHBOARD — {repo name}
{If versions configured:} Version: {current} ({done}/{total} tasks = {pct}%)
Milestone: {active milestone} ({closed}/{total} = {pct}%)
════════════════════════════════════════════

{For each team member from config.yml:}
  {username} ({role})
     {If has assigned status:wip issue:} Working on: #{N} {title} [{priority}]
     {If has open PR:} PR: #{pr} — {CI status}
     {If idle:} Idle (last merged: #{last_merged_pr})

QUEUED:
  {Issues with label "mission" that are unassigned or status:queued}
     #{N} {title} [{priority}]

MERGE COUNT:
  {username}: {count} | {username}: {count} | ...

════════════════════════════════════════════
Commands: /team-claim #{N} | /team-drive | /team-ship
```

---

## Error Handling

- `gh` commands may fail due to network, permissions, or rate limits
- On non-fatal errors (label creation fails, branch protection fails): warn and continue
- On fatal errors (no gh, no remote, not authenticated): clear message and STOP
- If config.yml exists but is malformed: warn and offer to regenerate
