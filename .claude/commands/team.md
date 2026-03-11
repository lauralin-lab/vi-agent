---
description: "Team dashboard + init. First time? Try: /team help"
version: "3.8.1"
---

# /team — Init + Dashboard (Teamwork v3)

> GitHub-first team coordination. Push-based task assignment with role-based permissions.

**Visual Encoding** (apply to ALL output — see `docs/visual-encoding-standard.md`):
`**bold**` → headers/labels (white) · `` `backtick` `` → commands/paths/counts (purple-blue) · `*italic*` → branches (dim) · `**#NNN**` → issues (light-blue clickable, 3+ digits) · `────` dividers · ⛔ NO code blocks around output

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Auto: first run → Init, subsequent → Dashboard |
| `#N` or number | Show MC #N details (branch, commits, PRs, criteria) |
| `help` or `-h` | Show quick-start guide for new users |
| `learn` | Show design philosophy, visual diagrams, and manual |
| `config` | View current config + edit instructions |
| `init` | Force re-initialize (even if config exists) |
| `queue` | Show all open mission Issues (full list, sorted by priority) |
| `doctor` | Run local git + issue health diagnostics |
| `doctor fix` | Interactive fix — execute doctor actions with confirmation |
| `doctor help` | Show doctor usage guide |
| `wrap` | Retroactive closure: code-first → issue + PR + labels |
| `auto [#N]` | One-shot: claim → drive → ship (pick from queue or specify #N) |

---

## Route by Argument

Parse `$ARGUMENTS`:
- If `help` or `-h` → jump to **Operation Help**
- If `learn` → jump to **Operation Learn**
- If `config` → jump to **Operation Config**
- If starts with `#` or is a number → jump to **Operation MC Detail**
- If `init` → jump to **Step 0** (skip config check, force init)
- If `queue` → jump to **Operation Queue**
- If `doctor help` → jump to **Operation Doctor Help**
- If `doctor fix` → jump to **Operation Doctor Fix**
- If `doctor` → jump to **Operation Doctor**
- If `wrap` → jump to **Operation Wrap**
- If starts with `auto` → jump to **Operation Auto**
- If empty → continue to **Step 0** (auto-detect init vs dashboard)

---

## Operation Help

Read `skill_version` from config for the header:

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || TEAMWORK_DIR=""
if [ -n "$TEAMWORK_DIR" ]; then
  SKILL_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh skill_version "3.8.1" 2>/dev/null)
else
  SKILL_VERSION="3.8.1"
fi
```

Output the following guide (substitute `{SKILL_VERSION}`) directly to the user, then **STOP**:

**TEAMWORK v{SKILL_VERSION}** — AI-Native Team Coordination (Push Model)
────────────────────────────────────────────

**SETUP** (one time)
  `/team`                 Auto-detect project, create config + CI + labels
  `/team init`            Force re-initialize (upgrade existing config)

**DAILY WORKFLOW**
  `/team`                 See role-based dashboard (leader=team view, member=my view)
  `/team #42`             View MC **#042** details (branch, commits, PRs)
  `/team doctor`          Local git + issue health diagnostics
  `/team doctor fix`      Interactive fix — execute actions with confirmation
  `/team-issue <desc>`    Create MC (solo: self-assign; team: prompt for assignee)
  `/team-issue <desc> @user`  Create MC + assign to @user
  `/team-issue fix #N`    Fix untracked Issue (add teamwork labels)
  `/team-issue batch ...` Batch create milestone + multiple MCs
  `/team-claim #N`        Claim assigned Issue → generate Contract + branch
  `/team-claim list`      Browse my assigned missions
  `/team-drive`           Execute mission (sub-tasks → test → commit loop)
  `/team-ship`            Push + create PR (auto-closes Issue on merge)
  `/team-ship review`     AI code review on PR

**ONE-SHOT**
  `/team auto #42`        Claim → Drive → Ship in one command
  `/team auto`            Pick from your assigned queue, then auto

**RETROACTIVE**
  `/team wrap`            Code-first closure (auto-detects state, creates issue+PR)

**AFTER MERGE**
  `/team-ship done`       Close Issue, update labels, clean up
  `/team-ship sync`       Rebase branch on latest base branch

**RC LIFECYCLE**
  `/team-rc`              Prepare: cut rc branch from *develop* → staging
  `/team-rc promote`      Promote: squash merge rc → *main*, tag, GitHub Release

**CONFIG & INFO**
  `/team config`          View current config + edit instructions
  `/team learn`           Design philosophy + visual guide (13 sections)
  `/team queue`           Browse all open missions sorted by priority
  `/team help`            This help screen

**LOCAL SETTINGS** (per-user)
  `git config --local teamwork.worktree true`    Enable worktree isolation
  `git config --local teamwork.worktree false`   Disable (branch-only mode)
  Tab title+color: `/team init` configures branch name display + type-based tab color
  Dashboard shows worktree map when enabled.

**REQUIREMENTS**
  `gh` (GitHub CLI)       `gh auth login`
  `git remote`            `git remote add origin <url>`

**DOCS** (in erwin repo)
  `docs/teamwork-ai-manual.md`         Complete manual
  `docs/team-doctor-design.md`         Doctor design spec
  `skills/teamwork/ONBOARDING.md`      Onboarding guide
────────────────────────────────────────────

---

## Operation Learn

Read and present the design philosophy behind this workflow. Output the content from the manual with visual diagrams, then **STOP**.

Read `skill_version` from config for the header:

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || TEAMWORK_DIR=""
if [ -n "$TEAMWORK_DIR" ]; then
  SKILL_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh skill_version "3.8.1" 2>/dev/null)
else
  SKILL_VERSION="3.8.1"
fi
```

Output the following (substitute `{SKILL_VERSION}`) directly and **STOP** (no file reading needed — content is self-contained):

**TEAMWORK v{SKILL_VERSION}** — Design Philosophy & Complete Guide
────────────────────────────────────────────────────────────────

**1. WHY THIS MODEL?**
────────────────────────

Traditional teams: 6 people, manageable commit frequency.
Our reality: 6 people + AI assistants = 20-30x commit frequency.

Problem with GitHub Flow (single branch):

```
main ── feat/A ── feat/B ── feat/C ── feat/D ── feat/E ──►
        (merge)   (merge)   (merge)   (merge)   (merge)

        ↑ deploy staging here
        │ while verifying, D and E merge in
        │ deploy again → F and G merge in
        └── you can never verify a stable snapshot
```

Solution: separate dirty work (*develop*) from clean production (*main*).

```
develop ── A ── B ── C ── D ── E ──►     ← AI noise goes here
                        │
                   rc/V0.1.0              ← frozen snapshot
                        │
