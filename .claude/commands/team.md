---
description: "Team dashboard + init. First time? Try: /team help"
version: "2.7.0"
---

# /team — Init + Dashboard (Teamwork v2)

> GitHub-first team coordination. Issues are tasks, PRs are delivery, Actions are quality gates.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Auto: first run → Init, subsequent → Dashboard |
| `help` or `-h` | Show quick-start guide for new users |
| `init` | Force re-initialize (even if config exists) |
| `queue` | Show all queued issues (full list, sorted by priority) |

---

## Route by Argument

Parse `$ARGUMENTS`:
- If `help` or `-h` → jump to **Operation Help**
- If `init` → jump to **Step 0** (skip config check, force init)
- If `queue` → jump to **Operation Queue**
- If empty → continue to **Step 0** (auto-detect init vs dashboard)

---

## Operation Help

Output the following guide directly to the user, then **STOP**:

```
TEAMWORK — Quick Start Guide
═══════════════════════════════════════════

SETUP (one time):
  /team                 Auto-detect project, create config + CI + labels

DAILY WORKFLOW:
  /team                 See dashboard (who's working on what)
  /team queue           Full list of queued issues, sorted by priority
  /team-issue           Create a mission Issue from natural language
  /team-claim #N        Claim Issue #N → generate Contract + branch
  /team-claim           Auto-pick highest priority unassigned Issue
  /team-claim list      Browse available missions
  /team-drive           Execute mission (sub-tasks → test → commit loop)
  /team-ship            Push + create PR (auto-closes Issue on merge)

AFTER MERGE:
  /team-ship done       Close Issue, update labels, clean up
  /team-ship review     AI code review on current PR
  /team-ship sync       Rebase branch on latest base branch

VERSION LIFECYCLE:
  /team-release         Close milestone → git tag → GitHub Release → next version

LIFECYCLE:
  /team-issue → Issue → /team-claim → Contract + branch
                     → /team-drive → implement + test + commit
                     → /team-ship  → PR (Closes #N)
                     → /team-ship done → Issue closed, back to base branch
  All missions done? → /team-release → tag + release + next milestone

CONFIG:
  .teamwork/config.yml  (or .teamspace/config.yml)
  Edit team members, test/lint commands, quality gates directly.

REQUIREMENTS:
  gh (GitHub CLI)       gh auth login
  git remote            git remote add origin <url>

MORE INFO:
  ONBOARDING.md         Full tutorial with examples
═══════════════════════════════════════════
```

---

## Operation Queue

Show the full list of queued issues, sorted by priority. Requires existing config (same prerequisite check as dashboard).

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
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"

STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"

PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.priority "" 2>/dev/null)
[ -z "$PRIORITY_PREFIX" ] && PRIORITY_PREFIX="priority:"

# Fetch all queued issues (unassigned or status:queued, open)
gh issue list --label "$MISSION_LABEL" --state open --json number,title,labels,assignees --limit 100
```

Filter to issues that are unassigned OR have `${STATUS_PREFIX}queued` label. Sort by priority: P0 first → P1 → P2 → P3 → no priority last.

Output formatted list:

```
QUEUED ISSUES — {repo name} ({total} issues)
════════════════════════════════════════════

P0 (critical):
  #{N} {title}
  #{N} {title}

P1 (high):
  #{N} {title}

P2 (medium):
  #{N} {title}
  #{N} {title}

P3 (low):
  #{N} {title}

No priority:
  #{N} {title}

════════════════════════════════════════════
Claim: /team-claim #{N}
```

Omit priority groups that have zero issues. Then **STOP**.

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

**Config format detection** (handle two schemas):
- If config has `members:` section → use it (`.teamspace` format: `members:` is the member list)
- Else if config has `team:` as an ARRAY of `{github, role}` → use it (erwin v2 format)
- Note: `.teamspace` configs have `team:` as metadata `{name, repo}`, NOT a member list — always check `members:` first

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
| `conventions.release_branch` | team-release | `base_branch` value |
| `deploy.staging_workflow` | team-release | `""` (skip staging check) |
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

**Step 1 — Update skill_version in place:**

```bash
# Update skill_version line without touching anything else
sed -i '' "s/^skill_version:.*/skill_version: 2.7.0/" $TEAMWORK_DIR/config.yml
# Linux fallback: sed -i "s/^skill_version:.*/skill_version: 2.7.0/" $TEAMWORK_DIR/config.yml
```

**Step 2 — Detect which top-level sections are missing:**

```bash
# Detect missing top-level sections (no PyYAML dependency — pure grep)
for section in project conventions label_prefix quality; do
  grep -q "^${section}:" $TEAMWORK_DIR/config.yml || echo "$section"
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
  branch_pattern: "mission/{issue}-{slug}-{user}"
  base_branch: main
  # release_branch: main  # Set different from base_branch for dual-branch model (e.g. "main" when base_branch is "develop")
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

