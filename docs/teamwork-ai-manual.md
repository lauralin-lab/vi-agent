# Teamwork — The Complete Manual

> **Version 2.7.3** | Author: liyasong | 2026-03-05
>
> AI-Native Team Coordination for GitHub.
> For humans and AI agents. Covers WHY, HOW, and the philosophy behind every decision.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [The Problem We Solve](#the-problem-we-solve)
3. [System Architecture](#system-architecture)
4. [The Four Branches](#the-four-branches)
5. [The Six Skills](#the-six-skills)
6. [Issue Lifecycle — State Machine](#issue-lifecycle--state-machine)
7. [Git Flow — Visual Guide](#git-flow--visual-guide)
8. [RC Lifecycle — The Key Innovation](#rc-lifecycle--the-key-innovation)
9. [GitHub Ecosystem Integration](#github-ecosystem-integration)
10. [The Mission Contract](#the-mission-contract)
11. [Quality Gates — Defense in Depth](#quality-gates--defense-in-depth)
12. [Versioning Model](#versioning-model)
13. [Scripts Architecture](#scripts-architecture)
14. [Config Reference](#config-reference)
15. [End-to-End Example](#end-to-end-example)

---

## Design Philosophy

### Nine Principles

These are not rules we invented. They emerged from **pain** — bugs found, rework done, production incidents caused by AI-generated noise. Each principle has a scar behind it.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DESIGN PRINCIPLES                                │
│                                                                     │
│  ① GitHub IS the system                                            │
│     Not a mirror. Not a sync target. THE system.                   │
│     Issues = tasks. PRs = delivery. Actions = gates.               │
│     Cross-agent, cross-session, cross-human communication          │
│     happens via GitHub — same as any human team.                   │
│                                                                     │
│  ② Separate the dirty from the clean                               │
│     develop absorbs AI noise. main stays pristine.                 │
│     Cleanliness is a RESULT (of verification), not a starting pt.  │
│                                                                     │
│  ③ Squash everything                                               │
│     AI commits are machine noise. 1 Issue = 1 squash commit.      │
│     Enables cherry-pick recovery. Enables readable history.        │
│                                                                     │
│  ④ Risk levels don't share trigger paths                           │
│     staging deploy ≠ prod deploy. Never in the same command.       │
│     Skills own git ops. Actions own deployment.                    │
│                                                                     │
│  ⑤ Tags are semantic markers, not deployment logs                  │
│     V0.1.0 means "this version exists." Not "deploy this now."    │
│     workflow_dispatch for deploy. Tags for history.                │
│                                                                     │
│  ⑥ Scripts lock mechanism, LLM provides judgment                  │
│     Deterministic ops (git, labels, PR) = bash scripts.            │
│     Adaptive ops (code analysis, review) = LLM.                   │
│     Evidence: 21 bugs found in LLM-interpreted ops. 0 in scripts. │
│                                                                     │
│  ⑦ Close the loop first, optimize second                          │
│     A complete loop with rough edges > a polished partial flow.    │
│     Automation fills gaps humans forget.                           │
│                                                                     │
│  ⑧ Config-driven, not hardcoded                                   │
│     Every project-specific value lives in config.yml.              │
│     The skill works on any repo. Zero coupling to vi_agent.        │
│                                                                     │
│  ⑨ 6 skills is the ceiling                                        │
│     Expand via subcommands, not new skills.                        │
│     30+ commands confused users (evidence: CCPM project).          │
│     6 commands = one hand + one thumb.                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The Von Neumann Separation

```
    ┌──────────────────────────────────────────────────┐
    │              skill.md (LLM Layer)                 │
    │                                                    │
    │  "Read the Issue, understand context, decide       │
    │   what type of branch to create, generate          │
    │   a Mission Contract with AI-enriched context"     │
    │                                                    │
    │         ↓ calls ↓           ↑ reads result ↑       │
    ├──────────────────────────────────────────────────┤
    │              scripts/*.sh (Mechanism Layer)        │
    │                                                    │
    │  tw-git.sh create-branch 42 user-login lysfighting │
    │  tw-label.sh transition 42 queued wip              │
    │  tw-contract.sh hash 42                            │
    │  tw-pr.sh create --squash --base develop           │
    │                                                    │
    │  Deterministic. Testable. Zero LLM interpretation. │
    └──────────────────────────────────────────────────┘
```

> *"Content changes; mechanism endures."*
> — Inspired by von Neumann's stored-program architecture

---

## The Problem We Solve

Traditional teams: 6 people, manageable commit frequency, GitHub Flow works fine.

**Our reality**: 6 people + AI assistants = **20-30x commit frequency**. This changes everything.

```
THE STAGING PARADOX (GitHub Flow + AI)
═══════════════════════════════════════════════════════════════

main ── feat/A ── feat/B ── feat/C ── feat/D ── feat/E ──►
        (merge)   (merge)   (merge)   (merge)   (merge)

        ↑ you deploy staging here
        │ while verifying, D and E merge in
        │ deploy again → F and G merge in
        └── you can NEVER verify a stable snapshot

Problem: the target moves faster than you can aim.
```

**The insight**: you need a **frozen snapshot** for verification. But you also need a place where AI can commit freely without polluting production.

```
THE SOLUTION: Separation of Concerns
═══════════════════════════════════════════════════════════════

develop ── A ── B ── C ── D ── E ──►     ← AI noise goes here
                        │                    (that's OK)
                   rc/V0.1.0                ← frozen snapshot
                        │                    for verification
main ────────────── [V0.1.0] ──►            ← only verified code
                                              forever clean
```

> *This is not Git Flow reinvented. It's Git Flow understood through the lens of AI-era commit frequency.*

---

## System Architecture

### The Complete Picture

```
╔══════════════════════════════════════════════════════════════════════╗
║                    TEAMWORK SYSTEM ARCHITECTURE                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─────────────────────────────────────────────────────────────┐    ║
║  │                   6 SKILLS (LLM Layer)                       │    ║
║  │                                                               │    ║
║  │  /team ──── /team-issue ──── /team-claim ──── /team-drive    │    ║
║  │    │              │               │               │           │    ║
║  │    │              │               │               │           │    ║
║  │    │         /team-ship ──────────────────── /team-rc         │    ║
║  │    │              │                              │            │    ║
║  │  init           create          claim          prepare       │    ║
║  │  dashboard      update          branch         promote       │    ║
║  │  learn                          contract                     │    ║
║  │  queue                                                        │    ║
║  └───────────────────────┬─────────────────────────────────────┘    ║
║                          │ calls                                     ║
║  ┌───────────────────────▼─────────────────────────────────────┐    ║
║  │                5 SCRIPTS (Mechanism Layer)                    │    ║
║  │                                                               │    ║
║  │  tw-git.sh ─── tw-label.sh ─── tw-contract.sh ─── tw-pr.sh  │    ║
║  │  (15 cmds)     (4 cmds)        (8 cmds)           (7 cmds)  │    ║
║  │                                                               │    ║
║  │              tw-config.sh (YAML parser, shared)               │    ║
║  └───────────────────────┬─────────────────────────────────────┘    ║
║                          │ operates on                               ║
║  ┌───────────────────────▼─────────────────────────────────────┐    ║
║  │                  GITHUB (Source of Truth)                      │    ║
║  │                                                               │    ║
║  │  Issues ─── Labels ─── Milestones ─── PRs ─── Actions        │    ║
║  │  (tasks)    (state)    (versions)     (delivery) (quality)    │    ║
║  │                                                               │    ║
║  │  Branch Protection ─── Repo Settings ─── Releases ─── Tags   │    ║
║  │  (safety)               (merge policy)    (history)   (anchor)│    ║
║  └──────────────────────────────────────────────────────────────┘    ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐    ║
║  │                    LOCAL (Ephemeral)                            │    ║
║  │                                                               │    ║
║  │  .teamwork/config.yml ─── .teamwork/active/MISSION-*.md      │    ║
║  │  (permanent config)        (ephemeral Contract, gitignored)   │    ║
║  │                                                               │    ║
║  │  .githooks/pre-commit ─── .githooks/pre-push                 │    ║
║  │  (lint gate)               (test gate)                        │    ║
║  └──────────────────────────────────────────────────────────────┘    ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Responsibility Boundary

```
         SKILL LAYER                    ACTION LAYER
     (Claude executes)              (GitHub executes)
    ─────────────────────       ─────────────────────────
    /team-issue → Issue          on PR merge → post-merge
    /team-claim → Branch           cleanup (labels, boxes,
    /team-drive → Code              milestone check)
    /team-ship  → PR
    /team-rc    → Tag            on workflow_dispatch →
                                   deploy staging/prod
         │                              │
         │  checks before tagging       │ provides the
         └────── Action status ─────────┘ check basis
              success? → proceed
              failed?  → warn + confirm

    Skills own git operations.
    Actions own deployment.
    Never cross the boundary.
```

---

## The Four Branches

```
┌──────────┬───────────────┬─────────────────────────┬────────────────┐
│ Branch   │ Role          │ Who writes to it        │ Cleanliness    │
├──────────┼───────────────┼─────────────────────────┼────────────────┤
│ main     │ Production    │ Only rc/* via PR        │ ★★★ Pristine  │
│ develop  │ Dev trunk     │ All feature PRs         │ ★★  CI-clean  │
│ rc/*     │ RC / Staging  │ Hotfixes only           │ ★★½ Converging│
│ feat/*   │ Work          │ Individual developer    │ ★   Dirty     │
└──────────┴───────────────┴─────────────────────────┴────────────────┘
```

### Branch Flow Diagram

```
    feat/42-login ──(squash)──►
    feat/45-perms ──(squash)──►
    feat/48-api   ──(squash)──►
                               │
develop ──●──●──●──●──●──●─────●──●──●──●──●──►
                         │                │
                    rc/V0.1.0        rc/V0.1.1
                         │                │
                    (staging)         (staging)
                         │                │
                    (squash PR)      (squash PR)
                         │                │
main ────────────────[V0.1.0]────────[V0.1.1]──────►
                       tag             tag
                    (release)       (release)
```

### Why branch from develop, not main?

```
WRONG: Branch from main
═══════════════════════════════════════════

main:     V0.1.0 ──────────────────────────────────
develop:  V0.1.0 ── A ── B ── C ── D ──
feat/E:   V0.1.0 ── (your work) ──
                ↑                    ↓
                │               merge to develop
                │                    ↓
                └── CONFLICT! feat/E is based on old V0.1.0,
                    but develop now has A, B, C, D changes


RIGHT: Branch from develop
═══════════════════════════════════════════

develop:  V0.1.0 ── A ── B ── C ── D ──
feat/E:                          D ── (your work) ──
                                      ↓
                                 merge to develop
                                      ↓
                                 clean merge ✓ (same base)
```

> **Rule: always branch from develop.**
> Main's cleanliness is a *result* (of RC verification), not a *starting point*.

---

## The Six Skills

```
┌──────────────────────────────────────────────────────────────────┐
│                     THE SIX SKILLS                                │
│                                                                    │
│     /team              Init + Dashboard + Learn                   │
│       │                                                            │
│       ▼                                                            │
│     /team-issue ──► Create structured GitHub Issue                │
│       │              (AI enriches: priority, size, success criteria)│
│       ▼                                                            │
│     /team-claim ──► Claim Issue → Contract → Branch               │
│       │              (AI scans codebase for context)               │
│       ▼                                                            │
│     /team-drive ──► Execute mission from Contract                 │
│       │              (sub-tasks → test → commit loop)              │
│       ▼                                                            │
│     /team-ship  ──► Push → PR → cleanup                           │
│       │              (auto-closes Issue on merge)                  │
│       ▼                                                            │
│     /team-rc    ──► Prepare RC / Promote to production            │
│                      (cut rc branch / squash → main → tag)        │
│                                                                    │
│  Each skill is a PHASE in the lifecycle.                          │
│  Together they form a complete loop.                              │
│  The loop never breaks.                                           │
└──────────────────────────────────────────────────────────────────┘
```

### Quick Reference

| Skill | Command | What it does |
|-------|---------|--------------|
| `/team` | `/team` | Dashboard — who's working on what |
| | `/team init` | Initialize teamwork in current repo |
| | `/team help` | Quick start guide |
| | `/team learn` | Design philosophy + diagrams |
| | `/team queue` | All queued issues sorted by priority |
| `/team-issue` | `/team-issue {desc}` | Create GitHub Issue with AI enrichment |
| | `/team-issue #42 {changes}` | Update existing Issue |
| `/team-claim` | `/team-claim #42` | Claim specific Issue |
| | `/team-claim` | Auto-pick highest priority |
| | `/team-claim list` | Browse available missions |
| `/team-drive` | `/team-drive` | Execute mission (code → test → commit) |
| `/team-ship` | `/team-ship` | Push + create PR |
| | `/team-ship done` | Post-merge cleanup |
| | `/team-ship review` | AI code review on PR |
| | `/team-ship sync` | Rebase on latest develop |
| `/team-rc` | `/team-rc` | Prepare: cut rc from develop |
| | `/team-rc promote` | Promote: squash to main, tag, release |
| | `/team-rc help` | Full RC lifecycle guide |

---

## Issue Lifecycle — State Machine

### Label State Transitions

```
                    ┌─────────────────────────┐
                    │      ISSUE CREATED       │
                    │    /team-issue publishes  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    status:queued         │
                    │    ● Available to claim  │ ◄──── /team-ship done
                    │    ● Sorted by priority  │       (if reopened)
                    └────────────┬────────────┘
                                 │
                          /team-claim
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    status:wip            │
                    │    ● Someone working     │
                    │    ● Branch exists       │
                    │    ● Contract active     │
                    └────────────┬────────────┘
                           │     │
                    /team-ship   │ (blocked)
                           │     │
                           ▼     ▼
    ┌──────────────────────┐   ┌──────────────────────┐
    │    status:review     │   │    status:blocked     │
    │    ● PR is open      │   │    ● Waiting on       │
    │    ● CI running      │   │      dependency       │
    │    ● Awaiting merge  │   │    ● Manual set       │
    └──────────┬───────────┘   └──────────────────────┘
               │
        PR merged
     (post-merge Action
      OR /team-ship done)
               │
               ▼
    ┌──────────────────────┐
    │    status:done        │
    │    ● All boxes checked│
    │    ● Issue closed     │
    │    ● Branch deleted   │
    └──────────────────────┘
```

### Label Colors (visual recognition)

```
    ┌──────────────┬────────────┬──────────┐
    │ Label        │ Color      │ Meaning  │
    ├──────────────┼────────────┼──────────┤
    │ status:queued│ 🟢 #c2e0c6 │ Ready    │
    │ status:wip   │ 🟡 #fbca04 │ Active   │
    │ status:review│ 🟣 #7057ff │ Waiting  │
    │ status:done  │ 🟢 #0e8a16 │ Complete │
    │ status:blocked│ 🔴 #d73a4a│ Stuck    │
    ├──────────────┼────────────┼──────────┤
    │ priority:P0  │ 🔴 #d73a4a │ Critical │
    │ priority:P1  │ 🟡 #e4e669 │ High     │
    │ priority:P2  │ 🟢 #0e8a16 │ Medium   │
    │ priority:P3  │ ⚪ #cfd3d7 │ Low      │
    └──────────────┴────────────┴──────────┘
```

---

## Git Flow — Visual Guide

### The Complete Git Lifecycle

```
══════════════════════════════════════════════════════════════════════
                        GIT FLOW — FULL PICTURE
══════════════════════════════════════════════════════════════════════

 feat/42 ─●─●─●─┐ (squash)
                 │
 feat/45 ─●─●───┤ (squash)
                 │
 feat/48 ─●─────┤ (squash)
                 │
develop ─────●───●───●───●───●───────────────cherry-pick(H)──●──►
                             │                     ▲
                        rc/V0.1.0                  │
                             │              hotfix/fix-bug
                             │                (squash)
                          staging                  │
                          verify ─── bug? ── fix ──┘
                             │
                          all good
                             │
                        squash PR ──────────────────┐
                             │                       │
main ────────────────────────┼───[release: V0.1.0]──●──────────►
                             │      ↑
                          delete    tag V0.1.0
                         rc branch  ↑
                                    gh release create
                                    --generate-notes

══════════════════════════════════════════════════════════════════════
```

### Why Squash Everything

AI generates dozens of commits per feature. These are machine noise:

```
WITHOUT SQUASH (main history):           WITH SQUASH (main history):

  a1b2c3 fix typo                         x1y2z3 feat: user login (#42)
  d4e5f6 WIP                              a2b3c4 feat: permissions (#45)
  g7h8i9 try different approach            d5e6f7 fix: API timeout (#48)
  j0k1l2 revert previous                  g8h9i0 release: V0.1.0
  m3n4o5 actually fix it
  p6q7r8 forgot to save                   4 commits. Each one meaningful.
  s9t0u1 final fix for real               Each one cherry-pickable.
  ...                                     Each one a complete unit.
  47 commits. None meaningful.
```

### Merge Method Summary

```
┌───────────────────────┬──────────┬───────────────────────────────┐
│ Operation             │ Method   │ Why                           │
├───────────────────────┼──────────┼───────────────────────────────┤
│ feature → develop     │ squash   │ Compress AI noise             │
│ hotfix → rc/*         │ squash   │ Same                          │
│ rc/* → main           │ squash   │ 1 release = 1 commit on main  │
├───────────────────────┼──────────┼───────────────────────────────┤
│ NEVER allowed:        │          │                               │
│ direct push to develop│ blocked  │ Branch protection             │
│ direct push to main   │ blocked  │ Branch protection             │
│ force push anywhere   │ blocked  │ Branch protection             │
└───────────────────────┴──────────┴───────────────────────────────┘
```

---

## RC Lifecycle — The Key Innovation

### Why "RC" and not "release branch"?

```
"release branch" implies it IS the release.
But it's NOT — it's a CANDIDATE being verified.

rc/V0.1.0 on staging  →  might pass, might fail
                          it's auditioning for the role

tag V0.1.0 on main     →  THIS is the release
                          irreversible, permanent
```

> *The name matters. Words shape behavior.*
> *"Release branch" makes people treat it as final.*
> *"Release Candidate" keeps the right level of skepticism.*

### The RC Bus Analogy

```
                    ┌───────────────────────────────────────┐
                    │          THE BUS ANALOGY               │
                    │                                        │
                    │  RC is a bus. It departs on schedule.  │
                    │  If your feature isn't on this bus,    │
                    │  it takes the next one.                │
                    │                                        │
                    │  Bus schedule:                         │
                    │                                        │
                    │  rc/V0.1.0 ══► staging ══► main       │
                    │       ▲                                │
                    │       │ features A, B, C on board      │
                    │       │ feature D missed it            │
                    │       │                                │
                    │  rc/V0.1.1 ══► staging ══► main       │
                    │       ▲                                │
                    │       │ features D, E, F on board      │
                    │                                        │
                    │  Buses come frequently.                │
                    │  Missing one is not a crisis.          │
                    │  It's Tuesday.                         │
                    └───────────────────────────────────────┘
```

### RC Lifecycle — Step by Step

```
══════════════════════════════════════════════════════════════════════
                    RC LIFECYCLE — COMPLETE FLOW
══════════════════════════════════════════════════════════════════════

  PHASE 1: PREPARE (/team-rc)
  ─────────────────────────────────────────────

  ① Check: no existing rc/* branch on remote
     (only one RC at a time — enforced)

  ② Derive next version from remote tags
     V0.1.0 exists → next is V0.1.1
     No tags yet   → V0.1.0

  ③ Verify develop CI is green

  ④ Cut branch:
     develop ─────────── cut ──── rc/V0.1.1
                                    │
  ⑤ Deploy to staging              │ (optional, if
     (workflow_dispatch)            │  staging_workflow
                                    │  is configured)

  PHASE 2: VERIFY (manual / AI QA)
  ─────────────────────────────────────────────

  ⑥ Test on staging environment

  ⑦ Bug found?
     └── hotfix branch from rc/V0.1.1
         └── fix → PR to rc/V0.1.1 (squash merge)
         └── cherry-pick fix to develop (immediately!)
         └── re-deploy staging, re-verify

  ⑧ All good → proceed to promote

  PHASE 3: PROMOTE (/team-rc promote)
  ─────────────────────────────────────────────

  ⑨  Create PR: rc/V0.1.1 → main

  ⑩  Squash merge via GitHub
      (tries --auto first, waits for CI)
      (falls back to manual merge if auto-merge disabled)

  ⑪  Tag V0.1.1 on main (the squash commit)

  ⑫  Create GitHub Release (--generate-notes)

  ⑬  Check milestone: all issues closed?
      → yes: close milestone automatically
      → no:  report "X open, Y closed"

  ⑭  Delete rc/V0.1.1 branch (via --delete-branch)

  ⑮  Reminder: cherry-pick any rc hotfixes to develop

══════════════════════════════════════════════════════════════════════
```

### RC Freeze Rule

```
  rc/V0.1.0 cut ──── FROZEN: only hotfixes ────► promote
       │
  develop ── feat/D ── feat/E ── feat/F ──        ← new features here
       │                                   │
       └── after promote ─────────── /team-rc → rc/V0.1.1
           immediately                  (D, E, F get their turn)
```

### Only One RC At A Time

```
/team-rc checks remote:
  git ls-remote --heads origin 'rc/*'

  ├── Found rc/V0.1.0
  │   → "RC already in progress. Promote it first."
  │   → STOP
  │
  └── None found
      → proceed to cut new rc

Version derived from remote tags (not local config)
→ no conflicts between team members running /team-rc simultaneously
```

---

## GitHub Ecosystem Integration

### What We Use and Why

```
══════════════════════════════════════════════════════════════════════
                GITHUB ECOSYSTEM — COMPLETE MAP
══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                        GITHUB FEATURES                           │
│                                                                   │
│  ┌─────────┐    ┌─────────┐    ┌────────────┐    ┌──────────┐  │
│  │ Issues   │    │ Labels  │    │ Milestones │    │   PRs    │  │
│  │          │    │         │    │            │    │          │  │
│  │ Source   │◄──►│ State   │    │ Version    │    │ Delivery │  │
│  │ of truth │    │ machine │    │ tracking   │    │ mechanism│  │
│  │ for tasks│    │ for     │    │ (V0.1 has  │    │ squash   │  │
│  │          │    │ workflow│    │  12 issues) │    │ merge    │  │
│  └────┬─────┘    └────┬────┘    └─────┬──────┘    └────┬─────┘  │
│       │               │              │                  │        │
│  ┌────▼─────┐    ┌────▼────┐    ┌────▼──────┐    ┌────▼─────┐  │
│  │ Issue    │    │ Branch  │    │ Releases  │    │ Actions  │  │
│  │ Template │    │ Protect │    │ + Tags    │    │          │  │
│  │          │    │         │    │           │    │ ci.yml   │  │
│  │ mission  │    │ develop │    │ V0.1.0    │    │ post-    │  │
│  │ form     │    │ main    │    │ V0.1.1    │    │ merge.yml│  │
│  │ with     │    │ no force│    │ generate  │    │ deploy   │  │
│  │ priority │    │ push    │    │ notes     │    │ .yml     │  │
│  └──────────┘    └─────────┘    └───────────┘    └──────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    REPO SETTINGS                          │    │
│  │                                                            │    │
│  │  ● delete_branch_on_merge: true                           │    │
│  │  ● allow_squash_merge: true (ONLY squash allowed)         │    │
│  │  ● allow_merge_commit: false                              │    │
│  │  ● allow_rebase_merge: false                              │    │
│  │  ● allow_auto_merge: true                                 │    │
│  │  ● squash_merge_commit_message: PR_BODY                   │    │
│  │    (preserves "Closes #N" in squash commit)               │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### GitHub Actions — The Three Workflows

```
┌──────────────────────────────────────────────────────────────┐
│ ci.yml                                                        │
│ ────────                                                      │
│ Triggers: push to develop/main, PR to develop/main            │
│ Does: lint → test → build                                     │
│ Purpose: quality gate for ALL code changes                    │
│                                                                │
│   on:                                                          │
│     push: [main, develop]                                     │
│     pull_request: [develop, main]  ← main for rc→main PRs    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ post-merge.yml                                                │
│ ──────────────                                                │
│ Triggers: pull_request closed (merged)                        │
│ Does:                                                          │
│   1. Find "Closes #N" in PR body                              │
│   2. Remove status:wip / status:review labels                 │
│   3. Add status:done label                                    │
│   4. Check all checkboxes in Issue body                       │
│   5. Check milestone completion → comment if 100%             │
│ Purpose: automate what humans forget                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ deploy.yml (optional, team-provided)                          │
│ ──────────                                                    │
│ Triggers: workflow_dispatch ONLY (no auto-deploy)             │
│ Inputs:                                                        │
│   environment: staging | prod                                 │
│   ref: rc/* branch (staging) or V* tag (prod)                 │
│ Purpose: explicit, parameterized deployment                   │
│                                                                │
│ Why NOT auto-deploy on push to main?                          │
│   → Decouples version semantics from deployment               │
│   → Rollback = re-run with previous tag, not git revert      │
│   → No accidental prod deploys from merge button              │
└──────────────────────────────────────────────────────────────┘
```

---

## The Mission Contract

The Contract is the bridge between GitHub (permanent) and AI execution (ephemeral).

```
┌──────────────────────────────────────────────────────────────────┐
│                     MISSION CONTRACT                              │
│                                                                    │
│  Location: .teamwork/active/MISSION-42.md (gitignored)           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ YAML Frontmatter                                          │    │
│  │                                                            │    │
│  │ issue: 42                                                 │    │
│  │ title: "feat: add user authentication"                    │    │
│  │ branch: mission/42-add-user-auth-lysfighting              │    │
│  │ assignee: lysfighting                                     │    │
│  │ priority: P1                                              │    │
│  │ milestone: "V0.1"                                         │    │
│  │ issue_content_hash: "sha256..."  ← freshness check       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Body (AI-enriched)                                        │    │
│  │                                                            │    │
│  │ ## Objective (from Issue)                                  │    │
│  │ ## Sub-tasks (checkboxes, ticked during /team-drive)      │    │
│  │ ## Acceptance Criteria (from Issue)                        │    │
│  │ ## Context Files (AI-SCANNED — the key enrichment)        │    │
│  │    → src/auth/login.ts                                    │    │
│  │    → src/middleware/auth.ts                                │    │
│  │    → tests/auth.test.ts                                   │    │
│  │ ## Test Command (from config or Issue)                     │    │
│  │ ## AI Notes (populated during execution)                  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  LIFECYCLE:                                                        │
│    Created by /team-claim                                         │
│    Updated by /team-drive (subtask checkoffs, AI notes)           │
│    Read by /team-ship (generates PR body)                         │
│    DELETED by /team-ship (ephemeral — PR body is the record)      │
│                                                                    │
│  Contract ≠ Issue copy.                                           │
│  Contract = Issue + AI-enriched codebase context.                 │
│                                                                    │
│  FRESHNESS CHECK:                                                  │
│    issue_content_hash = SHA256(title + body) at claim time        │
│    /team-drive re-checks: if hash changed → "Issue updated!"     │
│    Prevents working on stale requirements.                        │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quality Gates — Defense in Depth

```
══════════════════════════════════════════════════════════════════════
              QUALITY GATES — THREE LAYERS OF DEFENSE
══════════════════════════════════════════════════════════════════════

  LAYER 1: LOCAL (git hooks)             ← fastest feedback
  ─────────────────────────
  .githooks/pre-commit → lint
  .githooks/pre-push   → test

  Catches: syntax errors, style violations, test failures
  Speed: seconds
  Bypass: only with --no-verify (discouraged)


  LAYER 2: REMOTE (GitHub Actions CI)    ← authoritative
  ──────────────────────────────────
  .github/workflows/ci.yml → lint + test + build
  Triggers on: PR to develop/main, push to develop/main

  Catches: integration failures, build errors, env-specific bugs
  Speed: minutes
  Cannot bypass (branch protection enforces)


  LAYER 3: STRUCTURAL (Branch Protection) ← prevents accidents
  ───────────────────────────────────────
  develop + main:
    ● Require PR (no direct push)
    ● No force push
    ● No branch deletion
    ● CI must pass (if quality.ci: true)
    ● Review required (if quality.review_required: true)

  Catches: accidental pushes, force-push disasters, unreviewed code
  Bypass: admin only (emergency use)


  LAYER 4: AUTOMATION (post-merge Action) ← prevents forgetting
  ──────────────────────────────────────
  .github/workflows/post-merge.yml
  Triggers on: PR merged

  Does: label transition, checkbox checking, milestone tracking
  Catches: human forgetfulness (the #1 cause of stale boards)


  ┌─────────────────────────────────────────────────────────┐
  │                                                           │
  │    Developer writes code                                  │
  │         │                                                 │
  │    git commit → pre-commit (lint) ── FAIL? → fix locally │
  │         │                                                 │
  │    git push  → pre-push (test) ──── FAIL? → fix locally │
  │         │                                                 │
  │    PR created → CI (lint+test+build) FAIL? → fix in PR   │
  │         │                                                 │
  │    PR merged → post-merge Action ── auto-cleanup         │
  │         │                                                 │
  │    ✅ Done. Four layers passed.                           │
  │                                                           │
  └─────────────────────────────────────────────────────────┘

══════════════════════════════════════════════════════════════════════
```

### Config-Driven Protection

The protection rules adapt to your team's maturity:

```
┌────────────┬──────────────────┬────────────────────────────────┐
│ quality.ci │ quality.review   │ What happens                   │
├────────────┼──────────────────┼────────────────────────────────┤
│ false      │ false            │ PR required (blocks direct     │
│            │                  │ push + force push). No other   │
│            │                  │ gates. Good for starting out.  │
├────────────┼──────────────────┼────────────────────────────────┤
│ true       │ false            │ CI must pass. PR required.     │
│            │                  │ Self-merge OK. Most teams.     │
├────────────┼──────────────────┼────────────────────────────────┤
│ false      │ true             │ 1 reviewer required. No CI     │
│            │                  │ gate. Rare configuration.      │
├────────────┼──────────────────┼────────────────────────────────┤
│ true       │ true             │ CI + reviewer. Full ceremony.  │
│            │                  │ Recommended for production.    │
└────────────┴──────────────────┴────────────────────────────────┘
```

---

## Versioning Model

```
══════════════════════════════════════════════════════════════════════
                   VERSIONING — TWO LEVELS
══════════════════════════════════════════════════════════════════════

  MILESTONE = Product Goal (big, strategic)
  ═════════════════════════════════════════

  Milestone V0.1 "AI Camera Pipeline"
    ├── Release V0.1.0 (features A, B, C)     ← deployment unit
    ├── Release V0.1.1 (features D, E)         ← small, frequent
    ├── Release V0.1.2 (hotfix)                ← patch
    └── Release V0.1.3 (feature F)
        └── all issues done → milestone closes automatically

  Milestone V0.2 "V4 Integration"
    ├── Release V0.2.0
    └── ...


  RELEASE = Deployment Unit (small, frequent)
  ═════════════════════════════════════════

  Each release is:
    ● One squash commit on main
    ● One git tag (V0.1.0)
    ● One GitHub Release (with auto-generated notes)

  Patch version auto-derived:
    git tag -l "V0.1.*" → V0.1.0, V0.1.1 → next is V0.1.2

  Config stores only the milestone prefix:
    versions:
      current: "V0.1"    # NOT "V0.1.3" — patch is automatic


  WHY THIS SEPARATION?
  ═════════════════════════════════════════

  Milestone ≠ Release. They serve different purposes:

  ┌────────────┬───────────────────┬───────────────────────┐
  │            │ Milestone         │ Release               │
  ├────────────┼───────────────────┼───────────────────────┤
  │ Granularity│ Weeks to months   │ Days to week          │
  │ Purpose    │ Product direction │ Deployment unit       │
  │ Tracked by │ GitHub Milestones │ Git tags + Releases   │
  │ Closes when│ All issues done   │ RC promoted to main   │
  │ Example    │ "V0.1 — Camera"   │ V0.1.0, V0.1.1       │
  └────────────┴───────────────────┴───────────────────────┘

══════════════════════════════════════════════════════════════════════
```

---

## Scripts Architecture

### The Five Scripts

```
┌──────────────────────────────────────────────────────────────────┐
│                      SCRIPTS LAYER                                │
│                                                                    │
│  tw-config.sh ─── Foundation ─── Python3 YAML parser              │
│  │                 Reads any key from config.yml                  │
│  │                 Handles colons in values, quoted strings       │
│  │                 Interface: tw-config.sh key.subkey default     │
│  │                                                                │
│  ├── tw-git.sh ─── 15 subcommands ─── All git operations         │
│  │   ensure-base, create-branch, current, protect-check,         │
│  │   push, fetch, rebase, merge-to, tag, commit,                 │
│  │   worktree-add, worktree-remove, log-since,                   │
│  │   cut-release, cherry-pick                                     │
│  │                                                                │
│  ├── tw-label.sh ─── 4 subcommands ─── Label state machine       │
│  │   transition (from → to), set (force), verify, pr-label       │
│  │                                                                │
│  ├── tw-contract.sh ─── 8 subcommands ─── Contract lifecycle     │
│  │   find, read-field, hash, check-freshness,                    │
│  │   toggle-task, sync-checkbox, delete                           │
│  │                                                                │
│  └── tw-pr.sh ─── 7 subcommands ─── PR lifecycle                 │
│      exists, commit-type, create, comment,                        │
│      watch (CI), add-reviewer, verify-merged                      │
│                                                                    │
│  + setup-github-labels.sh ─── Standalone ─── Create all labels   │
│  + tw-e2e-test.sh ─── Standalone ─── Full end-to-end test        │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Why Scripts?

Evidence from v2.6.1 falsification audit:

```
    228 total operations catalogued:
    ├── 145 deterministic (64%) → should be scripts
    ├──  48 LLM-judgment (21%) → should stay in skill.md
    └──  35 mixed (15%)        → split into script + skill

    Bug distribution:
    ├── 21 bugs found in LLM-interpreted operations
    └──  0 bugs found in existing scripts

    Conclusion: LLM re-interprets deterministic operations
    differently across calls. Scripts eliminate that class
    of bugs entirely.
```

---

## Config Reference

```yaml
# .teamwork/config.yml (or .teamspace/config.yml)
# ─────────────────────────────────────────────────

schema_version: 1
skill_version: 2.7.3

# Team roster
team:
  - github: lysfighting
    role: tech-lead
  - github: caseyz-vv
    role: lead
  - github: yuang-yang
    role: backend-engineer

# Project detection (auto-generated by /team init)
project:
  language: python
  test_command: "pytest tests/ -v"
  lint_command: "ruff check ."
  build_command: "python -m build"

# Git conventions
conventions:
  branch_pattern: "mission/{issue}-{slug}-{user}"
  base_branch: develop              # feature PRs target here
  production_branch: main           # rc squash-merges here, tags here
  commit_format: "type(scope): description | Mission: #{issue}"

# Label prefixes (customizable per project)
label_prefix:
  status: "status:"
  priority: "priority:"
  size: "size:"

# Quality gates (each independently toggleable)
quality:
  hooks: true                       # git hooks (pre-commit, pre-push)
  ci: true                          # GitHub Actions CI
  review_required: false            # require reviewer on PR
  branch_protection: true           # protect develop + main

# Optional: deployment pipeline
deploy:
  staging_workflow: "deploy.yml"    # enables staging gate in /team-rc

# Optional: version tracking
versions:
  current: "V0.1"                   # milestone prefix (patch auto-derived)

# Optional: git worktree isolation
worktree:
  enabled: true
  path_pattern: "../{repo}-wt-{slug}"

# Mission label (default: "mission")
mc_label: "mission"
```

---

## End-to-End Example

```
══════════════════════════════════════════════════════════════════════
              A WEEK WITH TEAMWORK — END TO END
══════════════════════════════════════════════════════════════════════

  MONDAY MORNING
  ──────────────

  $ /team-issue "实现用户登录功能，支持 OAuth + 密码登录"
    → Issue #42 created
    → Labels: mission, status:queued, priority:P1, size:M
    → Milestone: V0.1

  $ /team-claim 42
    → Contract generated: .teamwork/active/MISSION-42.md
    → Branch: mission/42-user-login-lysfighting
    → Issue #42 assigned to lysfighting
    → Label: status:queued → status:wip

  $ /team-drive
    → Reading Contract... 5 sub-tasks found
    → [1/5] Set up auth middleware ✓ (committed)
    → [2/5] Implement password login ✓ (committed)
    → [3/5] Implement OAuth flow ✓ (committed)
    → [4/5] Add auth tests ✓ (committed)
    → [5/5] Update API docs ✓ (committed)
    → All sub-tasks complete. Tests passing.

  $ /team-ship
    → Pushed branch to origin
    → PR #15 created: "feat: user login system | Closes #42"
    → CI running... ✓ passed
    → Label: status:wip → status:review
    → Contract deleted (ephemeral)

  [REVIEWER MERGES PR #15 — squash merge]
    → post-merge Action fires:
       - Label: status:review → status:done
       - All checkboxes in Issue #42 checked
       - Issue #42 auto-closed (via "Closes #42")

  $ /team-ship done
    → PR #15 verified merged ✓
    → Returned to develop branch
    → Clean workspace


  MONDAY AFTERNOON
  ────────────────

  $ /team-issue "权限管理系统"
    → Issue #45 created

  $ /team-claim 45 → /team-drive → /team-ship
    → PR #16 → merged → auto-cleanup


  TUESDAY
  ───────

  $ /team-rc
    → No existing RC branch ✓
    → Next version: V0.1.0 (auto-derived, no tags yet)
    → Develop CI: green ✓
    → Branch rc/V0.1.0 cut from develop
    → Staging deploy triggered

  [VERIFY ON STAGING]
    → Found bug in OAuth redirect!

  [HOTFIX]
    → Branch from rc/V0.1.0 → fix → PR to rc/V0.1.0 (squash)
    → Cherry-pick fix to develop (immediately!)
    → Re-deploy staging → re-verify → all good ✓

  $ /team-rc promote
    → PR: rc/V0.1.0 → main (squash merge)
    → Tag V0.1.0 on main
    → GitHub Release created (auto-generated notes)
    → Milestone V0.1: 2/5 issues closed
    → Branch rc/V0.1.0 deleted


  WEDNESDAY - THURSDAY
  ────────────────────

  [More features: Issues #48, #51, #53]
  [Each: claim → drive → ship → PR merged]


  FRIDAY
  ──────

  $ /team-rc
    → Next version: V0.1.1 (auto-derived from V0.1.0)
    → rc/V0.1.1 cut from develop
    → Staging verify → pass ✓

  $ /team-rc promote
    → Tag V0.1.1
    → Milestone V0.1: 5/5 issues closed
    → Milestone V0.1 auto-closed! 🎉
    → Update config: versions.current → "V0.2"


  NEXT WEEK: V0.2 begins...

══════════════════════════════════════════════════════════════════════
```

---

## Branch Protection

```
┌─────────┬────────────┬──────┬────────┬────────────┬──────────┐
│ Branch  │ Require PR │ CI   │ Review │ Force Push │ Delete   │
├─────────┼────────────┼──────┼────────┼────────────┼──────────┤
│ main    │ yes        │ yes  │ config │ blocked    │ blocked  │
│ develop │ yes        │ yes  │ config │ blocked    │ blocked  │
├─────────┼────────────┼──────┼────────┼────────────┼──────────┤
│ rc/*    │ no (but    │ —    │ —      │ allowed    │ allowed  │
│         │ protect-   │      │        │ (for       │ (after   │
│         │ check      │      │        │ hotfix)    │ promote) │
│         │ blocks     │      │        │            │          │
│         │ direct     │      │        │            │          │
│         │ commits)   │      │        │            │          │
├─────────┼────────────┼──────┼────────┼────────────┼──────────┤
│ feat/*  │ no         │ —    │ —      │ allowed    │ auto     │
│         │            │      │        │            │ (merge)  │
└─────────┴────────────┴──────┴────────┴────────────┴──────────┘

Admin bypass on main + develop (for emergency use by project lead).
```

---

## Closing Thoughts

> *"The best process is invisible. It doesn't ask you to change how you work — it changes how work flows around you."*

Teamwork doesn't replace GitHub. It doesn't ask you to learn a new tool. It takes the GitHub workflow you already know — Issues, PRs, branches, tags — and closes the gaps that AI-era commit frequency creates.

The six skills are not six new things to learn. They are six moments in a developer's day that used to require context-switching, remembering commands, and manual bookkeeping. Now they don't.

```
Before:                              After:
  "What branch am I on?"              /team-claim #42
  "What's the Issue number?"          /team-drive
  "Did I push?"                       /team-ship
  "Is CI passing?"                    /team-rc
  "Did I close the Issue?"
  "Did I update the labels?"
  "What version is this?"
  "Who's working on what?"
```

The loop never breaks. The system remembers what you forget.

---

*Teamwork v2.7.3 — Built for teams where humans and AI write code together.*
