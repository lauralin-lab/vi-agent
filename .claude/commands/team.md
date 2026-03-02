---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
description: Team collaboration skill. Dashboard, pull Mission Contracts, ship to main, sync, onboard members. Use when the user says "team", "/team", or needs team coordination.
---

# /team — Team Collaboration

**User input**: $ARGUMENTS

You are the team coordination layer for the VI Agent project. This skill operates
on three core concepts:

- **Mission Contract (MC)**: An atomic task from `.teamspace/board.md`. Independently mergeable.
- **Role**: A person + Claude Code. Continuously pulls and ships MCs.
- **Product**: What's on `main`. Metric = merge count.

---

## Routing

Parse `$ARGUMENTS` and route to the matching operation:

| Input | Operation | What it does |
|-------|-----------|--------------|
| (empty) / `status` | **Dashboard** | Show team state, merge counts, who's doing what |
| `pull` | **Pull** | Present next available MC to claim |
| `create {description}` | **Create** | Add a new MC to the board |
| `claim T-{id}` | **Claim** | Claim a specific MC and set up worktree |
| `ship` | **Ship** | Rebase + test + PR for current work |
| `sync` | **Sync** | Rebase on latest main, show conflicts |
| `add {name} {github}` | **Add Member** | Onboard a new team member |
| `review {pr}` | **Review** | Run code-reviewer on a PR |
| `version` | **Version** | Show version progress and remaining work |
| `done T-{id}` | **Done** | Mark MC as done, update board + merge count |

If `$ARGUMENTS` doesn't match any pattern, treat it as a natural language request
about team coordination and use your best judgment.

---

## Operation: Dashboard

**Trigger**: `/team` or `/team status`

Read these files and synthesize a live dashboard:

1. Read `.teamspace/board.md`
2. Read `.teamspace/config.yml`
3. Read all files in `.teamspace/members/`
4. Run `git log --oneline -20` for recent merge activity
5. Run `git worktree list` for active worktrees

Output a dashboard:

```
╔══════════════════════════════════════════════════════════╗
║  TEAM DASHBOARD — {team name}                           ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Version: {current version} ({status})                   ║
║  Progress: {done}/{total} MCs │ {done_pct}%              ║
║                                                          ║
║  ┌─ Merge Count ─────────────────────────────────────┐   ║
║  │ {role1}: {N} merged  │ {role2}: {N} merged        │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  ┌─ Active Work ─────────────────────────────────────┐   ║
║  │ {role}: {T-xxx} {title} (since {date})            │   ║
║  │ {role}: {T-xxx} {title} (since {date})            │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  ┌─ Blocked ─────────────────────────────────────────┐   ║
║  │ {T-xxx}: {blocker reason}                         │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  ┌─ Available MCs ───────────────────────────────────┐   ║
║  │ {N} queued ({N} P0, {N} P1, {N} P2)               │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  Active worktrees: {list from git worktree list}         ║
╚══════════════════════════════════════════════════════════╝
```

After showing the dashboard, offer quick actions via AskUserQuestion:
- "Pull next MC" — go to Pull operation
- "Create new MC" — go to Create operation
- "Show version detail" — go to Version operation
- "I'm good, just checking in"

---

## Operation: Pull

**Trigger**: `/team pull`

1. Read `.teamspace/board.md`
2. Identify yourself via `git config user.name`, match to `.teamspace/config.yml` → members
3. Find the next MC to work on, in this priority:
   a. Your WIP tasks (resume)
   b. Queued tasks assigned to you
   c. Unassigned Queued tasks (P0 → P1 → P2)
4. Read version spec for quality gates that apply

Present the MC:

```
╔══════════════════════════════════════════════╗
║  MISSION CONTRACT                            ║
╠══════════════════════════════════════════════╣
║  Task: {T-xxx} {title}                       ║
║  Priority: {P0/P1/P2} │ Est: {S/M/L}        ║
║  Services: {tags}                            ║
║  Notes: {notes from board}                   ║
║  Quality Gates: {relevant gates}             ║
║                                              ║
║  Your merge count: {N}                       ║
╚══════════════════════════════════════════════╝
```