main ────────────── [V0.1.0] ──►          ← only verified code
```


**2. THE FOUR BRANCHES**
────────────────────────

```
┌──────────┬──────────────┬───────────────────────┬───────────────────┐
│ Branch   │ Role         │ Who writes to it      │ How clean?        │
├──────────┼──────────────┼───────────────────────┼───────────────────┤
│ main     │ Production   │ Only rc/* via PR      │ Always clean      │
│ develop  │ Dev trunk    │ All feature PRs       │ CI-verified       │
│ rc/*     │ Staging      │ Hotfixes only         │ Converging        │
│ mission/*│ Work         │ You + AI              │ Dirty             │
└──────────┴──────────────┴───────────────────────┴───────────────────┘
```


**3. ISSUE LIFECYCLE — STATE MACHINE**
────────────────────────────────────

Every Issue transitions through exactly these states:

```
  ┌───────────┐     /team-issue     ┌───────────┐
  │  backlog  │ ──────────────────► │    wip    │
  └───────────┘                     └─────┬─────┘
                                          │ /team-ship
                                    ┌─────▼─────┐
                                    │  review   │
                                    └─────┬─────┘
                                          │ PR merged
                                    ┌─────▼─────┐
                                    │   done    │
                                    └───────────┘
```

Labels:  `status:backlog` → `status:wip` → `status:review` → `status:done`
GitHub:  Issue OPEN ─────────────────────────────► Issue CLOSED


**4. WHY SQUASH EVERYTHING?**
────────────────────────────

AI generates dozens of commits per feature. These are machine noise:

```
  mission/42-login ── 17 commits by AI ──────────────────►
  │ fix typo │ WIP │ try approach │ revert │ fix │ forgot save │ ...
  └───────────────────────────┬──────────────────────────────────┘
                              │ squash merge
                              ▼
  develop ── feat: user login system (#42) ──►   ← 1 clean commit
```

One Issue = one squash commit = one clean history entry.


**5. THE SIX SKILLS**
────────────────────────

Skills are grouped by lifecycle stage:

  CREATE    `/team-issue "desc"`        Create Issue + assign
  CLAIM     `/team-claim #42`           Generate Contract + mission branch
  EXECUTE   `/team-drive`               Code → test → commit loop
  DELIVER   `/team-ship`                Push + PR (auto-closes Issue on merge)
  RELEASE   `/team-rc`                  Cut RC → staging → production

  HUB       `/team`                     Dashboard, init, doctor, help, learn,
                                        queue, wrap, auto — all subcommands

Lifecycle flow:

```
  /team-issue → /team-claim → /team-drive → /team-ship → /team-ship done
       │              │              │              │              │
    Issue #42    Contract +     Code + test    PR created     Cleanup
    created      branch          loop         (squash)     branch deleted
```


**6. THE MISSION CONTRACT**
────────────────────────────

Contract = AI-enriched execution view of a GitHub Issue.
Lives at: `.teamwork/active/MISSION-42.md`

```
  ┌─────────────────────────────────────────────┐
  │ GitHub Issue #42           ← source of truth│
  │ ─────────────────                           │
  │ Title, Objective, Sub-tasks                 │
  └──────────────┬──────────────────────────────┘
                 │ /team-claim (auto-generate)
  ┌──────────────▼──────────────────────────────┐
  │ Mission Contract           ← AI view       │
  │ ─────────────────                           │
  │ Issue content                               │
  │ + Context Files (AI-scanned)                │
  │ + Test Command (from config)                │
  │ + AI Notes (populated during drive)         │
  │ + Issue content hash (freshness check)      │
  └─────────────────────────────────────────────┘
                 │ PR merged
                 ▼ Contract auto-deleted (ephemeral)
```


**7. SHORTCUTS — WRAP & AUTO**
────────────────────────────

Sometimes you don't follow the standard flow:

  `/team auto #42`    One-shot: claim → drive → ship in one command.
                      Stops at PR creation. Human merges.

```
                    ┌─────────────────────────────────┐
                    │ Claim → Drive → Ship → PR       │
                    │ (fully automated, no prompts)    │
                    └─────────────────────────────────┘
```

  `/team wrap`        Retroactive: you already wrote code, now
                      back-fill the teamwork flow.

                      Auto-detects your code state:
```
                    ┌──────────────────┬──────────────────────────┐
                    │ State            │ Strategy                 │
                    ├──────────────────┼──────────────────────────┤
                    │ Uncommitted      │ stash → issue → branch   │
                    │                  │ → stash pop → drive      │
                    │ Committed local  │ issue → branch →         │
                    │                  │ cherry-pick → drive      │
                    │ Already pushed   │ issue → close (tracking) │
                    └──────────────────┴──────────────────────────┘
```


**8. DASHBOARD & DOCTOR**
────────────────────────

`/team` — role-based GitHub status overview:

  **TEAM DASHBOARD** ── org/repo ───────────────
  **V0.1**  `█████░░░░░`  50%  `5/10`

  👥 **TEAM** (`3` members)
    alice (tech-lead)
      🟢 **#042** Add user auth 🟠
      🔀 **#045** — ✅
    bob (backend)
      🟢 **#050** API rate limiting 🟡
    charlie (frontend)
      ⚪ *(idle)*

  📋 **UNASSIGNED** (`2`)
    🔴 **#048**  Fix payment crash
  ──────────────────────────────────────────

`/team doctor` — local diagnostics (3-layer report):

```
  ┌─────────────────────────────────────────┐
  │ Layer 1: Snapshot Tables (raw data)     │
  │ Layer 2: Diagnosis (cross-referencing)  │
  │ Layer 3: Action Plan (exact commands)   │
  └─────────────────────────────────────────┘
```
  `12` checks: orphan branches, cross-contamination,
  branch staleness, stale stashes, worktree health,
  shippable PRs, issue health, remote sync,
  GitHub auth, contract freshness, test suite, PR CI


**9. RC LIFECYCLE** (the key innovation)
────────────────────────────────────

  `/team-rc`           → cut *rc/V0.1.0* from *develop* (frozen)
  verify on staging    → hotfix if needed (cherry-pick to *develop*)
  `/team-rc promote`   → squash merge rc → *main*, tag `V0.1.0`, GitHub Release

  Think of RC as a bus: missed this one? Take the next one.

```
  develop ── A ── B ── C ──────── D ── E ──►
                        │                │
                   rc/V0.1.0        rc/V0.2.0
                     (bus 1)         (bus 2)
                        │                │
  main ─────────── [V0.1.0] ───── [V0.2.0] ──►
```


**10. DESIGN PRINCIPLES**
────────────────────────

  1. GitHub IS the system — don't replicate what GitHub does
  2. Enhance, don't duplicate — Contract adds what Issue can't
  3. Ephemeral over persistent — local state is disposable
  4. Scripts for deterministic ops, LLM for judgment calls
  5. `6` skill limit — new features = subcommands, not new skills


**11. CONFIG MANAGEMENT**
────────────────────────

Two layers of config — shared team settings vs personal preferences.

  **SHARED** (committed to git):
```
  ┌──────────────────────────────────────────────────────┐
  │ .teamwork/config.yml (or .teamspace/config.yml)      │
  │                                                      │
  │ schema_version, skill_version                        │
  │ roles, members                                       │
  │ project (language, test/lint/build commands)          │
  │ conventions (branch pattern, base/production branch) │
  │ label_prefix, quality gates                          │
  │ notifications, versions                              │
  └──────────────────────────────────────────────────────┘
```

  **LOCAL** (per-user, not committed):
```
  ┌──────────────────────────────────────────────────────┐
  │ git config --local teamwork.worktree true/false      │
  │ Terminal tab title hook (~/.zshrc or equivalent)     │
  │ Desktop notification hook (~/.claude/notify.sh)     │
  │                                                      │
  │ Stored locally — each member configures once         │
  │ /team init asks worktree + tab title + notification  │
  └──────────────────────────────────────────────────────┘
```

  Tab title: terminal tab auto-shows current branch name
  (e.g. *mission/42-add-auth*). One-time shell hook setup.

  **Commands:**
    `/team config`          View current config + how to edit
    `/team init`            Re-run setup (merge mode: preserves existing,
                            upgrades version, adds missing sections,
                            asks worktree + tab title + notification)

  Edit `config.yml` directly — changes take effect immediately.
  No re-init needed for day-to-day config changes.

**12. MANUAL TASKS & HUMAN WORKFLOWS**
────────────────────────────────────

Some missions include tasks that AI cannot automate:
server access, third-party console config, deployment verification, etc.

  **CLASSIFICATION** (during `/team-drive` plan validation):
    ○  Code task — AI executes automatically
    🔧 MANUAL task — requires human action (AI skips)

  **EXECUTION:**
    `/team-drive` executes code tasks only.
    At completion, shows "YOUR TURN" handoff:

    🔧 **YOUR TURN** — `2` manual steps remaining
    ────────────────────────────────────────────
      1. Configure API keys in production
         → SSH to prod, update secrets manager
      2. Verify webhook in Stripe dashboard
         → dashboard.stripe.com → Webhooks
    ────────────────────────────────────────────

    Options: Done / Will do later / Need help / Skip

  **SHIPPING:**
    🔧 MANUAL tasks don't block `/team-ship`.
    PR includes "Manual Steps (post-merge)" checklist.
    User completes manual steps after merge.

**13. TIPS SYSTEM**
────────────────────

Every `/team-*` command shows a random tip after output:

  📦 **SHIPPED** ── **#042** user login ─────────────
  ...
  ────────────────────────────────────────────
  `/team-ship done` (after merge) │ `/team-ship review`

  💡 **Tip:** `/team auto` **#N** — 一键 claim→drive→ship

  Tips live in `scripts/tw-tips.txt`. Progressive feature discovery
  through natural usage — no need to read the manual to learn tricks.


────────────────────────────────────────────────────────────────
**DEEP DIVE** (docs in erwin repo)
  `docs/teamwork-ai-manual.md`        ← Complete manual (17 chapters)
  `docs/team-doctor-design.md`        ← Doctor design spec + examples
  `skills/teamwork/ONBOARDING.md`     ← Team onboarding guide
  `skills/teamwork/CHANGELOG.md`      ← Version history
────────────────────────────────────────────────────────────────

---

## Operation Config

> Triggered by `/team config`. Shows current config with edit instructions.

### Prerequisites

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```

### Display config

```bash
SKILL_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh skill_version "" 2>/dev/null)
WORKTREE_ENABLED=$(git config --local teamwork.worktree 2>/dev/null || echo "not set")
cat $TEAMWORK_DIR/config.yml
```

Output formatted display:

⚙️ **TEAMWORK CONFIG** ── v{SKILL_VERSION} ────────────────
**Config:**   `{TEAMWORK_DIR}/config.yml`
**Worktree mode:**  `{WORKTREE_ENABLED}` *(local, per-user)*

────────── **Shared Config** (committed) ──────────
{full config.yml content}
────────── **Local Settings** (per-user) ──────────
Worktree: `{WORKTREE_ENABLED}`

────────────────────────────────────────────
**HOW TO EDIT:**
  Shared config: edit `{TEAMWORK_DIR}/config.yml` directly
                 (changes take effect immediately, no re-init needed)
  Worktree mode: `git config --local teamwork.worktree true/false`
  Full re-init:  `/team init` (upgrades version, adds missing sections)
────────────────────────────────────────────

Then **STOP**.

---

## Operation Queue

Show the full list of open mission issues, sorted by priority. Requires existing config (same prerequisite check as dashboard).

### Prerequisite: config detection

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}
```

### Fetch and display

```bash
# Read mission label + priority prefix from config
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
# Now MISSION_LABEL, STATUS_PREFIX, PRIORITY_PREFIX are set

# Fetch all open mission issues
gh issue list --label "$MISSION_LABEL" --state open --json number,title,labels,assignees --limit 100
```

Sort by priority: P0 first → P1 → P2 → P3 → no priority last. Show assignee for each.

Output formatted list:

**QUEUE** ── {repo name} ── `{total}` open ────────────

🔴 **P0 CRITICAL**
  **#{N}**  {title}  @{assignee}

🟠 **P1 HIGH**
  **#{N}**  {title}  @{assignee}

🟡 **P2 MEDIUM**
  **#{N}**  {title}  @{assignee}

⚪ **P3 LOW**
  **#{N}**  {title}  @{assignee}

▸ **NO PRIORITY**
  **#{N}**  {title}  @{assignee}

────────────────────────────────────────────
`/team #{N}` details · `/team-claim #{N}` claim

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

If Issue not found → "**ERROR:** Issue **#$ISSUE_NUMBER** not found." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

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

**MC #{ISSUE_NUMBER}** ── {title} ────────────────
**Assignee:**   @{assignee}
**Status:**     *{wip/review/done}*
**Priority:**   {Pn}
**Milestone:**  {milestone or "—"}
**URL:**        {issue url}
────────────────────────────────────────────
{Full Issue body}
────────────────────────────────────────────

▸ **BRANCH**  *{branch or "(not created)"}*
  Commits: {commit log or "(none)"}

▸ **RELATED PRs**
  **#{pr}**  {state}  {CI status}
  {If none:} (none)

────────────────────────────────────────────
`/team-claim #{N}` to generate Contract + branch

If branch exists and user is not currently on it, show:

Hint: `/team-claim` **#{ISSUE_NUMBER}** to generate Contract and switch to branch

Then **STOP**.

---

## Step 0: Prerequisites

```bash
# Check gh CLI
gh --version 2>/dev/null || echo "GH_MISSING"

# Check git remote
git remote get-url origin 2>/dev/null || echo "NO_REMOTE"
```

- If `gh` not installed → "**ERROR:** GitHub CLI (`gh`) is required. Install: https://cli.github.com/" → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.
- If no git remote → "**ERROR:** No git remote configured. Run `git remote add origin <url>` first." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

```bash
# Get identity
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
```

- If `gh api user` fails → "**ERROR:** Not authenticated. Run `gh auth login` first." → **STOP**
  💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

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
  # Preserve existing TEAMWORK_DIR if config found, else default
  TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || TEAMWORK_DIR=".teamwork"
else
  # Auto-detect: config exists → dashboard, otherwise → init
  TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) && echo "DASHBOARD" || {
    echo "INIT"
    TEAMWORK_DIR=".teamwork"
  }
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

If "Git worktree" selected → set local git config (per-user, not committed):
```bash
git config --local teamwork.worktree true
```
Note: This is stored in `.git/config` (local to this clone). Each team member can independently choose their isolation strategy.

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
sed -i '' "s/^skill_version:.*/skill_version: 3.8.1/" $TEAMWORK_DIR/config.yml
# Linux fallback: sed -i "s/^skill_version:.*/skill_version: 3.8.1/" $TEAMWORK_DIR/config.yml

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

For each missing section, append the appropriate YAML block. Use the project info from the existing config where possible, or safe defaults (merge mode skips interactive Steps 2-3).

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
# In merge mode: use safe defaults (true). In fresh install: use answers from Step 3.
quality:
  hooks: true
  ci: true
  review_required: true
  branch_protection: true
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

**Step 4 — Migrate worktree setting (if present in config.yml):**

Worktree mode moved from shared config to local git config in v3.4.0.

```bash
if grep -q "^worktree:" $TEAMWORK_DIR/config.yml 2>/dev/null; then
  # Migrate: set local git config
  git config --local teamwork.worktree true
  # Remove worktree section from config.yml (no longer shared)
  sed -i '' '/^worktree:/,/^[^ #]/{ /^worktree:/d; /^  /d; }' $TEAMWORK_DIR/config.yml
  echo "Migrated: worktree mode → git config --local (per-user, no longer shared)"
fi
```

**Step 5 — Per-user local setup:**

Worktree, tab title, and notifications are now in **Step 4h** (shared by both merge mode and fresh install). Merge mode proceeds directly to Step 6.

**Step 6 — Handle missing sections with safe defaults:**

For `quality:` section, if missing, use safe defaults instead of referencing Step 3 variables (which are skipped in merge mode):

```bash
# If quality section is missing, append with safe defaults
if ! grep -q "^quality:" $TEAMWORK_DIR/config.yml; then
  cat >> $TEAMWORK_DIR/config.yml <<'EOF'

quality:
  hooks: true
  ci: true
  review_required: true
  branch_protection: true
EOF
fi
```

**Step 7 — Show merge summary:**

Read `SKILL_VERSION` from the config file AFTER the sed update in Step 1 (to get the updated value):

```bash
SKILL_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh skill_version "3.8.1" 2>/dev/null)
WORKTREE_STATUS=$(git config --local teamwork.worktree 2>/dev/null || echo "not set")
```

```
✅ Config updated (merge mode — existing config preserved)
   skill_version → {SKILL_VERSION}
   Preserved sections: {list of sections kept}
   Added sections: {list of sections appended, or "(none — already complete)"}
   {If worktree migrated:} Migrated: worktree → git config --local
   Worktree mode: {WORKTREE_STATUS}
   Tip: /team config to view full config │ /team to see dashboard
```

After showing the merge summary, proceed to **Step 4h: Per-user local setup** (worktree, tab title, notifications), then **Step 6: Dashboard**.

Do NOT overwrite `team`/`members`, `github`, `versions`, `roles`, `notifications`, or any unrecognized section.

---

#### FRESH INSTALL (config does not exist)

Write full config based on detected project info + user answers:

```yaml
schema_version: 3
skill_version: 3.8.1

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

# Note: Worktree mode is a LOCAL setting (per-user, not shared).
# Enable with: git config --local teamwork.worktree true

# Optional: Version tracking (required for /team-rc)
# versions:
#   current: "V1.0"
#   spec_path: ".claude/drive/v1.0-definition/spec.md"  # optional: enables AI audit in /team-rc
#   lifecycle: [dev, qa, released]
```

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

**Branch triggers**: Use `$BASE_BRANCH` from config (not hardcoded `main`). In dual-branch mode (when `$PROD_BRANCH != $BASE_BRANCH`), include both branches in `push` triggers so CI runs on production branch merges too:

```yaml
# Single-branch mode (default):
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]

# Dual-branch mode (PROD_BRANCH differs from BASE_BRANCH):
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}, {PROD_BRANCH}]
```

**For monorepo projects** (`IS_MONOREPO=true`), generate a multi-service CI that runs each service's checks in a separate job:

```yaml
name: CI
on:
  pull_request:
    branches: [{BASE_BRANCH}]
  push:
    branches: [{BASE_BRANCH}]  # add {PROD_BRANCH} if dual-branch mode

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
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
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

### 4h: Per-user local setup (runs for BOTH fresh install and merge mode)

Per-user settings are local (not committed to git). This step runs for EVERY user — first-time setup or returning. It ALWAYS shows a status dashboard, then offers to configure anything not yet enabled.

**Detect current state of ALL per-user settings:**

```bash
# 1. Worktree mode
WORKTREE_ENABLED=$(git config --local teamwork.worktree 2>/dev/null || echo "")
WORKTREE_ROOT=$(git config --local teamwork.worktree-root 2>/dev/null || echo "")

# 2. Tab title + color
if [ "$(basename "$SHELL")" = "fish" ]; then
  SHELL_RC="$HOME/.config/fish/config.fish"
