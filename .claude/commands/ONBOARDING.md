# Teamwork Onboarding Guide

> From zero to first PR in 10 minutes.

**Visual Encoding**: All example output in this guide follows `docs/visual-encoding-standard.md`.

---

## What You'll Learn

This guide walks you through the full teamwork cycle:

`/team` (setup) → `/team-claim` (pick task) → `/team-drive` (execute) → `/team-ship` (deliver PR)

By the end, you'll have:
- A configured teamwork system in your project
- GitHub labels, Issue template, CI workflow, and git hooks
- One complete mission cycle: Issue → Contract → Code → PR

---

## Prerequisites

Before starting, make sure you have:

| Requirement | Check command | Install |
|-------------|---------------|---------|
| Claude Code | `claude --version` | [claude.ai/code](https://claude.ai/code) |
| GitHub CLI | `gh --version` | [cli.github.com](https://cli.github.com/) |
| Git repo with GitHub remote | `git remote get-url origin` | `git remote add origin <url>` |
| gh authenticated | `gh auth status` | `gh auth login` |
| erwin skills installed | `ls ~/.claude/commands/team.md` | `cd erwin && ./install.sh teamwork` |

---

## Step 1: Initialize — `/team`

Open Claude Code in your project root:

```bash
cd your-project
claude
```

Then run:

```
/team
```

**What happens:**

1. Claude detects your project language (Node, Python, Go, etc.)
2. Asks you about team members, quality preferences, worktree isolation, and terminal tab title + color
3. Generates:

| File | What it does |
|------|-------------|
| `.teamwork/config.yml` | Team roster, test/lint/build commands, conventions |
| `.github/ISSUE_TEMPLATE/mission.yml` | Structured template for mission Issues |
| `.github/workflows/ci.yml` | CI pipeline: lint → test → build on every PR |
| `.githooks/pre-commit` | Runs linter before each commit |
| `.githooks/pre-push` | Runs tests before each push |

4. Creates GitHub labels: `mission`, `priority:P0`-`P3`, `status:queued`/`wip`/`review`/`done`/`blocked`
5. Commits everything and pushes

**After setup, running `/team` again shows the team dashboard:**

**MY DASHBOARD** — your-org/your-project ──────────────────
Teamwork v3.8.1 · **V1.0**  `████████░░`  30%  `3`/`10`

👥 **TEAM** (2 members)
  alice (tech-lead)
    🟢 **#042** Add user authentication 🟠 P1 → *wip*
    *mission/042-add-user-auth-alice* → `/team-ship`
    🔀 **#045** — ✅
  bob (backend)
    ⚪ *(idle)*

📋 **Unassigned** (2)
  🟠 P1 **#047**  Add rate limiting
  🟡 P2 **#049**  Write API docs

📊 **Merges**  alice: `12` · bob: `8`

💡 **Next:** `/team-claim` **#047** to start

`/team help` · `/team doctor` · `/team #N` · `/team config`

---

## Step 2: Create a Mission Issue — `/team-issue`

Use `/team-issue` to turn a natural language description into a structured GitHub Issue:

```
/team-issue Add user authentication with email + password
```

Claude will:
1. Ask clarifying questions (priority, scope, domain)
2. AI-enrich the Issue body: objective, sub-tasks, success criteria, relevant files
3. Preview the Issue before publishing
4. Create it on GitHub with labels (`mission`, `priority:P1`, `status:wip`)

Or create Issues manually via the GitHub "Mission Contract" template that `/team` installed.

> **Tip**: `/team-issue` requires `versions.current` to be set in config.yml if you want
> the Issue auto-assigned to the current milestone.

---

## Step 3: Claim the Mission — `/team-claim`

```
/team-claim #42
```

Or let Claude auto-select the highest priority unassigned Issue:

```
/team-claim
```

Or browse available missions:

```
/team-claim list
```

**What happens:**

1. Fetches Issue #42 from GitHub
2. Generates a **Mission Contract** at `.teamwork/active/MISSION-42.md`
   - This is NOT just a copy of the Issue — Claude enriches it with:
   - **Context Files**: scans your project to find files relevant to this mission
   - **Test Command**: from config or Issue body
   - **Structured sub-tasks**: broken down from the Issue body
3. Creates branch: *mission/042-add-user-auth-alice*
4. Posts claim comment on GitHub Issue

**Output:**

**CLAIMED** ──── **#042** Add user authentication ────────────
🟠  `P1`  Branch: *mission/042-add-user-auth-alice*
Contract:  `.teamwork/active/MISSION-42.md`

**OBJECTIVE**
  Implement JWT-based authentication for the API

**SUB-TASKS**
  [ ] Create auth middleware
  [ ] Add login/register endpoints
  [ ] Write tests for auth flow

**CONTEXT FILES**
  `src/middleware/index.ts`
  `src/routes/api.ts`
  `tests/api.test.ts`
────────────────────────────────────────────
`/team-drive` to execute │ `/team-ship` when done

---

## Step 4: Execute — `/team-drive`

```
/team-drive
```

**What happens:**

Claude reads your Mission Contract and enters execution mode:

1. **Displays mission briefing** with progress tracker
2. **For each sub-task:**
   - Announces: "Working on: Create auth middleware"
   - Reads the context files from the Contract
   - Implements the change
   - Runs tests to verify
   - Checks off the sub-task in the Contract with a timestamp
   - Commits: `feat(auth): add JWT middleware | Mission: #42`
3. **After all sub-tasks:**
   - Verifies acceptance criteria
   - Runs full test suite
   - Self-reviews all changes
   - Adds execution notes to the Contract

**The Contract tracks progress** — if you interrupt mid-task, the next `/team-drive` picks up where you left off (checkboxes preserve state).

**Output when done:**

✅ **COMPLETE** ── **#042** Add user authentication ────────────
  Code tasks: `3`/`3` complete
  Commits: `3` on *mission/042-add-user-auth-alice*

  [x] Create auth middleware — 14:23
  [x] Add login/register endpoints — 14:35
  [x] Write tests for auth flow — 14:42

  Tests: passing ✅
────────────────────────────────────────────
`/team-ship` to create PR

---

## Step 5: Deliver — `/team-ship`

```
/team-ship
```

**What happens:**

1. **Pre-flight checks:**
   - Verifies you're on the mission branch
   - Confirms all sub-tasks checked off
   - Runs tests one more time
2. **Pushes** branch to GitHub
3. **Creates PR** with:
   - Title: `feat: Add user authentication`
   - Body includes: objective, changes list, test results
   - Magic line: `Closes #42` (auto-closes Issue on merge)
4. **Watches CI** (if configured) — reports pass/fail
5. **Requests review** (if configured) — pings the tech-lead
6. **Cleans up** — removes local Contract, updates Issue labels

**Output:**

📦 **SHIPPED** ── **#042** Add user authentication ────────────
  🔀 PR: https://github.com/your-org/your-project/pull/45
  ✅ CI: passing
  👤 Review: requested from alice
  Labels: *review*
────────────────────────────────────────────
  `/team-ship done` (after merge) │ `/team-ship review` │ `/team`

---

## The Daily Workflow

Once set up, the daily cycle is:

| When | What | Command |
|------|------|---------|
| Morning | Pull + see dashboard | `git pull` → `/team` |
| Start work | Pick a task | `/team-claim` |
| Working | Execute with AI | `/team-drive` |
| Done | Deliver PR | `/team-ship` |
| After merge | Close Issue, clean up | `/team-ship done` |
| Repeat | Next task | `/team-claim` |
| Release | Prepare + promote | `/team-rc` |

---

## How It All Connects

```
GitHub Issue (#42)
    │
    ├── /team-claim ──→ Mission Contract (.teamwork/active/MISSION-42.md)
    │                     AI-enriched: context files, test commands, structured tasks
    │
    ├── /team-drive ──→ Code changes on branch mission/42-*
    │                     Each sub-task: implement → verify → commit
    │
    ├── /team-ship ───→ Pull Request (Closes #42)
    │                     Push → PR → CI check → review request → cleanup
    │
    ├── /team-ship done → Issue #42 closed, labels updated, worktree cleaned
    │
    └── Merge PR ─────→ Issue #42 auto-closed (if not already)
                         Branch auto-deleted (GitHub setting)
```

**Source of truth**: GitHub (Issues, PRs, CI)
**AI execution layer**: Mission Contract (ephemeral, enriched, local)
**Quality gates**: git hooks (local) + GitHub Actions (CI) + branch protection (review)

---

## Advanced Features

Once you're comfortable with the basic cycle, explore these shortcuts:

| Command | What it does |
|---------|-------------|
| `/team auto #42` | One-shot: claim → drive → ship in one command |
| `/team auto` | Pick from your queue, then auto |
| `/team wrap` | Retroactive: code-first → Issue + PR (for unplanned work) |
| `/team doctor` | Diagnose local health: orphan branches, stale contracts, cross-contamination |
| `/team doctor fix` | Interactive repair: execute doctor's action plan with confirmation |
| `/team queue` | See all open mission Issues sorted by priority |
| `/team learn` | Deep dive into design philosophy, visual diagrams, manual |

---

## Team Setup (Multiple People)

When running `/team` for the first time, select "2-3 people" (or more) and enter GitHub usernames.

Each team member then:
1. `cd your-project && git pull`
2. `claude` → `/team` (sees the dashboard)
3. `/team-claim` (picks an unassigned Issue)
4. `/team-drive` → `/team-ship`

**Rules:**
- One active mission per person (enforced by `/team-claim`)
- Issues are claimed via GitHub assignment (visible to the whole team)
- PRs link to Issues via `Closes #N` (GitHub tracks delivery)
- Dashboard shows who's doing what, in real time from GitHub data

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not authenticated" | Run `gh auth login` |
| "No git remote" | `git remote add origin <github-url>` |
| "Teamwork not initialized" | Run `/team` first |
| "Already have an active mission" | Finish current: `/team-ship`, or abandon: `/team doctor fix` |
| "Tests failing" | Fix tests before `/team-ship` — quality gate is intentional |
| "Branch already exists" | Previous attempt — `/team-claim` will switch to it |
| "CI failing after PR" | Push fixes to the same branch — PR updates automatically |
| Label creation fails | You may not have admin rights — non-fatal, continue |
| Branch protection fails | Free GitHub plans may not support this — non-fatal |

💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

---

## Config Reference

Run `/team config` to view your current config with edit instructions.

After `/team` init, your `.teamwork/config.yml` looks like:

```yaml
schema_version: 3
skill_version: 3.8.1

team:
  - github: alice
    role: tech-lead
  - github: bob
    role: backend

project:
  language: typescript
  test_command: "npm test"
  lint_command: "npm run lint"
  build_command: "npm run build"

conventions:
  branch_pattern: "mission/{issue}-{slug}-{user}"
  base_branch: main
  production_branch: main  # optional: set when using dual-branch mode (base ≠ production)
  commit_format: "type(scope): description | Mission: #{issue}"

label_prefix:
  status: "status:"
  priority: "priority:"
  size: "size:"

quality:
  hooks: true
  ci: true
  review_required: true
  branch_protection: true

# Optional features:
# Worktree mode is LOCAL (per-user): git config --local teamwork.worktree true
# versions:
#   current: "V1.0"
#   spec_path: ".claude/drive/v1.0-definition/spec.md"  # enables AI audit in /team-rc
#   lifecycle: [dev, qa, released]
```

Edit this file to change team members, commands, or quality preferences. Changes take effect immediately (no re-init needed).

---

## Step 6: Release — `/team-rc`

When all missions in the current milestone are done:

```
/team-rc              # Prepare: cut rc branch, deploy staging
/team-rc promote      # Promote: squash merge rc → main, tag, release
```

Flow:
1. `/team-rc` — cuts `rc/V1.0.x` branch from develop, triggers staging deploy
2. Verify on staging, apply hotfixes if needed
3. `/team-rc promote` — squash merges rc → main, tags, creates GitHub Release, closes milestone

**Prerequisites:**
- `versions.current: "V1.0"` in config.yml
- `conventions.base_branch: "develop"` and `conventions.production_branch: "main"`
- GitHub Milestone `V1.0` must exist (`gh api repos/{REPO}/milestones --method POST --field title="V1.0"`)