Ask via AskUserQuestion:
- "Claim this MC and start" → run Claim operation for this task
- "Show me another MC" → present the next one in priority order
- "I want to pick a specific one" → list all available MCs
- "Not now"

---

## Operation: Claim

**Trigger**: `/team claim T-{id}` or selected from Pull

1. Read `.teamspace/board.md`, find the task
2. Determine task slug from the task title (kebab-case, short)
3. Edit `.teamspace/board.md`:
   - Remove the task row from Queued section
   - Add to In Progress section with Owner, Branch, Worktree, Started date
4. Run `./scripts/setup-worktree.sh {task-slug}` to create isolated environment
5. Report the result:

```
✅ Claimed: {T-xxx} {title}

   Branch:    feature/{T-xxx}-{slug}
   Worktree:  ../vi-wt-{slug}
   Ports:     API:{port} FE:{port} GW:{port}

   Next: cd ../vi-wt-{slug} && ./dev.sh
   Or:   /drive T-{xxx}    (to auto-drive the implementation)
```

---

## Operation: Create

**Trigger**: `/team create {description}`

1. Read `.teamspace/config.yml` for `next_id`
2. Parse the description to extract:
   - Task title
   - Priority (default P2 if not specified)
   - Estimate (default M if not specified)
   - Tags (infer from description — which services, what type)
   - Version (current version if related, otherwise none)
3. Ask via AskUserQuestion to confirm/adjust:
   - Priority: P0/P1/P2/P3
   - Estimate: S/M/L
   - Target: current version or no version
4. Edit `.teamspace/board.md`:
   - Add new row to Queued section (or Backlog based on priority)
5. Edit `.teamspace/config.yml`:
   - Increment `next_id`
6. Report:

```
✅ Created: T-{xxx} {title}
   Priority: {P} │ Est: {est} │ Version: {ver}
   Status: Queued on board.md
```

---

## Operation: Ship

**Trigger**: `/team ship`

This prepares your current work for merge to main. It runs the full pre-merge checklist.

1. Detect current branch and worktree:
   ```bash
   git branch --show-current
   git worktree list
   ```
   If on `main`, abort: "You're on main. Claim an MC first."

2. **Sync with main**:
   ```bash
   git fetch origin main
   git rebase origin/main
   ```
   If conflicts → report them clearly and help resolve.

3. **Run tests**:
   ```bash
   # Run whichever test suites exist
   cd api-server && .venv/bin/python -m pytest tests/ -v 2>&1 || true
   cd frontend && npx eslint src/ 2>&1 || true
   cd gateway/plugin && npm run lint 2>&1 || true
   ```

4. **Show diff summary**:
   ```bash
   git diff origin/main --stat
   ```

5. **Create PR** (ask first):
   Ask via AskUserQuestion:
   - "Create PR and ship it" → create PR via `gh pr create`
   - "I need to fix something first" → abort, let user fix
   - "Just show me the status" → show without creating PR

6. If PR created, report:
   ```
   🚀 Shipped: {T-xxx} {title}
      PR: {url}
      Files changed: {N}
      CI: running...

      After merge, run: /team done T-{xxx}
   ```

---

## Operation: Sync

**Trigger**: `/team sync`

Quick rebase on latest main without the full ship checklist.

```bash
git fetch origin main
git rebase origin/main
```

Report result:
- Clean: "✅ Up to date with main. No conflicts."
- Conflicts: List conflicted files, offer to help resolve.

---

## Operation: Done

**Trigger**: `/team done T-{id}`

Post-merge cleanup:

1. Read `.teamspace/board.md`, find the task in In Progress or In Review
2. Edit `.teamspace/board.md`:
   - Remove from In Progress / In Review
   - Add to Done section with completion date
   - Increment merge count for this Role in the Stats section
3. Update `.teamspace/members/{id}.md`:
   - Add to "最近完成" table
   - Clear from "当前工作"
4. Clean up worktree (ask first):
   ```bash
   git worktree remove ../vi-wt-{slug}
   ```
5. Update stats section counts
6. Report:

```
✅ Done: T-{xxx} {title}
   Merge count: {N} → {N+1}

   Next available MCs: {count}
   Run /team pull to get your next Mission Contract.
```