else
  SHELL_RC="$HOME/.$(basename "$SHELL")rc"
fi
TAB_CONFIGURED=$(grep -q 'teamwork-tab' "$SHELL_RC" 2>/dev/null && echo "true" || echo "false")
TITLE_DISABLED=$(grep -q 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE' ~/.claude/settings.json 2>/dev/null && echo "true" || echo "false")

# 3. Desktop notifications
NOTIFY_CONFIGURED=$([ -f ~/.claude/notify.sh ] && echo "true" || echo "false")
```

**ALWAYS display the status dashboard** (even if everything is configured):

⚙️ **LOCAL SETUP** — @{GH_USER} ────────────────────────────
────────────────────────────────────────────

**Worktree isolation**
  Status:   {✅ enabled / ⚪ disabled / ⚪ not configured}
  Root:     {`{WORKTREE_ROOT}` if set / 💡 `(default: sibling directory)` if enabled but root unset / — if disabled}
  多任务并行开发，每个 mission 独立工作目录

**Tab title + branch color**
  Tab hook: {✅ installed / ❌ not installed}
  Claude title override: {✅ disabled / ⚠️ active (will override tab title)}
  终端标签页显示 branch 名 + 按类型着色 🟥🟦🟧🟩

**Desktop notifications**
  Hook:     {✅ installed / ❌ not installed}
  Method:   {If hook installed: `iTerm2 bell` (primary) + fallback auto-detect / —}
  Claude 需要你操作时弹出桌面通知，点击跳回对应 tab

────────────────────────────────────────────

**"Configured" definition for each feature:**
- Worktree: `WORKTREE_ENABLED` is `true` or `false` (explicit choice made)
- Worktree root: `WORKTREE_ROOT` is set (only relevant when `WORKTREE_ENABLED=true`)
- Tab title: `TAB_CONFIGURED=true` AND `TITLE_DISABLED=true`
- Notifications: `NOTIFY_CONFIGURED=true`

**If ALL are configured** → show:

All features configured. `/team config` to modify settings.

→ Proceed to next step (no AskUserQuestion needed).

**If ANY are NOT configured** → use `AskUserQuestion` to offer setup:

Build the options list dynamically from unconfigured items:

```
question: "以下功能推荐开启，选择要配置的项目："
options:
  {Only include unconfigured items:}
  - label: "全部开启（推荐）"
    description: "一键配置所有未开启的功能"
  - label: "Worktree 隔离"    # only if WORKTREE_ENABLED is empty (never configured)
    description: "每个 mission 独立目录，多任务不冲突"
  - label: "Worktree 根目录"  # only if WORKTREE_ENABLED=true but WORKTREE_ROOT empty
    description: "设置 worktree 创建位置（当前：默认同级目录）"
  - label: "Tab 标题+颜色"    # only if tab not configured
    description: "终端标签页自动显示 branch 名 + 类型着色"
  - label: "桌面通知"          # only if notify not configured
    description: "Claude 需要操作时弹出 macOS 通知"
  - label: "跳过"
    description: "以后用 /team config 配置"
```

**If user selects "全部开启"** → execute ALL unconfigured items below in sequence.
**If user selects a specific item** → execute only that item.
**If user selects "跳过"** → proceed to next step.

---

**Setup: Worktree isolation**

Use `AskUserQuestion`:
```
question: "Worktree 根目录设置 — worktree 工作目录创建在哪里？"
options:
  - label: ".claude/worktrees/"
    description: "与 Claude Code 原生 worktree 一致，项目内管理（推荐）"
  - label: "项目同级目录"
    description: "传统模式：../{repo}-wt-{slug}"
  - label: "自定义路径"
    description: "指定一个根目录，worktree 在其下创建"
```

If "自定义路径" → use `AskUserQuestion`:
```
question: "输入 worktree 根目录的绝对路径（worktree 会在此目录下创建子目录）"
```

Save the user's choice:
```bash
git config --local teamwork.worktree true

# Save worktree root path
# "claude" → .claude/worktrees/ (relative to repo root, same as Claude Code native)
# "sibling" → (empty — uses default ../repo-wt-slug)
# custom → the user-provided absolute path
git config --local teamwork.worktree-root "{chosen_path}"

# Create the root directory if it doesn't exist
mkdir -p "{chosen_path}"

# Ensure .claude/worktrees/ is in .gitignore (for "claude" option)
if ! grep -q '.claude/worktrees/' .gitignore 2>/dev/null; then
  echo '.claude/worktrees/' >> .gitignore
fi
```

**Worktree root values:**
- `.claude/worktrees/` → stored as relative path to repo root (matches Claude Code native behavior)
- Empty / unset → sibling mode (backward compat: `../{repo}-wt-{slug}`)
- Custom absolute path → stored as-is

---

**Setup: Tab title + color**

Two parts: (A) disable Claude Code title override, (B) install shell hook.

**Part A — Claude Code title override** (if `TITLE_DISABLED` is false):

```bash
python3 -c "
import json, os
p = os.path.expanduser('~/.claude/settings.json')
os.makedirs(os.path.dirname(p), exist_ok=True)
try:
    d = json.load(open(p)) if os.path.exists(p) else {}
except (json.JSONDecodeError, ValueError):
    d = {}
if not isinstance(d.get('env'), dict):
    d['env'] = {}
d['env']['CLAUDE_CODE_DISABLE_TERMINAL_TITLE'] = '1'
json.dump(d, open(p, 'w'), indent=2)
print('✅ Claude Code terminal title override disabled.')
"
```

**Part B — Shell hook** (if `TAB_CONFIGURED` is false):

Detect `$SHELL` and append the appropriate hook to the shell rc file:

**zsh** (`~/.zshrc`):
```bash
cat >> "$SHELL_RC" << 'HOOK'

# teamwork-tab: show branch name + auto-color iTerm2 tab
_teamwork_tab() {
  local b=$(git branch --show-current 2>/dev/null)
  [[ -z "$b" ]] && return
  printf '\e]1;%s\a' "$b"
  local r=80 g=80 b_=80
  case "$b" in
    main|master)        r=180 g=60  b_=60  ;;
    pre-launch|develop) r=60  g=100 b_=180 ;;
    rc/*|release/*)     r=200 g=140 b_=30  ;;
    mission/*)
      local num=${b#mission/}; num=${num%%-*}
      case $(( num % 8 )) in
        0) r=46  g=160 b_=120 ;; 1) r=180 g=120 b_=46  ;;
        2) r=140 g=70  b_=180 ;; 3) r=60  g=170 b_=70  ;;
        4) r=180 g=80  b_=120 ;; 5) r=70  g=140 b_=180 ;;
        6) r=180 g=140 b_=60  ;; 7) r=100 g=180 b_=160 ;;
      esac ;;
  esac
  printf '\e]6;1;bg;red;brightness;%d\a' "$r"
  printf '\e]6;1;bg;green;brightness;%d\a' "$g"
  printf '\e]6;1;bg;blue;brightness;%d\a' "$b_"
}
precmd_functions+=(_teamwork_tab)
HOOK
```

**bash** (`~/.bashrc`):
```bash
cat >> "$SHELL_RC" << 'HOOK'

# teamwork-tab: show branch name + auto-color iTerm2 tab
_teamwork_tab() {
  local b=$(git branch --show-current 2>/dev/null)
  [[ -z "$b" ]] && return
  printf '\e]1;%s\a' "$b"
  local r=80 g=80 b_=80
  case "$b" in
    main|master)        r=180 g=60  b_=60  ;;
    pre-launch|develop) r=60  g=100 b_=180 ;;
    rc/*|release/*)     r=200 g=140 b_=30  ;;
    mission/*)
      local num=${b#mission/}; num=${num%%-*}
      case $(( num % 8 )) in
        0) r=46  g=160 b_=120 ;; 1) r=180 g=120 b_=46  ;;
        2) r=140 g=70  b_=180 ;; 3) r=60  g=170 b_=70  ;;
        4) r=180 g=80  b_=120 ;; 5) r=70  g=140 b_=180 ;;
        6) r=180 g=140 b_=60  ;; 7) r=100 g=180 b_=160 ;;
      esac ;;
  esac
  printf '\e]6;1;bg;red;brightness;%d\a' "$r"
  printf '\e]6;1;bg;green;brightness;%d\a' "$g"
  printf '\e]6;1;bg;blue;brightness;%d\a' "$b_"
}
PROMPT_COMMAND="_teamwork_tab; $PROMPT_COMMAND"
HOOK
```

**fish** (`~/.config/fish/config.fish`):
```bash
SHELL_RC="$HOME/.config/fish/config.fish"
cat >> "$SHELL_RC" << 'HOOK'

# teamwork-tab: show branch name in terminal tab
function fish_title; set -l b (git branch --show-current 2>/dev/null); and echo $b; or echo (prompt_pwd); end
HOOK
```

Check for conflicts first: if `_teamwork_tab` already exists in the rc file, warn and show the snippet for manual integration.

Output:
```
Tab 标题+颜色已配置。新开终端标签页即可看到 branch 名和分支类型颜色。
颜色映射：🟥 main · 🟦 pre-launch · 🟧 rc/* · 🟩 mission/* · ⬜ other
```

**Note:** Tab colors use iTerm2 proprietary escape sequences (`\e]6;1;bg;...`). On non-iTerm2 terminals, the color sequences are silently ignored — the tab title still works.

---

**Setup: Desktop notifications**

**Part A — Check iTerm2 notification prerequisite:**

iTerm2 users: `printf '\a'` (bell) triggers iTerm2 native notification. Click jumps to exact tab. Zero dependencies.
Non-iTerm2 users: falls back to `terminal-notifier` (if installed) or `osascript`.

No install needed for iTerm2 — just ensure iTerm2 Preferences → Profiles → Terminal → Notifications is enabled.

**Part B — Write `~/.claude/notify.sh`:**

```bash
cat > ~/.claude/notify.sh << 'NOTIFEOF'
#!/bin/bash
# Claude Code notification — iTerm2 bell (primary) + bundled TTS sounds
# Primary: iTerm2 bell → native notification, click jumps to exact tab (zero deps)
# Fallback: terminal-notifier / osascript for non-iTerm2 terminals
# Skips subagent notifications.

INPUT=$(cat)

extract() {
  echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null
}

HOOK_EVENT=$(extract hook_event_name)
MESSAGE=$(extract message)
NOTIF_TYPE=$(extract notification_type)
CWD=$(extract cwd)

# ── Skip subagent events ──
IS_SUBAGENT=$(extract is_subagent)
SESSION_TYPE=$(extract session_type)
SUBAGENT_ID=$(extract subagent_id)

if [ "$IS_SUBAGENT" = "True" ] || [ "$IS_SUBAGENT" = "true" ]; then exit 0; fi
if [ "$SESSION_TYPE" = "subagent" ] || [ "$SESSION_TYPE" = "task" ]; then exit 0; fi
if [ -n "$SUBAGENT_ID" ] && [ "$SUBAGENT_ID" != "None" ] && [ "$SUBAGENT_ID" != "" ]; then exit 0; fi

# ── Project name ──
PROJECT=$(basename "$CWD" 2>/dev/null)

# ── Extract event-specific fields ──
LAST_MSG=$(extract last_assistant_message)
TEAMMATE_NAME=$(extract teammate_name)

short() { echo "$1" | tr '\n' ' ' | sed 's/^[[:space:]]*//' | head -c 100; }

# ── Sound file directory ──
SOUNDS_DIR="$HOME/.claude/sounds"

# ── Build summary + sound file (fixed per type) ──
SUMMARY=""
SOUND_FILE=""
NEEDS_VOICE=false

case "$HOOK_EVENT" in
  Notification)
    case "$NOTIF_TYPE" in
      permission_prompt)
        SUMMARY=$(short "$MESSAGE"); [ -z "$SUMMARY" ] && SUMMARY="Permission required"
        SOUND_FILE="$SOUNDS_DIR/permission-required.mp3"; NEEDS_VOICE=true ;;
      elicitation_dialog)
        SUMMARY=$(short "$MESSAGE"); [ -z "$SUMMARY" ] && SUMMARY="Question for you"
        SOUND_FILE="$SOUNDS_DIR/waiting-for-input.mp3"; NEEDS_VOICE=true ;;
      idle_prompt)
        SUMMARY="Waiting for input"
        SOUND_FILE="$SOUNDS_DIR/waiting-for-input.mp3"; NEEDS_VOICE=true ;;
      auth_success) SUMMARY="Authentication successful" ;;
      *)
        SUMMARY=$(short "$MESSAGE"); [ -z "$SUMMARY" ] && SUMMARY="Needs attention"
        SOUND_FILE="$SOUNDS_DIR/needs-attention.mp3"; NEEDS_VOICE=true ;;
    esac ;;
  Stop)
    SUMMARY=$(short "$LAST_MSG"); [ -z "$SUMMARY" ] && SUMMARY="Task complete"
    SOUND_FILE="$SOUNDS_DIR/task-complete.mp3"; NEEDS_VOICE=true ;;
  TeammateIdle)
    if [ -n "$TEAMMATE_NAME" ] && [ "$TEAMMATE_NAME" != "None" ]; then
      SUMMARY="Teammate ${TEAMMATE_NAME} is idle"
    else SUMMARY="Teammate idle"; fi
    SOUND_FILE="$SOUNDS_DIR/teammate-idle.mp3" ;;
  *)
    SUMMARY="Needs attention"
    SOUND_FILE="$SOUNDS_DIR/needs-attention.mp3"; NEEDS_VOICE=true ;;
