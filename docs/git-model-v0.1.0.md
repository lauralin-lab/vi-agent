# Git Branching Model v0.1.0

> **Status**: Draft — pending validation on vi_agent
> **Date**: 2026-03-05
> **Context**: AI-assisted team (6 people + AI = 20-30 equivalent commit frequency)
> **See also**: ADR-0012

---

## Design Rationale

Standard Git Flow, adapted for AI-heavy development:

1. **AI generates high-frequency commits** — commit logs are machine noise, not human-readable history
2. **Squash merge everywhere** — compress noise into meaningful units; cherry-pick friendly for disaster recovery
3. **Tags as sparse anchors** — `git diff V0.1.0..V0.1.1` for version diffs, not per-merge tagging
4. **main must be forever clean** — only verified code enters main; achieved by separating develop (dirty) from main (clean)
5. **High-frequency releases** — keep develop close to main, minimize "dirty window"
6. **Milestone ≠ Release** — milestone is product goal (V0.1), release is deployment unit (V0.1.0, V0.1.1)

---

## Branch Structure

```
┌──────────────┬────────────┬──────────────────────────────────┬─────────────┐
│   Branch     │    Role    │       Who merges into it          │ Cleanliness │
├──────────────┼────────────┼──────────────────────────────────┼─────────────┤
│ main         │ Production │ Only rc/* (squash merge)          │ Always clean│
│ develop      │ Dev trunk  │ All feature/fix PRs (squash)      │ CI-clean    │
│ rc/V0.x.y    │ RC/Staging │ Cut from develop; hotfixes only   │ Converging  │
│ feat/*, fix/*│ Work       │ Individual dev work               │ Dirty       │
└──────────────┴────────────┴──────────────────────────────────┴─────────────┘
```

### Visual Flow

```
develop ── feat/A ── feat/B ──────────────── cherry-pick(H) ──►
           (squash)  (squash)       ▲              ▲
                        │           │              │
                   rc/V0.1.0 ── hotfix/H      delete rc
                        │        (squash)         │
                    staging 验证    │              │
                        │       staging 验证       │
                        │           │              │
                        └─────┬─────┘              │
                              │                    │
main ──────────────────── [squash] ────────────────►
                          tag V0.1.0
                          deploy prod ← this is the release
```

---

## Rules

### 1. Feature branches cut from `develop`

- main's cleanliness is a **result** (of RC verification), not a **starting point**
- Branching from main causes merge conflicts when merging back to develop

### 2. All merges are squash

| Operation          | Merge Method | Reason                                |
|--------------------|--------------|---------------------------------------|
| feature → develop  | squash       | AI commit noise → 1 meaningful commit |
| hotfix → rc/*      | squash       | Same                                  |
| rc/* → main        | squash       | 1 release = 1 commit on main          |

main history: `[V0.1.0] ── [V0.1.1] ── [V0.2.0]` — each commit tagged.

### 3. Tags on main (on the squash commit)

- Don't tag on rc branches — tag the squash commit on main
- Same tree content as what was verified on staging (different commit hash)
- CI/CD: use version tags for Docker image tags, **not commit SHA**

### 4. RC 冻结原则

- 同一时间只有一个 rc 分支
- RC 切出后**只接受 hotfix，不接受新 feature**
- 新 feature 等下一班车：promote 当前 rc → 立即切新 rc
- `/team-rc` 检查 remote：已有 rc 分支 → 中止，等 promote 完再切
- 版本号从 remote tags 自动推导（`git tag -l 'V0.x.*'`），不依赖本地 config

### 5. Hotfixes cherry-pick back to develop immediately

### 6. Branch protection on both main and develop

| Branch  | require PR | CI | review | force push | delete |
|---------|-----------|-----|--------|------------|--------|
| main    | yes       | yes | no     | blocked    | blocked|
| develop | yes       | yes | no     | blocked    | blocked|

### 7. Squash commit message on main

```
release: V0.1.0

Features:
- feat: user login system
- feat: permission management

Fixes:
- fix: API timeout on large payloads
```

---

## Versioning

- **Milestone** = product goal (V0.1, V0.2) — closes when all issues done
- **Release/Tag** = deployment unit (V0.1.0, V0.1.1) — high frequency
- Same milestone: patch +1 (V0.1.0 → V0.1.1)
- New milestone: minor +1 (V0.1.x → V0.2.0)

---

## RC Lifecycle

### `/team-rc` (prepare)

```
1. Verify develop CI green
2. Cut rc/V0.x.y from develop → push
3. Deploy to staging (workflow_dispatch)
```

### Hotfix (normal dev flow, no special command)

```
1. Branch from rc/V0.x.y → fix → PR to rc branch (squash)
2. Cherry-pick fix → develop
3. Re-deploy staging
```

### `/team-rc promote`

```
1. Verify staging green
2. Create PR: rc/V0.x.y → main (squash merge via GitHub, respects branch protection)
3. Tag squash commit on main as V0.x.y
4. GitHub Release (--generate-notes)
5. Close milestone if all issues done
6. Delete rc branch (via --delete-branch on PR merge)
```

---

## Teamwork Skill Mapping

### Config

```yaml
conventions:
  base_branch: develop              # feature PRs target here
  production_branch: main           # rc squash-merges here, tags here
  branch_pattern: "{type}/{task-id}-{slug}"

versions:
  current: "V0.1.0"                 # patch-level version
```

### Skills (6 total)

| Skill | Change from current |
|-------|-------------------|
| `/team` | Config template: `base_branch: develop` + `production_branch: main`. Protect both branches. |
| `/team-issue` | No change |
| `/team-claim` | No code change — follows `base_branch` config |
| `/team-drive` | `protect-check` adds `production_branch` to blocked list |
| `/team-ship` | No code change — PR targets `base_branch` config |
| `/team-rc` | **Renamed from `/team-release`**. Two-phase: prepare + promote |

### Script Changes (`tw-git.sh` only)

| Subcommand | Purpose |
|------------|---------|
| `_production_branch()` | NEW: read `conventions.production_branch`, default `main` |
| `protect-check` | Block develop, main, AND `rc/*` branches |
| `cut-release VERSION` | NEW: checkout develop, pull, create rc/$VERSION, push |
| `cherry-pick COMMIT` | NEW: checkout develop, cherry-pick |

Note: squash merge to main uses `gh pr merge --squash` (GitHub PR), not local git. Respects branch protection.

### deploy.yml

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, prod]
      ref:
        description: 'Branch (rc/*) or tag (V0.x.y) to deploy'
        required: true
```

Remove `workflow_run` trigger (no auto-deploy on push to main).

### ci.yml

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [develop, main]     # main needed for rc→main PRs to trigger CI
```

---

## Migration Steps (vi_agent)

```
1. Create develop from main, push
2. Branch protection on develop (same rules as main)
3. Config: base_branch → develop, add production_branch → main
4. ci.yml: add develop to triggers
5. deploy.yml: remove workflow_run, workflow_dispatch only
6. GitHub default branch → develop
7. Update teamwork skills (erwin), reinstall
```

---

## Out of Scope

- Multiple version maintenance (V1.x + V2.x)
- Rollback strategy (redeploy previous tag is sufficient)
- Database migration coordination
- Monorepo

---

## Version History

| Version | Date       | Status     | Notes |
|---------|------------|------------|-------|
| v0.0.1  | 2026-03-05 | Discussion | Session Z + AA debate |
| v0.1.0  | 2026-03-05 | Draft      | This document — pending validation |
| v1.0.0  | TBD        | —          | After one full RC cycle validated |