---

## Operation: Add Member

**Trigger**: `/team add {name} {github-username}`

1. Read `.teamspace/config.yml`
2. Generate member id from name (lowercase, kebab-case)
3. Edit `.teamspace/config.yml` → add to `members` list:
   ```yaml
   - id: {id}
     name: "{Name}"
     role: contributor
     github: {github-username}
   ```
4. Create `.teamspace/members/{id}.md`:
   ```markdown
   # {Name}

   ## 当前状态

   🟢 Active

   ## 🟡 当前工作

   （无 WIP 任务）

   ## 🔴 被阻塞

   （无）

   ## 🔵 等待 Review

   （无）

   ## 最近完成

   | Task | Completed | Notes |
   |------|-----------|-------|

   ## 笔记

   - Joined the team on {date}
   ```
5. Edit `.teamspace/board.md` → add to Merge Count table:
   ```
   | {name} | 0 | — |
   ```
6. Report:

```
✅ Added: {Name} (@{github})
   Member file: .teamspace/members/{id}.md
   Merge count: initialized at 0

   They need to:
   1. git config user.name "{name}"
   2. .claude/install.sh
   3. claude --agent feature-lead
```

---

## Operation: Review

**Trigger**: `/team review {pr-number}` or `/team review` (auto-detect)

1. If no PR number given, detect from current branch:
   ```bash
   gh pr list --head $(git branch --show-current) --json number,title
   ```
2. Get PR details:
   ```bash
   gh pr view {pr-number} --json title,body,files,additions,deletions
   gh pr diff {pr-number}
   ```
3. Review the PR using the code-reviewer protocol:
   - Read every changed file in full (not just the diff)
   - Check: correctness, security, architecture compliance, quality, performance
   - Produce a structured review
4. Post the review:
   ```bash
   gh pr review {pr-number} --body "{review}" {--approve|--request-changes|--comment}
   ```

---

## Operation: Version

**Trigger**: `/team version`

1. Read `.teamspace/config.yml` → version info
2. Read version spec file
3. Read `.teamspace/board.md` → count tasks by status for this version
4. Show version progress:

```
╔══════════════════════════════════════════════════════════╗
║  VERSION {version} — "{title}"                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Status: {dev/qa/released}                               ║
║  Progress: {done}/{total} MCs                            ║
║                                                          ║
║  ┌─ By Status ───────────────────────────────────────┐   ║
║  │ Done: {N}  │ WIP: {N}  │ Queued: {N}  │ Blocked: {N}│ ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  ┌─ Quality Gates ───────────────────────────────────┐   ║
║  │ T1 App→Voice ≤3s      {✅/⬜/🔴}                 │   ║
║  │ T2 Photo→Card ≤8s     {✅/⬜/🔴}                 │   ║
║  │ A1 Food acc ≥90%      {✅/⬜/🔴}                 │   ║
║  │ ...                                               │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  ┌─ Test Matrix ─────────────────────────────────────┐   ║
║  │ UC-1 Apple→Calorie    {⬜/✅}                     │   ║
║  │ UC-2 Monstera→Plant   {⬜/✅}                     │   ║
║  │ UC-3 Sketch→Demo      {⬜/✅}                     │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                          ║
║  Remaining MCs: {list uncompleted tasks}                 ║
║  Blockers: {any blocked tasks}                           ║
╚══════════════════════════════════════════════════════════╝
```

If all MCs are done, suggest: "All MCs done. Ready for Feature Freeze → QA?"

---

## Behavioral Rules

1. **Always read board.md fresh.** Never rely on memory — another Role may have changed it.
2. **Atomic board edits.** When editing board.md, read it first, make minimal changes, write back.
   Be careful not to corrupt other Roles' rows.
3. **One MC at a time per Role.** If a Role already has a WIP task, they must finish or abandon
   it before claiming a new one.
4. **Merge count is sacred.** Only increment when a PR is actually merged to main.
5. **Respect ownership.** Never modify another Role's WIP entry without their agreement.
6. **Surface conflicts early.** If two Roles are touching the same files, alert immediately.
7. **Board is the source of truth.** Not your memory, not git log, not the PR list. The board.