esac

# ── Notification dispatch ──
# Primary: iTerm2 bell → native notification, click jumps to exact tab
# Fallback 1: terminal-notifier → click activates terminal window
# Fallback 2: osascript → click opens Script Editor (worst UX)
SESSION_TTY=$(ps -p $PPID -o tty= 2>/dev/null | tr -d ' ')
if [ -n "$SESSION_TTY" ] && [ -w "/dev/$SESSION_TTY" ]; then
  printf '\a' > /dev/$SESSION_TTY
elif command -v terminal-notifier &>/dev/null; then
  terminal-notifier -title "$PROJECT" -message "$SUMMARY" -activate com.googlecode.iterm2
else
  ESCAPED_PROJECT=$(echo "$PROJECT" | sed "s/\"/\\\\\"/g")
  ESCAPED_SUMMARY=$(echo "$SUMMARY" | sed "s/\"/\\\\\"/g")
  osascript -e "display notification \"${ESCAPED_SUMMARY}\" with title \"${ESCAPED_PROJECT}\""
fi

# ── Play bundled sound — only for events requiring user intervention ──
if [ "$NEEDS_VOICE" = "true" ] && [ -f "$SOUND_FILE" ]; then
  afplay "$SOUND_FILE" &
fi

exit 0
NOTIFEOF
chmod +x ~/.claude/notify.sh
```

**Part C — Register hooks in `~/.claude/settings.json`:**

```bash
python3 -c "
import json, os
p = os.path.expanduser('~/.claude/settings.json')
os.makedirs(os.path.dirname(p), exist_ok=True)
try:
    d = json.load(open(p)) if os.path.exists(p) else {}
except (json.JSONDecodeError, ValueError):
    d = {}
if not isinstance(d.get('hooks'), dict):
    d['hooks'] = {}
hook_entry = [{'matcher': '', 'hooks': [{'type': 'command', 'command': '~/.claude/notify.sh'}]}]
changed = False
for event in ['Notification', 'Stop', 'TeammateIdle']:
    if event not in d['hooks']:
        d['hooks'][event] = hook_entry
        changed = True
    else:
        has_notify = any(
            h.get('command', '').endswith('notify.sh')
            for rule in d['hooks'][event]
            for h in rule.get('hooks', [])
        )
        if not has_notify:
            d['hooks'][event].extend(hook_entry)
            changed = True
if changed:
    json.dump(d, open(p, 'w'), indent=2)
    print('registered')
else:
    print('already_registered')
"
```

Output:
```
✅ 桌面通知已配置
   Hook: `~/.claude/notify.sh`
   Events: Notification, Stop, TeammateIdle
   iTerm2: bell → 原生通知，点击跳到对应 tab（零依赖）
   其他终端: 自动降级 terminal-notifier / osascript
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
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"

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
  SOURCE_BRANCH=$(git branch --show-current)
  git checkout -b "$BASE_BRANCH"
  git push -u origin "$BASE_BRANCH"
  echo "Created $BASE_BRANCH branch from $SOURCE_BRANCH"
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

Output: "Teamwork initialized! Next: create Issues using the Mission template, then `/team-claim` to start working.

💡 Tip: {random tip — read `~/.claude/commands/scripts/tw-tips.txt`, pick one non-comment line at random}"

After commit+push, proceed to **Step 4h: Per-user local setup** (worktree, tab title, notifications), then **Step 6: Dashboard**.

---

## Step 6: Dashboard

Read data from GitHub and config, then display a role-based formatted dashboard.

### 6a: Read config + determine role
```bash
cat $TEAMWORK_DIR/config.yml
```

**Determine current user's role level:**
```bash
USER_LEVEL=$(bash ~/.claude/commands/scripts/tw-config.sh get-user-level "$GH_USER" 2>/dev/null)
USER_LEVEL="${USER_LEVEL:-leader}"
# USER_LEVEL is "solo", "leader", or "member"
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

- If `issue_content_hash` is not in Contract (legacy) → skip check
- If `gh issue view` fails (network) → skip check (non-fatal)
- If `CURRENT_HASH ≠ CONTRACT_HASH` → set `ISSUE_STALE=true` for this Issue
- If hashes match → Issue content unchanged since claim

### 6c: Fetch GitHub data

Read the mission label and label prefixes from config:

```bash
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
# Now MISSION_LABEL, STATUS_PREFIX, PRIORITY_PREFIX are set

BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
CURRENT_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
SKILL_VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh skill_version "?" 2>/dev/null)
```

**Performance: fetch data in parallel.** Make these calls using **parallel Bash tool calls** (not sequential):

```bash
# Call 1: ALL mission issues (replaces 3 separate calls — filter WIP/review/unassigned client-side from labels)
gh issue list --label "$MISSION_LABEL" --state open --json number,title,assignees,labels,milestone --limit 100

# Call 2: Open PRs
gh pr list --json number,title,author,headRefName,statusCheckRollup,reviewDecision --limit 20

# Call 2b: Behind-base count for PR branches (lightweight — local git only, no API)
git fetch origin "$BASE_BRANCH" --quiet 2>/dev/null
for branch in $(gh pr list --json headRefName --jq '.[].headRefName' 2>/dev/null); do
  if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
    behind=$(git rev-list --count "origin/$branch..origin/$BASE_BRANCH" 2>/dev/null || echo "0")
    echo "$branch:$behind"
  fi
done

# Call 3: All open issues (for untracked detection) — leader: all assigned; member: own only
gh issue list --state open --json number,title,labels,assignees --limit 100
# (member: add --assignee "$GH_USER" --limit 50)

# Call 4: Merged PR count
gh pr list --state merged --base "$BASE_BRANCH" --json author --limit 100

# Call 5 (if CURRENT_VERSION set): Milestone progress
if [ -n "$CURRENT_VERSION" ]; then
  MILESTONE_FULL=$(bash ~/.claude/commands/scripts/tw-git.sh milestone-resolve "$CURRENT_VERSION" 2>/dev/null)
  gh api "repos/$REPO/milestones" --jq ".[] | select(.title == \"$MILESTONE_FULL\") | {open: .open_issues, closed: .closed_issues}"
fi
```

```bash
# Call 6: Local mission branches with merged PRs (cleanup detection)
bash ~/.claude/commands/scripts/tw-git.sh list-merged-branches 2>/dev/null

# Call 7: Local git state (for NEEDS CLEANUP dirty tree hint)
git branch --show-current
git status --porcelain 2>/dev/null

# Call 8: Worktree context (local per-user setting, not shared config)
WORKTREE_ENABLED=$(git config --local teamwork.worktree 2>/dev/null || echo "false")
if [ "$WORKTREE_ENABLED" = "true" ]; then
  # Worktree list (main + extras)
  git worktree list --porcelain

  # Current location: which worktree are we in?
  pwd  # compare against worktree paths to mark ⭐

  # Cross-reference: for each worktree branch, check if it matches
  # any active Contract's branch field in $TEAMWORK_DIR/active/MISSION-*.md
  # This enables the "→ #42 title" association in the display
  for contract in $TEAMWORK_DIR/active/MISSION-*.md; do
    [ -f "$contract" ] || continue
    grep -E '^(issue|branch|title):' "$contract" 2>/dev/null
  done
fi
```

**Client-side filtering** from Call 1 results (no extra API calls):
- **WIP issues**: entries where labels contain `${STATUS_PREFIX}wip`
- **Review issues**: entries where labels contain `${STATUS_PREFIX}review`
- **Unassigned**: entries where assignees is empty
- **Priority**: extract from labels matching `${PRIORITY_PREFIX}P*`

**Compute untracked issues**: Call 3 results MINUS Call 1 results (by issue number). Issues in Call 3 but not in Call 1 are untracked — assigned on GitHub but missing the mission label.

### 6d: Format and display (role-based)

**⚠️ WORKTREE SECTION — MANDATORY CHECK before rendering dashboard:**

If Call 8 found `WORKTREE_ENABLED=true`, you MUST include the `📂 WORKTREES` section in the dashboard output. This is NOT optional. Run these commands to get the data:

```bash
git config --local teamwork.worktree 2>/dev/null  # "true" = show section
git worktree list  # get all worktrees
pwd  # determine current location (⭐ marker)
```

If worktree mode is enabled, render this section right after the milestone progress bar:

📂 **Worktrees** *(worktree mode)*
    · {short path}  ← *{branch}*  → **#{issue}** {title │ (no mission)}
    ⭐ {short path}  ← *{branch}*  → **#{issue}** {title │ (no mission)}

Use `~` to shorten home directory in paths. If current branch ≠ any Contract branch, add to alert block: ⚠️ **Context mismatch** — `cd {correct path}`

Output a formatted dashboard based on user's role level.

#### Solo / Leader Dashboard

**⚠️ FORMATTING** — Apply Visual Encoding Standard (see header). ⛔ NO code blocks, `- ` lists, or `### ` headers anywhere in output. **⛔ BEFORE YOU OUTPUT: mentally check each line — every command/path needs backticks, every issue number needs `**#NNN**` bold.**

Output the ENTIRE dashboard as plain markdown text:

⚠️ **ACTION NEEDED**
  Orphan contract: issue **#{N}** is CLOSED. Run: `/team doctor fix`
  On base branch with worktree mode — switch to mission branch or disable worktree
{^ alert commands MUST be in backticks for purple-blue color}

**MY DASHBOARD** — {repo name} ──────────────────
Teamwork v{SKILL_VERSION} · **{VERSION}**  `{progress_bar}`  {pct}%  {done}/{total}