**Step 4 — Show merge summary:**

```
✅ Config updated (merge mode — existing config preserved)
   skill_version → 2.6.1
   Preserved sections: {list of sections kept}
   Added sections: {list of sections appended, or "(none — already complete)"}
```

Do NOT overwrite `team`/`members`, `github`, `worktree`, `versions`, `roles`, or any unrecognized section.

---

#### FRESH INSTALL (config does not exist)

Write full config based on detected project info + user answers:

```yaml
schema_version: 1
skill_version: 2.7.0

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
  # release_branch: main  # Set different from base_branch for dual-branch model
  commit_format: "type(scope): description | Mission: #{issue}"

# Optional: Deployment pipeline (required for staging gate in /team-release)
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

# Optional: Git worktree isolation (from Question 3)
# worktree:
#   enabled: true
#   path_pattern: "../{repo}-wt-{slug}"

# Optional: Version tracking (required for /team-release)
# versions:
#   current: "V1.0"
#   spec_path: ".claude/drive/v1.0-definition/spec.md"  # optional: enables AI audit in /team-release
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
labels: ["{MISSION_LABEL}", "{STATUS_PREFIX}queued"]
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
                    body: `🎉 Milestone **${issue.data.milestone.title}** is now 100% complete (${total} issues). Ready for \`/team-release\`.`
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
# Teamwork v2 — local quality gate (fast)
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
# Teamwork v2 — local quality gate (thorough)
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
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "status:" 2>/dev/null)
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.priority "priority:" 2>/dev/null)

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
  --field squash_merge_commit_title=PR_TITLE \
  --field squash_merge_commit_message=PR_BODY
```

- `delete_branch_on_merge` — auto-delete feature branch after PR merge (no stale branches)
- `allow_squash_merge` only — one Issue = one squash commit on base branch, clean history
- `squash_merge_commit_message=PR_BODY` — preserves `Closes #N` so Issue auto-closes on merge

If API fails (permissions) → warn but continue. These can be set manually in GitHub Settings → General.

### 5c: Branch protection (if enabled)

Read config flags to build the protection rule dynamically:

```bash
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
RELEASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.release_branch "" 2>/dev/null)
RELEASE_BRANCH="${RELEASE_BRANCH:-$BASE_BRANCH}"

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

**Dual-branch mode** — if `RELEASE_BRANCH != BASE_BRANCH`, also protect release branch:

```bash
if [ "$RELEASE_BRANCH" != "$BASE_BRANCH" ]; then
  gh api "repos/$REPO/branches/$RELEASE_BRANCH/protection" \
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
[ -z "$MISSION_LABEL" ] && MISSION_LABEL="mission"

# Determine label prefixes from config (flat schema: label_prefix.status; nested schema: defaults)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
PRIORITY_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh label_prefix.priority "" 2>/dev/null)
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
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
gh pr list --state merged --base "$BASE_BRANCH" --json author --limit 100

# Version progress (if versions.current configured in config)
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
if [ -n "$CURRENT_VERSION" ]; then
  # Use GitHub Milestones for version progress tracking
  gh api "repos/$REPO/milestones" --jq ".[] | select(.title == \"$CURRENT_VERSION\") | {open: .open_issues, closed: .closed_issues}"
fi
```

If `versions.current` is set, query version-tagged issues and calculate done/total percentage for the dashboard header.

### 6d: Format and display

Output a formatted dashboard like this:

```
TEAM DASHBOARD — {repo name}
{If CURRENT_VERSION set and milestone found:} Version {CURRENT_VERSION}: {closed}/{closed+open} tasks done ({pct}%)
{If active GitHub milestone (non-version):} Milestone: {active milestone} ({closed}/{total} = {pct}%)
════════════════════════════════════════════

{For each team member from config.yml:}
  {username} ({role})
     {If has assigned status:wip issue:} Working on: #{N} {title} [{priority}] {If ISSUE_STALE:} [UPDATED]
     {If has open PR:} PR: #{pr} — {CI status}
     {If idle:} Idle (last merged: #{last_merged_pr})

UNDER REVIEW (PR open, awaiting merge):
  {Issues with label "${STATUS_PREFIX}review" — show each:}
     #{N} {title} [{assignee}]

QUEUED ({queued_count}):
  {Issues unassigned or status:queued, sorted by priority (P0→P1→P2→P3→none), show top 5:}
     #{N} {title} [{priority}]
  {If queued_count > 5:} ... and {queued_count - 5} more — run /team queue to see all

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