{If WORKTREE_ENABLED — ALWAYS show, even if only main repo worktree exists:}
📂 **Worktrees** *(worktree mode)* 🟥 main · 🟦 develop · 🟧 rc · 🟩 mission · ⬜ other
  ⭐ {branch_color} `{worktree_path}` ← *{branch}* → **#{issue}** {title}
  · {branch_color} `{worktree_path}` ← *{branch}* → **#{issue}** {title}
  {or: → *(no mission)* if on main repo. Show ALL from `git worktree list`}
{^ worktree_path = actual path from `git worktree list` output, e.g. ~/Project/myapp or ~/Project/myapp-wt-42-auth}
{^ branch_color = 🟥 main/master · 🟦 pre-launch/develop · 🟧 rc/* · 🟩 mission/* · ⬜ other}
{^ paths in backticks = purple-blue. branches in italic = dim}
{^ color legend is on the header line — compact, not a separate footer line}
{^ current worktree = ⭐ (yellow star, high visibility). other worktrees = · (dim dot)}

👥 **TEAM** ({member_count} members)
  {username} ({role})
    🟢 **#{N}** {title} {priority_dot} {Pn} → *wip* {If STALE: ⚡}
    *{branch}* → `/team-ship`
    🔀 **#{pr}** — {ci_icon}
  {username} ({role})
    ⚪ *(idle)*

🔀 **Under Review** ({count})
  🟡 **#{N}**  {title}  @{assignee}
  {If none:} (none)

📋 **Unassigned** ({count})
  {priority_dot} {Pn} **#{N}**  {title}
  {If count > 5:} ... +{remaining} more → `/team queue`
  {If none:} (none)

⚠️ **Untracked** ({count})
  Issues with teamwork labels but missing mission label
  Includes: **#{N}**, **#{N}**, ...
  Fix: `/team-issue fix` **#N** for each, or batch-add the mission label
  {Omit entire section if count == 0}

🧹 **Needs Cleanup** ({count})
  *{branch}* — PR **#{pr}** merged
  💡 Run: `/team-ship done`
  {Omit entire section if count == 0}

📊 **Merges**  {user}: `{n}` · {user}: `{n}` · ...
{^ wrap merge COUNTS in backticks for purple-blue numbers — makes them pop against plain-text usernames}

💡 **Next:** {one context-specific suggestion — see NEXT logic below}
{^ EVERY command and path in Next MUST be in backticks}

`/team help` · `/team doctor` · `/team #N` · `/team config`
`/team-claim` · `/team-drive` · `/team-ship` · `/team-rc`

💡 **Tip:** {random tip — commands in backticks, e.g.: `/team auto` **#N** — 一键 claim→drive→ship}

**NEXT suggestion logic** — pick FIRST match (output commands in backticks):

1. Orphan contract (issue closed, contract exists) → `/team doctor fix` to clean up, then `/team-claim`
2. Merged PR branch still exists locally → `/team-ship done` to clean up
3. PR behind base → PR **#{N}** is {M} behind — `/team-ship sync`
4. PR CI passed + approved → PR **#{N}** ready to merge. `/team-ship done`
5. PR CI passed, no review → PR **#{N}** CI passed — awaiting review/merge
6. PR CI failing → PR **#{N}** CI failing — fix before merge
7. Active mission, no PR → `/team-drive` to continue or `/team-ship` to deliver
8. No active mission → `/team-claim` **#{N}** to start

**Visual encoding rules** (apply to ALL teamwork output):

| Symbol | Meaning | Used for |
|--------|---------|----------|
| 🔴 | P0 critical | Priority dot in issue lines |
| 🟠 | P1 high | Priority dot |
| 🟡 | P2 medium / under review | Priority dot / review status |
| ⚪ | P3 low / idle | Priority dot / member idle |

**`{priority_dot}`** shorthand: replace `Pn` prefix with colored dot — `🔴` P0, `🟠` P1, `🟡` P2, `⚪` P3. E.g., `🟠 #134 Unified NanoClaw Architecture @initialneil`.

**Other symbols:**

| Symbol | Meaning | Used for |
|--------|---------|----------|
| 🟢 | Active / WIP | Member working status |
| ⚪ | Idle | Member not working on anything |
| ✅ | Done / CI passing | Completed items, CI green |
| ❌ | Failed / CI failing | CI red, errors |
| ⏳ | CI pending | CI in progress |
| ⚡ | Stale / updated | Issue changed since claim |
| 🔀 | PR / merge | Pull request related |
| 🟡 | Under review | Review status (different context from P1) |
| 🔧 | MANUAL / human action | Task requiring human action (AI skips) |

**Progress bar**: Map percentage to 10 chars: `█` for filled, `░` for empty. Wrap the ENTIRE bar in backticks for color: `` `██░░░░░░░░` ``. E.g., 14% → `` `█░░░░░░░░░` ``, 50% → `` `█████░░░░░` ``.

**Issue number formatting**: ALWAYS zero-pad to 3+ digits. `#99` → `#099`, `#7` → `#007`. Claude Code only auto-links `#NNN` (3+ digits) as GitHub issues — two-digit `#NN` is NOT linked.

**`{ci_icon}`** shorthand: `✅` if all checks pass, `❌` if any fail, `⏳` if pending/running.

**Error recovery rule** (applies to ALL `/team-*` skills):

When ANY teamwork skill encounters an error and STOPs, append this line after the error message:

💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

Skills should NEVER suggest raw git/rm/shell commands as remediation. Instead, always guide to:
- `/team doctor` — for diagnosis (what's wrong)
- `/team doctor fix` — for interactive repair (fix it)
- Another teamwork command — when the fix is a specific workflow step (e.g., `/team-ship sync`)

**Why:** Doctor centralizes all diagnostic + repair logic. Skills don't need to duplicate it. Users learn one recovery path instead of memorizing per-command fixes.

---

#### Member Dashboard

**⚠️ FORMATTING** — Apply Visual Encoding Standard (see header). ⛔ NO code blocks, `- ` lists, or `### ` headers anywhere in output. **⛔ BEFORE YOU OUTPUT: mentally check each line — every command/path needs backticks, every issue number needs `**#NNN**` bold.**

Focus on user's own work, then team summary below `────`.

Output the ENTIRE dashboard as plain markdown text (no code blocks anywhere):

⚠️ **ACTION NEEDED**
  Orphan contract: issue **#{N}** is CLOSED. Run: `/team doctor fix`
  On base branch — switch to mission branch or disable worktree
{^ alert commands MUST be in backticks for purple-blue color}

**MY DASHBOARD** — {repo name} ──────────────────
Teamwork v{SKILL_VERSION} · **{VERSION}**  `{progress_bar}`  {pct}%  {done}/{total}

{If WORKTREE_ENABLED — ALWAYS show, even if only main repo worktree exists:}
📂 **Worktrees** *(worktree mode)* 🟥 main · 🟦 develop · 🟧 rc · 🟩 mission · ⬜ other
  ⭐ {branch_color} `{worktree_path}` ← *{branch}* → **#{issue}** {title}
  · {branch_color} `{worktree_path}` ← *{branch}* → **#{issue}** {title}
  {or: → *(no mission)* if on main repo. Show ALL from `git worktree list`}
{^ worktree_path = actual path from `git worktree list` output}
{^ branch_color = 🟥 main/master · 🟦 pre-launch/develop · 🟧 rc/* · 🟩 mission/* · ⬜ other}
{^ paths in backticks = purple-blue. branches in italic = dim}
{^ color legend is on the header line — compact, not a separate footer line}
{^ current worktree = ⭐ (yellow star, high visibility). other worktrees = · (dim dot)}

🎯 **My Missions**
  🟢 **#{N}** {title} {priority_dot} {Pn} → *wip*
    *{branch}* → `/team-drive`
  🟢 **#{N}** {title} {priority_dot} {Pn} → *wip* (Contract active)
    *{branch}* → `cd` to worktree, then `/team-drive`
  {If none:} (none)
{^ branch italic, commands in backticks}

🔀 **My PRs**
  **#{pr}** {title}  {ci_icon}  {review}
  {If behind > 0: ⚠️ {N} behind {BASE_BRANCH} → `/team-ship sync`}
  {If none:} (none)

────────────────────────────────────────

👥 **Team WIP** ({count})
  {priority_dot} {Pn} **#{N}**  {title}  @{assignee}
  {Show up to 10 items sorted by priority}
  {If count > 10:} ... +{remaining} more → `/team queue`

🔀 **Under Review** ({count})
  🟡 **#{N}**  {title}  @{assignee}  {ci_icon}
  {If none shown}

📋 **Unassigned** ({count})
  {priority_dot} {Pn} **#{N}**  {title}
  {If none:} (none)

📊 **Merges**  {user}: `{n}` · {user}: `{n}` · ...
{^ wrap merge COUNTS in backticks for purple-blue numbers — makes them pop against plain-text usernames}

💡 **Next:** {one context-specific suggestion — see NEXT logic in Leader Dashboard}
{^ EVERY command and path in Next MUST be in backticks}

`/team help` · `/team doctor` · `/team #N` · `/team config`
`/team-claim` · `/team-drive` · `/team-ship` · `/team-rc`

💡 **Tip:** {random tip — commands in backticks, e.g.: `/team auto` **#N** — 一键 claim→drive→ship}

{Use same NEXT suggestion logic as Leader Dashboard}

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
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "Teamwork not initialized. Run /team first."
  # STOP
}

# Read config values
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
# Now MISSION_LABEL, STATUS_PREFIX, PRIORITY_PREFIX are set
```

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

# 14. Branch vs Remote tracking (ahead/behind own remote branch)
for branch in $(git branch --format='%(refname:short)'); do
  if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
    echo "$branch: $(git rev-list --left-right --count origin/$branch...$branch 2>/dev/null)"
  else
    echo "$branch: NO_REMOTE"
  fi
done

# 15. GitHub auth status (for Check 9)
gh auth status 2>&1

# 16. Contract freshness data (for Check 10)
for contract in $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null; do
  [ -f "$contract" ] || continue
  issue_num=$(basename "$contract" | sed 's/MISSION-\(.*\)\.md/\1/')
  contract_hash=$(bash ~/.claude/commands/scripts/tw-contract.sh read-field "$contract" "issue_content_hash" 2>/dev/null)
  echo "CONTRACT:$issue_num:$contract_hash"
done

# 17. Test command from config (for Check 11)
bash ~/.claude/commands/scripts/tw-config.sh project.test_command "" 2>/dev/null
```

### Analysis Phase — 12 Diagnostic Checks

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

Detect prunable worktrees, worktrees on deleted/merged branches, and worktree-mission alignment issues.

```
Parse git worktree list --porcelain output:
  For each worktree (skip the main one):
    1. Check if marked "prunable" → 🟡 prunable
    2. Check if branch is an orphan (issue closed / PR merged) → 🟡 orphan
    3. Check if worktree directory exists on disk → if not, 🔴 broken (corrupted)
    4. Check if branch is a non-mission branch (doesn't match mission/* pattern)
       AND no active Contract references this branch
       AND branch has no corresponding open Issue
       → 🟡 idle worktree
       Message: "Worktree {path} on {branch} has no associated mission or open issue.
       Remove with: git worktree remove {path}"
    5. Cross-check with active Contracts: if CURRENT worktree's branch doesn't match
       any active Contract's branch → 🟡 context mismatch
       Message: "You're in worktree {path} on {branch}, but active mission is on {contract.branch}.
       Commands like /team-drive will operate on wrong context.
       cd {path where Contract's branch lives}"
    6. Main-repo mismatch: if worktree mode is enabled (git config --local teamwork.worktree = true)
       AND current directory is the main repo (not a worktree — no .mission file)
       AND active Contracts exist in $TEAMWORK_DIR/active/
       → 🔴 main-repo mismatch
       For each active Contract, find its worktree path from git worktree list.
       Message: "Worktree mode enabled but you're in the main repo.
       Running /team-drive or /team-ship here bypasses worktree isolation.
       Switch to your mission worktree:
         cd {worktree_path}  ← #{issue} {title}"
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
     Action: `/team doctor fix`
```

Heuristics for duplicate detection (LLM judgment):
- "fix camera on Safari" and "iOS media access broken" are the same problem even with zero shared words
- "add rate limiting" and "rate limit upload API" overlap but may be different scope — flag as potential, not definite
- Issues sharing >50% sub-tasks are likely duplicates

#### Check 8: Remote Sync (Behind Origin)

Local branches that are behind their own remote tracking branch need a pull.

```
For each local branch that has a remote tracking branch (origin/{branch}):
  1. Count commits behind: git rev-list --count {branch}..origin/{branch}
  2. Count commits ahead: git rev-list --count origin/{branch}..{branch}
  3. Thresholds:
     - behind = 0 → OK (don't report)
     - behind > 0, ahead = 0 → 🟡 WARNING "behind remote, needs pull"
     - behind > 0, ahead > 0 → 🟡 WARNING "diverged from remote"
  4. Special attention to current branch — if current branch is behind remote,
     this is the most actionable finding (user can fix RIGHT NOW with git pull --rebase)
  5. Action: git pull --rebase origin {branch}, or /team-ship sync if on a mission branch
```

#### Check 9: GitHub Auth Health

Verify the `gh` CLI is properly authenticated. Many teamwork operations fail silently or with confusing errors when auth is broken.

```
1. Parse `gh auth status` output
2. Check for:
   - "Logged in to github.com" → 🟢 OK
   - "not logged in" or error → 🔴 CRITICAL
     Action: `gh auth login`
   - Token scopes missing (no repo, no read:org) → 🟡 WARNING
     Action: `gh auth refresh -s repo,read:org`
3. If auth fails entirely (gh not installed) → 🔴 CRITICAL
   Action: install gh CLI
```

This check runs FIRST — if auth is broken, skip all GitHub API checks (they'll all fail).

#### Check 10: Contract Freshness

Active Contracts may be stale — the Issue was updated on GitHub but the Contract still has old content.

```
For each active Contract in $TEAMWORK_DIR/active/MISSION-*.md:
  1. Read issue_content_hash from Contract frontmatter
  2. If no hash → skip (pre-v2.3.0 Contract, can't compare)
  3. Fetch current Issue: gh issue view {issue} --json title,body
  4. Compute current hash: bash tw-contract.sh hash "$TITLE" "$BODY"
  5. Compare:
     - Hashes match → 🟢 OK (Contract is fresh)
     - Hashes differ → 🟡 WARNING "Contract for #{issue} is stale — Issue was updated since claim"
       Action: `/team-drive` will auto-detect this and offer refresh
       Or re-claim: delete Contract, then `/team-claim #{issue}`
```

#### Check 11: Test Suite Health

Run the project's test command to verify the codebase is in a working state.

```
1. Read test command from config: project.test_command
2. If no test command configured → skip (no finding, just note "no test command configured")
3. Run the test command
4. Results:
   - Tests pass → 🟢 OK "Tests passing"
   - Tests fail → 🟡 WARNING "Tests failing — fix before shipping"
     Action: fix failing tests, then `/team-ship`
   - Test command not found/executable → 🟡 WARNING "Test command not runnable: {command}"
     Action: update `project.test_command` in config via `/team config`
```

Note: only run tests if the working tree is clean (no uncommitted changes). Dirty tree may cause false failures.

#### Check 12: PR CI Status

Check CI status on all open PRs — extends Check 6 (Shippable PRs) with failure details.

```
For each open PR from data collection (Call 9):
  1. Parse statusCheckRollup for individual check results
  2. If any check FAILED:
     - 🟡 WARNING "PR #{pr} CI failing: {check name}"
     - Show which specific checks failed (not just "CI red")
     - Action: push fixes to branch *{branch}*, or investigate failing check
  3. If checks PENDING for >30 minutes:
     - 🟢 INFO "PR #{pr} CI pending for extended time"
  4. If no checks configured:
     - 🟢 INFO (not a problem, just noting)
```

### Output Format — 3-Layer Visual Report

1. **Snapshot tables** — structured data, one table per dimension (branches, PRs, stashes, worktrees, issues)
2. **Diagnosis** — LLM cross-referencing analysis (the high-value part humans can't do with `git status`)
3. **Action Plan** — prioritized fix list, grouped by urgency

#### Layer 1: Snapshot Tables

Each table shows raw state with inline emoji status indicators. Tables use box-drawing characters for visual clarity. Only show tables that have content worth reporting (skip empty/clean dimensions).

**Branches table** — all local branches (not just mission/*):
- Status column: `🔴 dirty` (uncommitted changes), `🟢 clean`, `🟡 stale` (>30 commits behind), `💀 orph` (issue closed / PR merged)
- vs Base column: `+N, -M` (commits ahead/behind base branch)
- vs Remote column: `+N, -M` (commits ahead/behind own `origin/{branch}`), `⚠ behind` if local is behind remote, `—` if no remote tracking branch

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
- **Prefer teamwork commands over raw git** where applicable:
  - Shippable PRs → `/team-ship done` (not raw `gh pr merge`)
  - Branch behind remote → `/team-ship sync` or `git pull --rebase`
  - Large stashes → `/team-issue "..."` to create a proper MC
  - Duplicate issues → `gh issue close N --reason "not planned" --comment "Duplicate of #M"`
- Stash drops must be ordered from highest index first (indices shift on drop)
- Cross-contamination fixes suggest both options (discard vs stash for later)
- **Remind user**: "Run `/team doctor fix` to execute these actions interactively."

#### Clean State Output

If all checks pass:

🏥 **LOCAL HEALTH** — {repo name}
────────────────────────────────────────────────────
🟢 All clear.
   `{N}` mission branches — all active, no contamination
   `{N}` stashes — all recent
   `{N}` worktrees — all healthy
   `{N}` open PRs — none ready to ship yet
   `{N}` open issues — no duplicates, all assigned
────────────────────────────────────────────────────

No tables, no diagnosis, no action plan. Just the summary.

#### Report Format Example

🏥 **LOCAL HEALTH** — {repo name}
   Current: *{current branch}* · Base: *{base branch}*
────────────────────────────────────────────────────────────────────────────

```
📋 BRANCHES ({N} local)
┌──────────────────────────────┬────────────┬──────────┬────────────┬──────────────────────────────────────┐
│ Branch                       │ Status     │ vs Base  │ vs Remote  │ Issue / PR                           │
├──────────────────────────────┼────────────┼──────────┼────────────┼──────────────────────────────────────┤
│ main [cur]                   │ 🟢 clean   │ —        │ ⚠ -3       │ base branch                          │
│ mission/42-feat-*            │ 🔴 dirty   │ +6, -1   │ +2, 0      │ #42 OPEN  │ PR #43 ✅ pass          │
│ mission/29-fix-*             │ 💀 orph    │ +0, -38  │ —          │ #29 CLOSED│ PR #30 merged            │
└──────────────────────────────┴────────────┴──────────┴────────────┴──────────────────────────────────────┘

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
```

🔍 **DIAGNOSIS**
────────────────────────────────────────────────────────────────────────────

{🔴/🟡/🟢 severity findings — LLM cross-references all data and outputs
 narrative insights. Group related findings. Explain WHY, not just WHAT.
 Prioritize cross-contamination and shippable PRs first.}

📌 **ACTION PLAN** (`{N}` actions)
────────────────────────────────────────────────────────────────────────────

 🔴 **Critical**
 ────────────────────
 [1] {action}: `{exact command(s)}`

 🟡 **Warning**
 ────────────────────
 [2] {action}: `{exact command(s)}`

 🟢 **Cleanup**
 ────────────────────
 [3] {action}: `{exact command(s)}`

────────────────────────────────────────────────────────────────────────────
**SUMMARY:** 🔴 `{N}` critical · 🟡 `{N}` warnings · 🟢 `{N}` cleanup
Run `/team doctor fix` to execute these actions interactively.
────────────────────────────────────────────────────────────────────────────

Then **STOP**.

---

## Operation Doctor Help

> Triggered by `/team doctor help`. Self-contained usage guide for doctor.

Output the following and **STOP**:

**`/team doctor`** — Local Git Health Diagnostics
────────────────────────────────────────────

**USAGE**
  `/team doctor`          Full health scan (branches, stashes, worktrees, issues, PRs)
  `/team doctor fix`      Interactive fix — execute actions with confirmation
  `/team doctor help`     This help screen

**WHAT IT CHECKS**
  1. Orphan branches      Local branches whose Issue is closed / PR merged
  2. Cross-contamination  Uncommitted changes that belong to a different Issue
  3. Branch staleness     Branches falling behind base branch
  4. Stale stashes        Old stashes or stashes on deleted branches
  5. Worktree health      Prunable or broken worktrees
  6. Shippable PRs        PRs ready to merge but sitting idle
  7. Issue health         Duplicates, unassigned, stale issues
  8. Remote sync          Local branches behind their remote tracking branch
  9. GitHub auth          `gh` CLI authentication and token scopes
  10. Contract freshness  Active Contracts vs current Issue content
  11. Test suite          Run project test command, report failures
  12. PR CI status        CI check details on open PRs (extends Check 6)

**OUTPUT**
  Layer 1: Snapshot tables (branches, stashes, worktrees, PRs, issues)
  Layer 2: Diagnosis (cross-referencing analysis)
  Layer 3: Action plan (prioritized fix commands)

**TYPICAL WORKFLOW**
  `/team doctor`          ← see what's wrong
  `/team doctor fix`      ← fix it interactively

**SEVERITY LEVELS**
  🔴 Critical   Fix before continuing (data loss risk, cross-contamination)
  🟡 Warning    Fix soon (blocking progress, accumulating debt)
  🟢 Cleanup    Low urgency (orphan branches, old stashes)

---

## Operation Doctor Fix

> Triggered by `/team doctor fix`. Runs the full doctor scan, then interactively executes actions.

### Prerequisites

Same as Operation Doctor — config must exist, `gh` must be authenticated, must be in a git repo.

### Step 1: Run Full Doctor Scan

Execute the complete Operation Doctor flow (data collection → analysis → output). Display the full report.

### Step 2: Interactive Execution

After displaying the report, process the Action Plan items interactively. Group by severity:

**🟢 Cleanup (auto-execute with summary):**

Safe, reversible operations. Execute all at once without per-item confirmation:
- `git branch -d {branch}` (only `-d`, never `-D` — fails safely if unmerged)
- `git worktree remove {path}` (for prunable worktrees)

Before executing, display:

🟢 **AUTO-CLEANUP** (`{N}` actions):
   [5] Delete orphan branch *mission/139*: `git branch -d mission/139-*`
   [6] Delete orphan branch *develop*: `git branch -d develop`
   ...
   Executing...

Execute each command. Report results:

   ✅ [5] Deleted *mission/139-teamwork-skill-v3.1.0*
   ✅ [6] Deleted *develop*
   ❌ [7] Failed: branch has unmerged changes (use `-D` to force)

**🟡 Warning (confirm each):**

Use `AskUserQuestion` for each warning action:

```
question: "Action [N]: {description}"
options:
  - label: "Execute"
    description: "{exact command}"
  - label: "Skip"
    description: "Leave as-is"
  - label: "Skip all remaining"
    description: "Stop fixing, keep remaining items"
```

For actions with multiple options (e.g., stash review — drop vs apply):
```
question: "Action [1]: stash@{0} contains v3.1.0 skill updates (12 files)"
options:
  - label: "Drop stash"
    description: "git stash drop stash@{0}"
  - label: "Apply to current branch"
    description: "git stash pop"
  - label: "Create new mission"
    description: "/team-issue 'feat: apply stashed v3.1.0 updates'"
  - label: "Skip"
    description: "Leave stash as-is"
```

**Idle worktree** — worktree with no mission or open issue:
```
question: "Action [N]: worktree {path} on {branch} has no associated mission"
options:
  - label: "Remove worktree"
    description: "git worktree remove {path}"
  - label: "Remove worktree + delete branch"
    description: "git worktree remove {path} && git branch -d {branch}"
  - label: "Skip"
    description: "Keep worktree"
```

**Main-repo mismatch** — worktree mode enabled but user is in main repo:
```
question: "Action [N]: Worktree mode enabled but you're in the main repo. Mission #{issue} has a worktree at {path}."
options:
  - label: "Show worktree path"
    description: "Print: cd {worktree_path}"
  - label: "Disable worktree mode"
    description: "git config --local teamwork.worktree false"
  - label: "Skip"
    description: "Leave as-is"
```

**Branch behind remote** — suggest the right teamwork command:
```
question: "Action [N]: {branch} is {M} commits behind origin/{branch}"
options:
  - label: "Pull latest"
    description: "git pull --rebase origin {branch}"
  - label: "Skip"
    description: "Leave as-is"
```

**🔴 Critical (confirm each, explain risk):**

Same as Warning but add risk context in the question:
```
question: "🔴 CRITICAL Action [N]: {description}\nRisk: {what could go wrong}"
```

Cross-contamination actions always show both options (discard vs preserve).

### Step 3: Summary

After all actions processed:

🏥 **DOCTOR FIX COMPLETE**
────────────────────────────────────────────
   ✅ Executed: `{N}` actions
   ⏭️ Skipped:  `{N}` actions
   ❌ Failed:   `{N}` actions
────────────────────────────────────────────

If any failed → show the failed commands and suggest manual resolution.

Then **STOP**.

---

## Operation Auto

> Triggered by `/team auto` or `/team auto #N`. One-shot forward closure: claim an Issue → drive (execute all sub-tasks) → ship (push + PR) in a single command. Stops at PR creation — human merges.

### Prerequisites

```bash
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
if [ -z "$GH_USER" ]; then
  echo "ERROR: Cannot get GitHub user identity. Run 'gh auth login' first."
  exit 1
fi
```

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}

eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
```

Check for worktree mode — auto doesn't support worktrees:
```bash
if [ -f .mission ]; then
  echo "ERROR: You're in a worktree. Run /team auto from the main repo."
  # STOP
fi
```

Check for clean working tree — auto switches branches, so uncommitted changes would be lost:
```bash
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree has uncommitted changes. Commit or stash them first, or use /team wrap instead."
  # STOP
fi
```

Check for active Contract — if one exists, user should finish or abandon it first:
```bash
ls "$TEAMWORK_DIR"/active/MISSION-*.md 2>/dev/null
```
If active Contract exists → "You have an active mission. Finish it with `/team-drive` + `/team-ship`, or run `/team doctor fix` to clean up." → **STOP**

### A1: Select Issue

**If `$ARGUMENTS` contains `#N` or a number** (e.g., `/team auto #42`, `/team auto 42`):
- Extract Issue number → proceed to A2

**If `$ARGUMENTS` is just `auto`** (no number):
- List the user's assigned open mission Issues:

```bash
gh issue list --label "$MISSION_LABEL" --state open --assignee "$GH_USER" --json number,title,labels --limit 10
```

- If none → "No missions assigned to you. Create one with `/team-issue` first." → **STOP**
- Sort by priority (P0 first)
- Display:

🤖 **AUTO MODE** — Select Issue
────────────────────────────────────────────
Your assigned missions:
  🔴 1. **#042** fix: camera permission on iOS Safari
  🟠 2. **#045** feat: add rate limiting
  🟡 3. **#047** docs: write API documentation
────────────────────────────────────────────

- Use `AskUserQuestion` to pick one

### A2: Validate Issue

```bash
ISSUE_DATA=$(gh issue view {issue} --json number,title,body,labels,milestone,assignees,state,url)
```

- If Issue not found → "Issue #{issue} not found." → **STOP**
- If Issue is closed → "Issue #{issue} is already closed." → **STOP**
- If Issue has no assignee → auto-assign to `$GH_USER`: `gh issue edit {issue} --add-assignee "$GH_USER"`
- If Issue is assigned to someone else → warn "Issue #{issue} is assigned to someone else." Use `AskUserQuestion`: "Claim anyway?" / "Cancel". If cancel → **STOP**. If claim → also add `$GH_USER` as assignee.
- If Issue is missing `$MISSION_LABEL` → warn "Issue #{issue} is not a mission Issue (missing `$MISSION_LABEL` label). Use `/team-issue fix #{issue}` first." → **STOP**

Display the issue summary and announce auto mode:

🤖 **AUTO** ── **#{issue}** {title} ────────────────
{priority_dot} {priority}   Size: `{size}`
Milestone: {milestone or "—"}

🎯 **OBJECTIVE**
  {objective from Issue body}

📋 **SUB-TASKS**
  [ ] {task 1}
  [ ] {task 2}

⚡ **AUTO PLAN**
  Phase 1: Claim → Contract + branch
  Phase 2: Drive → execute all sub-tasks
  Phase 3: Ship → push + PR
  Stops at: PR created (you merge manually)
────────────────────────────────────────────

Use `AskUserQuestion`: "Start auto?" / "Cancel"
- If cancel → **STOP**

### A3: Phase 1 — Claim (streamlined)

Execute the claim flow without interactive confirmations (auto mode assumes defaults).

#### Fetch & parse Issue

Parse the Issue body — same logic as `/team-claim` Step 3. Extract:
- Objective, Sub-tasks, Success Criteria, Context, Test Command
- Milestone from `milestone.title`, fallback to `versions.current` config
- Priority from labels

#### Generate Mission Contract

Create `$TEAMWORK_DIR/active/MISSION-{issue}.md` — same structure as `/team-claim` Step 4:

```markdown
---
issue: {issue}
url: {url}
title: "{title}"
assignee: {GH_USER}
priority: {priority}
labels: [{labels}]
branch: {branch}
milestone: "{milestone}"
claimed: {ISO_TIMESTAMP}
issue_content_hash: "$(bash ~/.claude/commands/scripts/tw-contract.sh hash "$TITLE" "$BODY")"
---

# MISSION-{issue}: {title}

## Objective
{from Issue body}

## Sub-tasks
{from Issue body}

## Acceptance Criteria
{from Issue body}

## Context Files
{AI-scanned: use Glob and Grep to find relevant project files}

## Test Command
{from Issue body or config project.test_command}

## AI Notes
(populated during drive execution)
```

**Context Files scanning** is the key AI value-add — scan the project to identify files that will need modification, related tests, and config files. Use `Glob` and `Grep` with keywords from the Issue.

#### Create branch

```bash
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$ISSUE_TITLE")
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
```

#### Post claim comment

```bash
gh issue comment {issue} --body "🤖 Auto-claimed by @${GH_USER} — running claim → drive → ship"
```

Non-fatal if comment fails.

#### Announce Phase 1 complete

✅ **PHASE 1: CLAIMED**
   Contract: `$TEAMWORK_DIR/active/MISSION-{issue}.md`
   Branch:   *{branch}*
   Proceeding to drive...
────────────────────────────────────────────

### A4: Phase 2 — Drive (full protocol)

**This is the core execution phase.** Follow the complete `/team-drive` protocol.

Read `~/.claude/commands/team-drive.md` and execute its full procedure, **starting from Step 1** (Verify Branch). Skip Step 0 and Step 0b — Contract already exists and is fresh.

Specifically:
1. **Skip** Step 0 (Find Active Contract) — Contract already created in A3
2. **Skip** Step 0b (Freshness Check) — Contract was just generated from latest Issue
3. **Execute** Step 1 (Verify Branch) — confirm on correct branch
4. **Execute** Step 2 (Display Mission Briefing)
5. **Execute** Step 2b (Branch Safety Check) — confirm not on protected branch
6. **Execute** the full drive execution loop — read code, validate sub-tasks (tag `🔧 MANUAL` tasks), execute **code tasks** with team if needed, test, commit, update Contract checkboxes
7. **Continue** until all **code** sub-tasks are checked off (skip `🔧 MANUAL` tasks)
8. **Manual Ops Handoff** (if MANUAL tasks exist) — surface `🔧 YOUR TURN` block, `AskUserQuestion` for user to confirm/defer/skip

The drive phase follows all `/team-drive` rules:
- Sub-tasks are hypotheses — validate against actual code, rewrite if wrong
- Execute with discipline: ripple check, self-adversarial review
- Test after every change
- Commit progress regularly (`bash ~/.claude/commands/scripts/tw-git.sh commit "..."`)
- Update Contract checkboxes as tasks complete
- If using Drive Mode (`/drive` skill), follow its full protocol (Phase T team assembly, wave decomposition, etc.)

**On drive failure or blocker:**
- If a sub-task is truly blocked → update Contract with blocker note in AI Notes
- Skip the blocked task, continue with remaining tasks
- At end of drive, if any tasks blocked → report blockers and ask: "Ship partial progress?" / "Stop here"
- If "Stop here" → **STOP** (Contract and branch remain for manual continuation)

#### Announce Phase 2 complete

✅ **PHASE 2: DRIVEN**
   Code tasks: `{code_done}/{code_total}` complete
   {If MANUAL tasks:} Manual: `{manual_count}` tasks (YOUR TURN — see handoff above)
   Commits:   `{N}` commits on *{branch}*
   {If blocked tasks:} Blocked: {list}
   Proceeding to ship...
────────────────────────────────────────────

### A5: Phase 3 — Ship (streamlined)

Execute the ship flow without interactive confirmations.

#### Pre-flight checks

1. **Verify branch**: confirm on mission branch
2. **Verify sub-tasks**: all **code** checkboxes checked (`🔧 MANUAL` tasks allowed unchecked)
3. **Sync checkboxes to GitHub Issue** (defense-in-depth):
   ```bash
   bash ~/.claude/commands/scripts/tw-contract.sh sync-all-checkboxes "$CONTRACT_PATH" $ISSUE_NUMBER
   ```
   Non-fatal: if sync fails, warn but continue.
4. **Clean working tree**: if uncommitted changes exist, commit them:
   ```bash
   bash ~/.claude/commands/scripts/tw-git.sh commit "chore: pre-ship cleanup | Mission: #${ISSUE_NUMBER}"
   ```
5. **Run tests** (if configured):
   ```bash
   TEST_CMD=$(bash ~/.claude/commands/scripts/tw-config.sh project.test_command "" 2>/dev/null)
   if [ -n "$TEST_CMD" ]; then
     eval "$TEST_CMD"
   fi
   ```
   - If tests fail → "Tests failing. Fix before shipping." → attempt to fix, re-run. If still failing after 3 attempts → **STOP** with clear error.

#### Push

```bash
bash ~/.claude/commands/scripts/tw-git.sh push "$BRANCH"
```

If push fails → attempt rebase:
```bash
bash ~/.claude/commands/scripts/tw-git.sh rebase "$BASE_BRANCH"
bash ~/.claude/commands/scripts/tw-git.sh push "$BRANCH"
```
If still fails → **STOP**

#### Create PR

```bash
# Check for existing PR (exits 1 if no PR found — suppress with || true)
EXISTING_PR=$(bash ~/.claude/commands/scripts/tw-pr.sh exists "$BRANCH" 2>/dev/null) || true
if [ -n "$EXISTING_PR" ]; then
  echo "PR already exists: $EXISTING_PR"
  # Use existing PR number/url, skip creation
fi
```

If no existing PR:
```bash
COMMIT_TYPE=$(bash ~/.claude/commands/scripts/tw-pr.sh commit-type "$ISSUE_TITLE")

# Build PR body from Contract (same format as /team-ship Step 4b)
PR_RESULT=$(bash ~/.claude/commands/scripts/tw-pr.sh create "$ISSUE_NUMBER" "${COMMIT_TYPE}: ${ISSUE_TITLE}" "$PR_BODY" "$BASE_BRANCH" "$BRANCH")
PR_NUMBER=$(echo "$PR_RESULT" | cut -d' ' -f1)
PR_URL=$(echo "$PR_RESULT" | cut -d' ' -f2)
```

PR body format:
```markdown
Closes #{issue}

## Objective
{from Contract}

## Changes
{completed sub-tasks as bullet list}

## Acceptance Criteria
{from Contract}

## Test
{test command} — {passing/skipped}

## AI Notes
{from Contract AI Notes section}
```

#### Post-ship cleanup

```bash
# Comment on Issue
bash ~/.claude/commands/scripts/tw-pr.sh comment "$ISSUE_NUMBER" "📦 PR #${PR_NUMBER} created — ${PR_URL}"

# Label transition: wip → review (on Issue)
bash ~/.claude/commands/scripts/tw-label.sh transition "$ISSUE_NUMBER" wip review

# Add review label to PR itself (matches /team-ship Step 4e)
bash ~/.claude/commands/scripts/tw-label.sh pr-label "$PR_NUMBER" review
```

All non-fatal — warn on failure, continue.

#### CI check (if configured)

```bash
CI_ENABLED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.ci "false" 2>/dev/null)
if [ "$CI_ENABLED" = "true" ]; then
  bash ~/.claude/commands/scripts/tw-pr.sh watch "$PR_NUMBER"
fi
```

#### Remove Contract (AFTER CI — keep Contract if CI fails so user can resume with /team-drive)

```bash
bash ~/.claude/commands/scripts/tw-contract.sh delete "$TEAMWORK_DIR/active/MISSION-${ISSUE_NUMBER}.md"
```

#### Request review (if configured)

```bash
REVIEW_REQUIRED=$(bash ~/.claude/commands/scripts/tw-config.sh quality.review_required "" 2>/dev/null)
```
If review required → find tech-lead from config → `bash ~/.claude/commands/scripts/tw-pr.sh add-reviewer "$PR_NUMBER" "$REVIEWER"`

### A6: Final Output

🤖 **AUTO COMPLETE** ── **#{issue}** {title} ────────────
────────────────────────────────────────────

✅ **PHASE 1: CLAIMED**
   Branch: *{branch}*

✅ **PHASE 2: DRIVEN**
   Code tasks: `{code_done}/{code_total}`
   {If MANUAL tasks:} Manual: `{manual_count}` pending (post-merge)

✅ **PHASE 3: SHIPPED**
   🔀 PR: {pr_url}
   {ci_icon} CI: {status}
   Review: {requested / not required}
   Labels: {current labels}

────────────────────────────────────────────
⏳ Waiting for human merge.
After merge: `/team-ship done #{issue}`
────────────────────────────────────────────

### Error Handling

- Issue not found → **STOP** at A2
- Issue closed → **STOP** at A2
- Active Contract exists → **STOP** at prerequisites (run `/team doctor fix` to clean up)
- Branch creation fails → **STOP** at A3
- Drive blocked on all tasks → **STOP** at A4 with partial progress
- Tests persistently fail → **STOP** at A5 with branch pushed (fix tests, then `/team-ship`)
- Push fails after rebase → **STOP** at A5 (run `/team-ship sync`)
- PR creation fails → **STOP** at A5 (branch is pushed, run `/team-ship` to create PR)
- Label/comment/review operations fail → warn, continue (non-fatal)

**On any STOP:** Always append: 💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

---

## Operation Wrap

> Triggered by `/team wrap`. Retroactive closure: user changed code first, now needs to back-fill the teamwork flow (issue + PR + labels). Auto-detects code state and picks the right strategy.

### W0: Prerequisites

```bash
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
if [ -z "$GH_USER" ]; then
  echo "ERROR: Cannot get GitHub user identity. Run 'gh auth login' first."
  exit 1
fi
```

```bash
TEAMWORK_DIR=$(bash ~/.claude/commands/scripts/tw-config.sh detect-dir 2>/dev/null) || {
  echo "No teamwork config found. Run /team init first."
  # STOP
}

eval "$(bash ~/.claude/commands/scripts/tw-config.sh resolve-labels 2>/dev/null)"
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)

# Milestone for Issue creation (from config, if set)
MILESTONE=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
if [ -n "$MILESTONE" ]; then
  MILESTONE=$(bash ~/.claude/commands/scripts/tw-git.sh milestone-resolve "$MILESTONE" 2>/dev/null)
fi
```

Check for active Contract — if one exists, wrap is not the right tool:
```bash
ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null
```
If active Contract exists → "You have an active mission. Use `/team-drive` and `/team-ship` instead." → **STOP**

### W1: Detect Code State

```bash
CURRENT_BRANCH=$(git branch --show-current)

# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain)

# Check for unpushed commits on current branch
# Must handle branches with no remote tracking (never pushed)
if git rev-parse --verify "origin/${CURRENT_BRANCH}" >/dev/null 2>&1; then
  UNPUSHED=$(git log "origin/${CURRENT_BRANCH}..HEAD" --oneline 2>/dev/null) || UNPUSHED=""
  HAS_REMOTE_TRACKING=true
else
  # No remote tracking — ALL commits diverging from base are "unpushed"
  UNPUSHED=$(git log "origin/${BASE_BRANCH}..HEAD" --oneline 2>/dev/null) || UNPUSHED=""
  HAS_REMOTE_TRACKING=false
fi

# Check if current branch has commits pushed that diverge from base
# Only meaningful if branch has remote tracking
if [ "$HAS_REMOTE_TRACKING" = true ]; then
  PUSHED_AHEAD=$(git log "origin/${BASE_BRANCH}..origin/${CURRENT_BRANCH}" --oneline 2>/dev/null) || PUSHED_AHEAD=""
else
  PUSHED_AHEAD=""
fi
```

**State detection logic** (mutually exclusive, checked in this order):

| Condition | State |
|-----------|-------|
| `UNCOMMITTED` is non-empty AND `UNPUSHED` is empty | **UNCOMMITTED** — changes not yet committed |
| `UNPUSHED` is non-empty | **COMMITTED_NOT_PUSHED** — committed but not pushed |
| `HAS_REMOTE_TRACKING` = true AND `PUSHED_AHEAD` is non-empty | **COMMITTED_PUSHED** — already pushed to remote |
| None of the above | "No changes detected. Nothing to wrap." → **STOP** |

Display detected state to user:

🔄 **WRAP** — Retroactive Closure
────────────────────────────────────────────
**Branch:**   *{CURRENT_BRANCH}*
**State:**    `{UNCOMMITTED / COMMITTED_NOT_PUSHED / COMMITTED_PUSHED}`

{State-specific description — see below}
────────────────────────────────────────────

State descriptions:
- **UNCOMMITTED**: "Uncommitted changes detected. Will stash → create issue → claim branch → apply → drive → ship."
- **COMMITTED_NOT_PUSHED**: "Unpushed commits detected. Will create issue → claim branch → cherry-pick → reset base → drive → ship."
- **COMMITTED_PUSHED**: "Changes already pushed to remote. Can only retroactively track (create issue + labels + close)."

### W2: Gather Change Summary

Regardless of state, analyze the changes to generate an issue description:

**For UNCOMMITTED:**
```bash
git diff --stat
git diff  # full diff for AI analysis
```

**For COMMITTED_NOT_PUSHED:**
```bash
git log "origin/${BASE_BRANCH}..HEAD" --oneline
git diff "origin/${BASE_BRANCH}..HEAD" --stat
git diff "origin/${BASE_BRANCH}..HEAD"  # full diff for AI analysis
```

**For COMMITTED_PUSHED:**
```bash
# If on base branch, analyze recent commits not yet tracked by teamwork
git log "origin/${BASE_BRANCH}..HEAD" --oneline 2>/dev/null || \
  git log --oneline -10  # fallback: show recent commits
git diff "origin/${BASE_BRANCH}..HEAD" --stat 2>/dev/null || \
  git diff HEAD~5..HEAD --stat  # fallback
```

AI analyzes the diff/commits to determine:
1. **Title** — concise, prefixed with type (`fix:`, `feat:`, `refactor:`, etc.)
2. **Priority** — P0/P1/P2/P3 (default P2)
3. **Size** — S/M/L/XL (default M)
4. **Objective** — 1-2 sentence summary
5. **Success Criteria** — concrete checkboxes (based on what the code already does)

### W3: Preview & Confirm

📋 **WRAP PREVIEW**
────────────────────────────────────────────
**Title:**     {title}
**Priority:**  {Pn}   **Size:** `{size}`
**Strategy:**  {strategy name — see below}

{For UNCOMMITTED:}
  1. `git stash`
  2. Create GitHub Issue with teamwork labels
  3. `/team-claim` → mission branch from clean base
  4. `git stash pop` on mission branch
  5. `/team-drive` (verify + commit)
  6. `/team-ship` (push + PR)

{For COMMITTED_NOT_PUSHED:}
  1. Create GitHub Issue with teamwork labels
  2. Save commit SHAs: {sha1, sha2, ...}
  3. `/team-claim` → mission branch from clean base
  4. Cherry-pick commits onto mission branch
  5. Reset *{CURRENT_BRANCH}* to *origin/{CURRENT_BRANCH}*
  6. `/team-drive` (verify)
  7. `/team-ship` (push + PR)

{For COMMITTED_PUSHED:}
  1. Create GitHub Issue with teamwork labels + `status:done`
  2. Close Issue immediately (retroactive tracking only)
  3. No PR — changes already in remote

────────────────────────────────────────────

Use `AskUserQuestion`:
- "Proceed" → continue to W4
- "Edit title/priority" → adjust and re-preview
- "Cancel" → **STOP**

### W4: Execute — Path A (UNCOMMITTED)

#### A1: Stash changes

```bash
git stash push -m "team-wrap: pre-issue stash"
```

Verify stash succeeded:
```bash
# Working tree should be clean now
[ -z "$(git status --porcelain)" ] || {
  echo "ERROR: Stash failed — working tree still dirty"
  # STOP
}
```

#### A2: Create Issue

Use the same logic as `/team-issue` Create Flow (Steps 2-6), but with the AI-generated title/body from W2. Specifically:

```bash
# Generate MC-format issue body (same structure as /team-issue Step 4)
gh issue create \
  --repo "$REPO" \
  --title "{title}" \
  --body "{formatted MC body}" \
  --label "$MISSION_LABEL" \
  --label "${STATUS_PREFIX}wip" \
  --label "${PRIORITY_PREFIX}{Pn}" \
  --label "size:{size}" \
  --assignee "$GH_USER" \
  ${MILESTONE:+--milestone "$MILESTONE"}
```

Extract `ISSUE_NUMBER` from output.

#### A3: Claim (create mission branch from clean base)

```bash
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$TITLE")
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
```

Generate Mission Contract at `$TEAMWORK_DIR/active/MISSION-{ISSUE_NUMBER}.md` — same structure as `/team-claim` Step 4.

#### A4: Apply stash on mission branch

```bash
git stash pop
```

If stash pop fails (conflict):
- "Stash apply had conflicts. Resolve them, then continue with `/team-drive`."
- Do NOT stop — the mission branch and contract are already set up. User can resolve and drive.

#### A5: Hand off to drive + ship

Output:
🔄 **WRAPPED** (stash → branch) ── **#{ISSUE_NUMBER}** {title}
────────────────────────────────────────────
**Issue:**     **#{ISSUE_NUMBER}**
**Branch:**    *{BRANCH}*
**Contract:**  `$TEAMWORK_DIR/active/MISSION-{ISSUE_NUMBER}.md`
**Changes:**   applied from stash

**Next steps:**
  `/team-drive`    Verify + commit changes
  `/team-ship`     Push + create PR
────────────────────────────────────────────

Then invoke `/team-drive` automatically. **Important**: since this is a wrap (code already written), team-drive should focus on **verifying and committing** the existing changes, not re-implementing sub-tasks. The Contract's AI Notes section should contain: `"Wrap mode: code already applied. Verify correctness, run tests, commit. Do not re-implement."`

### W5: Execute — Path B (COMMITTED_NOT_PUSHED)

#### B1: Save commit SHAs

```bash
# Capture commits that need to be moved to mission branch
# Use origin/BASE_BRANCH as reference (consistent with W2 analysis diff)
# This works for both tracked branches and untracked local branches
COMMIT_SHAS=$(git log --reverse --format='%H' "origin/${BASE_BRANCH}..HEAD" 2>/dev/null)
COMMIT_COUNT=$(echo "$COMMIT_SHAS" | wc -l | tr -d ' ')
ORIGINAL_BRANCH="$CURRENT_BRANCH"
```

If mixed state (uncommitted + committed), commit uncommitted changes first:
```bash
if [ -n "$(git status --porcelain)" ]; then
  # Stage only tracked modified files (avoids accidentally staging .env, build artifacts)
  git add -u
  git commit -m "wip: uncommitted changes (pre-wrap)"
  # Re-capture SHAs including new commit
  COMMIT_SHAS=$(git log --reverse --format='%H' "origin/${BASE_BRANCH}..HEAD" 2>/dev/null)
  COMMIT_COUNT=$(echo "$COMMIT_SHAS" | wc -l | tr -d ' ')
fi
```

#### B2: Create Issue

Same as Path A, Step A2.

#### B3: Claim (create mission branch from clean base)

```bash
SLUG=$(bash ~/.claude/commands/scripts/tw-git.sh slugify "$TITLE")
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
BRANCH=$(bash ~/.claude/commands/scripts/tw-git.sh create-branch "$ISSUE_NUMBER" "$SLUG" "$GH_USER")
```

Generate Mission Contract — same as Path A, Step A3.

#### B4: Cherry-pick commits onto mission branch

```bash
# Now on mission branch (created from clean base)
git cherry-pick $COMMIT_SHAS
```

If cherry-pick fails (conflict):
- "Cherry-pick had conflicts. Resolve them, then `/team-drive` to continue."
- Do NOT stop — mission branch and contract exist. User resolves and drives.

#### B5: Reset original branch to origin

**SAFETY — verify cherry-pick transferred all changes BEFORE any reset:**
```bash
# Cherry-pick creates NEW SHAs — cannot use git branch --contains with original SHAs.
# Instead, verify the mission branch content matches by diffing the tree.
DIFF_CHECK=$(git diff "$BRANCH" "$ORIGINAL_BRANCH" -- . 2>/dev/null)
if [ -n "$DIFF_CHECK" ]; then
  echo "ERROR: Mission branch content differs from original. Cherry-pick may be incomplete. Aborting reset."
  # STOP — do NOT reset. User must investigate.
fi
```

If `ORIGINAL_BRANCH` is the base branch (user committed directly on main/develop):
- Use `AskUserQuestion`: "You committed on `{BASE_BRANCH}`. Reset it to `origin/{BASE_BRANCH}`? This removes your local commits (they're now on the mission branch)."
- If user confirms → proceed with reset
- If user declines → skip reset, warn: "Commits remain on both branches. Remove manually after PR merge."

**Execute reset** (only after safety check passes and user confirms if on base branch):
```bash
git checkout "$ORIGINAL_BRANCH"
if [ "$HAS_REMOTE_TRACKING" = true ]; then
  git reset --hard "origin/${ORIGINAL_BRANCH}"
else
  # No remote tracking — reset to base branch origin (commits now live on mission branch)
  git reset --hard "origin/${BASE_BRANCH}"
fi
# Return to mission branch
git checkout "$BRANCH"
```

#### B6: Hand off to drive + ship

Output:
🔄 **WRAPPED** (cherry-pick) ── **#{ISSUE_NUMBER}** {title}
────────────────────────────────────────────
**Issue:**     **#{ISSUE_NUMBER}**
**Branch:**    *{BRANCH}*
**Commits:**   `{COMMIT_COUNT}` cherry-picked from *{ORIGINAL_BRANCH}*
**Contract:**  `$TEAMWORK_DIR/active/MISSION-{ISSUE_NUMBER}.md`
**Reset:**     *{ORIGINAL_BRANCH}* → *origin/{ORIGINAL_BRANCH}*

**Next steps:**
  `/team-drive`    Verify changes
  `/team-ship`     Push + create PR
────────────────────────────────────────────

Then invoke `/team-drive` automatically. Same wrap-mode note as Path A — team-drive verifies and commits, does not re-implement.

### W6: Execute — Path C (COMMITTED_PUSHED)

This path cannot create a PR (changes are already in remote). It only retroactively tracks the work.

#### C1: Create Issue with done status

```bash
ISSUE_URL=$(gh issue create \
  --repo "$REPO" \
  --title "{title}" \
  --body "{formatted MC body with note: 'Retroactively tracked — changes already pushed.'}" \
  --label "$MISSION_LABEL" \
  --label "${STATUS_PREFIX}done" \
  --label "${PRIORITY_PREFIX}{Pn}" \
  --label "size:{size}" \
  --assignee "$GH_USER" \
  ${MILESTONE:+--milestone "$MILESTONE"})
```

#### C2: Close Issue immediately

```bash
# gh issue create outputs a URL like https://github.com/owner/repo/issues/42
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')
# --comment flag does not exist on gh issue close — post comment separately
gh issue comment "$ISSUE_NUMBER" --body "Retroactively closed by /team wrap — changes already pushed to ${CURRENT_BRANCH}."
gh issue close "$ISSUE_NUMBER" --reason completed
```

#### C3: Output

🔄 **WRAPPED** (retroactive) ── **#{ISSUE_NUMBER}** {title}
────────────────────────────────────────────
**Issue:**     **#{ISSUE_NUMBER}** (closed)
**Branch:**    *{CURRENT_BRANCH}* (already pushed)
**Labels:**    `{MISSION_LABEL}`, `{STATUS_PREFIX}done`, `{PRIORITY_PREFIX}{Pn}`
**Note:**      Tracked for history only — no PR created.
────────────────────────────────────────────

Then **STOP**.

---

## Error Handling

- `gh` commands may fail due to network, permissions, or rate limits
- On non-fatal errors (label creation fails, branch protection fails): warn and continue
- On fatal errors (no gh, no remote, not authenticated): clear message and STOP
- If config.yml exists but is malformed: warn and offer to regenerate

**On any STOP:** Always append: 💡 Something wrong? Run `/team doctor` to diagnose, or `/team doctor fix` to auto-repair.

---

## Teamwork Tips Pool

**All teamwork skills** (`/team`, `/team-issue`, `/team-claim`, `/team-drive`, `/team-ship`, `/team-rc`) MUST append one random tip at the end of their final output block, after the `────` separator line.

**How**: Read `~/.claude/commands/scripts/tw-tips.txt`. Pick one line at random (skip `#` comments). Display as plain markdown text (⛔ NOT in a code block):

💡 **Tip:** {selected tip text — wrap any commands in backticks for color, e.g. `/team-claim`, `cd`}

**Rules:**
- One tip per invocation, randomly selected
- Skip comment lines (starting with `#`)
- Display AFTER the skill's standard output footer
- Do NOT repeat the same tip if the user runs multiple commands in the same session (best effort)
