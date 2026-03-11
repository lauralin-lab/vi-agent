# Changelog — Teamwork Skills

All notable changes to the Teamwork skill set.

## [3.8.1] — 2026-03-11

### Fixed — Batch checkbox sync replaces fragile per-item sync

- **`sync-all-checkboxes`**: new `tw-contract.sh` subcommand — reads Contract, extracts ALL checked items (Sub-tasks + Success Criteria), fuzzy-matches against Issue body, updates in ONE API call
  - Fixes race condition (was: N reads + N writes, later writes could overwrite earlier)
  - Fixes silent failure (was: all errors `exit 0`, LLM thought sync succeeded)
  - Fixes exact-match fragility (was: `str.replace` needed char-for-char match; now: strips timestamps, normalizes whitespace/dashes, prefix/containment matching)
  - Fixes missing Success Criteria sync (was: only Sub-tasks synced, Success Criteria had no mechanism)
- **`sync-checkbox`**: deprecated (kept as backward-compatible alias with deprecation warning)
- **`/team-drive`**: Step 3 now calls `sync-all-checkboxes` (batch) instead of `sync-checkbox` (per-item)
- **Checkbox Gate**: adds `sync-all-checkboxes` call after recovery toggles — catches any missed syncs before completion
- **Parallel mode**: Lead syncs once per wave completion instead of per-task

### Fixed — Per-user setup (tab title, notifications) missing from fresh install

- **`/team init`**: Extracted per-user local setup (worktree preference, terminal tab title+color, desktop notifications) from MERGE MODE into new **Step 4h** — now runs for BOTH fresh install and merge mode
- **Root cause**: Tab title and notification prompts were only in the merge mode path; first user setting up the project (fresh install) was never prompted
- **`/team-ship`**: Added `sync-all-checkboxes` defense-in-depth call in pre-flight (Step 2b) — catches missed syncs from team-drive

### Added — Per-user config status dashboard + worktree path configuration

- **`/team init` Step 4h**: Always displays per-user config status dashboard (worktree, tab title, notifications) — even if all configured. Dynamically offers to enable unconfigured features via AskUserQuestion with "全部开启" one-click option
- **Worktree root path**: New `git config --local teamwork.worktree-root` setting. Three options: `.claude/worktrees/` (matches Claude Code native behavior), sibling directory (backward compat), or custom path
- **`/team-claim`**: Worktree creation now reads `teamwork.worktree-root` — creates worktrees under user's chosen root instead of hardcoded sibling path
- **Init ↔ Config separation**: Init shows status + guides setup; Config handles viewing/editing existing settings

## [3.8.0] — 2026-03-10

### Added — Desktop notification setup in /team init

- **Step 5c**: `/team init` now offers to configure macOS desktop notifications
  - Writes `~/.claude/notify.sh` hook (subagent-filtered, event-typed)
  - Registers Notification/Stop/TeammateIdle hooks in `~/.claude/settings.json`
  - Detects `terminal-notifier` for click-to-activate-terminal (osascript fallback)
  - Idempotent: skips if already configured

### Fixed — PR body self-referential criteria

- `/team-ship` Step 4b: filter out "PR merged"/"CI pass on PR" criteria when copying
  from Contract to PR body (self-referential in a PR, valid only at Issue level)

## [3.7.1] — 2026-03-10

### Fixed — Audit: VE full coverage + script bugs + version sync

- Fixed 4 script bugs found during full audit (tw-git, tw-pr, tw-config, tw-label)
- Aligned all VE output templates with visual-encoding-standard.md
- Synchronized version to 3.7.1 across all skill files, README, ONBOARDING, manual
- Doctor expanded to 12 checks (+PR CI status)

## [3.7.0] — 2026-03-09

### Added — Smart sync: dashboard behind-detection + AI conflict resolution

**Dashboard behind-base detection**:
- PR lines now show `⚠️ N behind {base}` when branch is behind base branch
- NEXT box prioritizes sync recommendation when PR is behind
- No extra API calls — uses local git rev-list against already-fetched branches

**AI conflict resolution** (`/team-ship sync`):
- Sync no longer STOPs on conflict — AI reads both sides of conflict markers and resolves
- For each conflicted file: read → understand intent → edit → git add → git rebase --continue
- Ambiguous conflicts (semantic contradictions) are resolved with best judgment + flagged in summary
- Auto force-push rebased branch after successful rebase
- Summary output shows resolved files and any flagged ambiguities

## [3.6.1] — 2026-03-09

### Added — Terminal tab title + Tips system

**Terminal tab title** (`/team init`):
- New optional step after worktree preference: configure terminal tab to auto-display
  current git branch name (e.g., `mission/42-add-auth`)
- User sees clear description of the benefit before opting in
- Auto-detects shell (zsh/bash/fish) and appends appropriate hook
- Checks for existing precmd/PROMPT_COMMAND conflicts before appending
- One-time, per-user, idempotent (marker-based detection)

**Tips system** (all 6 skills):
- Every `/team-*` command now displays a random tip after its output
- Tips pool in `scripts/tw-tips.txt` — easy to add/remove tips
- 15 tips covering lesser-known features: auto, wrap, doctor, batch, review, etc.
- Best-effort no-repeat within a session

## [3.6.0] — 2026-03-09

### Added — Manual Ops Handoff: guided flow for human-action tasks

When a mission contains tasks that require human action (console operations, server access,
deployment verification), teamwork now classifies, skips, and hands off manual tasks across the full pipeline:

**Full audit (5-domain parallel review) found and fixed 8 bugs in initial v3.6.0 implementation:**

**team-drive:**
- **Plan Assessment**: new `🔧 MANUAL` classification for sub-tasks requiring human action
- **Checkbox Gate**: MANUAL tasks are expected-unchecked, not treated as missed toggles
- **Execution Loop**: MANUAL tasks skipped during execution (not attempted by AI)
- **Mode Selection**: only code tasks counted for sequential/parallel/team threshold
- **Mission Briefing**: "all complete" check excludes MANUAL tasks (prevents re-drive loop)
- **Completion Summary**: splits into "CODE COMPLETE" + "YOUR TURN" sections
  - Code tasks shown as done
  - Manual tasks surfaced in a prominent action block with concrete guidance
  - AskUserQuestion gates the transition: user confirms manual ops done, defers to post-PR,
    asks for help, or skips — THEN `/team-ship` is suggested

**team-ship:**
- **Sub-task gate (2b)**: only code tasks block shipping; MANUAL tasks pass through
- **PR description**: adds "Manual Steps (post-merge)" checklist when manual tasks exist
- **Help text**: updated SHIP FLOW to mention manual task pass-through

**team-claim:**
- **Contract generation**: pre-tags `🔧 MANUAL` tasks during sub-task extraction (human-action tasks identified at claim time, not just during drive validation)

**team.md:**
- **`/team auto`**: drive phase counts code tasks only, pre-flight allows unchecked MANUAL, output shows code/manual split
- **`/team learn`**: new section 12 "MANUAL TASKS & HUMAN WORKFLOWS"
- **Visual Encoding**: added `🔧` to symbol table

**Bugs found and fixed by 5-domain audit:**
1. CRITICAL: Mission Briefing STOP logic — all code done + MANUAL exists → now enters Manual Ops Handoff instead of bare STOP
2. CRITICAL: Zero code tasks (all MANUAL) — now explicitly skips execution, goes to handoff
3. HIGH: `/team auto` task counting included MANUAL tasks — now code-only
4. HIGH: `/team learn` had no MANUAL task coverage — added section 12
5. HIGH: `🔧` emoji used but not in Visual Encoding table — added
6. HIGH: team-claim didn't tag MANUAL during Contract gen — added pre-tagging
7. MEDIUM: team-drive help text didn't explain `🔧` symbol — added TASK SYMBOLS block
8. MEDIUM: team-ship help text didn't mention manual pass-through — updated SHIP FLOW

Previously: manual tasks were mixed into the same list as code tasks with only a `○` marker,
`/team-ship` was suggested immediately with no guidance, and team-ship would STOP on unchecked manual tasks.

## [3.5.2] — 2026-03-09

### Fixed — Worktree guard: prevent drive/ship from wrong directory

- **team-drive**: Step 0c worktree guard — if worktree mode is enabled but user is in the main repo
  (no `.mission` file), STOP with clear message showing the correct worktree path.
  Prevents silent branch switching that bypasses worktree isolation.
- **team-ship**: Step 1b worktree guard — same check before shipping.
  Prevents shipping wrong code when user forgot to cd to worktree.
- **team doctor**: Check 5 item 6 — main-repo mismatch detection.
  Flags when user is in main repo with worktree mode enabled and active Contracts exist.
- **team doctor fix**: added main-repo mismatch action (show path / disable worktree mode / skip).

## [3.5.1] — 2026-03-09

### Fixed — Design review: logic gaps + docs alignment

Full 5-scout audit of teamwork design. Scripts: 100% healthy. Skill consistency: verified.

**Logic fixes:**
- **team-ship**: base branch guard — `protect-check` before shipping prevents accidental ship from main/develop
- **team-ship**: CI failure preserves Contract — no longer deletes Contract when CI fails,
  allowing `/team-drive` → `/team-ship` iteration loop
- **team-drive**: Contract-missing fallback — detects mission branch + open Issue and suggests
  `/team-claim #N` recovery path instead of bare "STOP"

**Documentation alignment:**
- **teamwork-ai-manual.md**: version 3.4.0 → 3.5.0, date updated
- **teamwork-v2-architecture.md**: marked as archived design document with pointer to current manual
- **team-doctor-design.md**: added Check 8 (Remote Sync), updated "7 checks" → "8 checks"
- **README.md**: added `/team doctor` row to skills table

## [3.5.0] — 2026-03-09

### Added — `/team config` + dashboard version + documentation completeness

- **`/team config`**: new subcommand — shows current config.yml content, worktree status, edit instructions.
  Gives users a clear entry point to view/modify settings without re-running init.
- **Dashboard version**: both leader and member dashboards now show `Teamwork v{version}` in footer.
  Version is read dynamically from `skill_version` in config (not hardcoded).
- **Help updated**: added `/team config`, `/team init`, worktree section, removed hardcoded version.
  Version now read from config via `tw-config.sh`.
- **Learn updated**: added Section 11 "Config Management" — shared vs local config, edit workflow.
  Version also dynamic.
- **Init merge mode summary**: now shows actual `skill_version` (was hardcoded "3.4.0"),
  includes `/team config` tip.
- **Argument table**: added `config` entry in both routing table and header table.
- **README/ONBOARDING/Manual**: added `/team config` references across all docs.

## [3.4.3] — 2026-03-09

### Fixed — Merge mode logic gaps + stale references

Full audit of worktree integration across all skill files.

- **Init merge mode**: now asks worktree preference (Step 5) when user has never configured it.
  Previously merge mode skipped ALL interactive questions, so worktree could never be enabled via re-init.
- **Init merge mode**: fixed stale version "3.4.0" in summary template → now shows current version.
- **Init merge mode**: quality section uses safe defaults (`true`) instead of referencing
  undefined Step 3 variables (merge mode skips interactive Steps 2-3).
- **Init merge mode**: Step 3 description clarified — uses existing config + safe defaults, not Step 3 answers.
- **README.md**: updated worktree config reference from `worktree.enabled` to `git config --local`.

## [3.4.2] — 2026-03-09

### Fixed — Worktree section LLM execution reliability

Dashboard worktree section was being skipped by LLM (conditional template buried in long output).
Restructured as mandatory pre-render check with explicit commands, placed before dashboard template.
Deduplicated worktree template (single definition referenced by both leader/member dashboards).

## [3.4.1] — 2026-03-09

### Changed — Worktree mode: shared → local

Worktree mode moved from shared `config.yml` to per-user `git config --local teamwork.worktree true`.
Each team member independently chooses their isolation strategy. Not committed to git.

- **Dashboard**: always shows worktree map when enabled (not just when inside a worktree)
  - ★ marks current location, MC association for each worktree
  - ⚠️ context mismatch warning when current branch doesn't match active mission
- **Init merge mode**: auto-migrates old `worktree:` section to `git config --local`
- **Doctor Check 5**: detects idle worktrees (no mission, no issue), context mismatch
- **Doctor Fix**: idle worktree gets "Remove / Remove + delete branch / Skip" options
- **ship done**: added comment clarifying `ensure-base` already pulls latest

## [3.4.0] — 2026-03-08

### Added — Doctor Actionability Upgrade

Three improvements to make `/team doctor` a workflow, not just a report.

**`/team doctor fix`** — Interactive fix mode:
- 🟢 Cleanup actions (orphan branches, prunable worktrees) auto-execute with summary
- 🟡 Warning actions (stash drop, stale branches) confirm each via AskUserQuestion
- 🔴 Critical actions confirm each with risk explanation
- Cross-contamination always presents both options (discard vs preserve)

**`/team doctor help`** — Self-contained usage guide:
- Shows all checks, severity levels, typical workflow
- No need to navigate back to `/team help` to understand doctor

**vs Remote column** — Branch remote tracking:
- New column in branch table shows ahead/behind vs `origin/{branch}`
- Highlights when local branch is behind remote (most actionable for current branch)
- New Check 8: Remote Sync diagnostic with pull/sync recommendations

**Action Plan improvements:**
- Actions now suggest teamwork commands where applicable (`/team-ship sync`, `/team-issue`, `/team-ship done`)
- Report footer reminds user to run `/team doctor fix`

### Added — Cross-Skill UX Audit (举一反三 from doctor bugs)

Systematic audit found the same 3 structural defects across all skills. Fixed:

**Subcommand help routes (5 new):**
- `/team-ship done help`, `/team-ship review help`, `/team-ship sync help`
- `/team-rc promote help`
- `/team doctor help` (above)

**Branch readiness warnings (2 skills):**
- `team-drive` Step 2a: shows vs base + vs remote before starting work
- `team-ship` Step 2a-bis: sync check before shipping (hard stop if >30 behind base)
- `team-ship` Step 4a: shows existing PR status (CI, review, mergeable) before push

**Error messages → actionable guidance (5 skills, ~12 fixes):**
- `team-ship`: test failures → suggest `/team-drive`; push failures → suggest `/team-ship sync`; CI failures → explain push-to-update flow
- `team-drive`: branch not found → two options (restore from remote / re-claim)
- `team-claim`: active mission → explain abandon + re-claim; not in roster → `/team init`; branch exists but issue closed → `/team doctor fix`
- `team-issue`: milestone not found → `gh issue edit` + `/team init`; labels missing → `/team init`
- `team-rc`: CI abort → suggest fix + re-run; staging fail → suggest deploy first

## [2.7.1] — 2026-03-04

### Fixed — Script Testing Audit (21 bugs found, 14 fixed)

Full-flow testing of 4 scripts (32 subcommands) + 6 skill files. 4 parallel test agents + cross-reference audit.

**CRITICAL fixes:**
- **tw-git.sh cmd_tag**: `git rev-parse "$version"` matched branches (not just tags) → false "already exists" skip. Fixed: `refs/tags/$version`
- **tw-git.sh cmd_merge_to**: `checkout && pull` chain — checkout failure didn't trigger `set -e`, merge proceeded on wrong branch. Fixed: explicit `|| exit 2`

**HIGH fixes:**
- **tw-git.sh cmd_ensure_base**: silent success on checkout failure (same `&&` chain bug). Fixed: explicit error handling
- **tw-git.sh cmd_create_branch**: sed metachar injection (`&`, `/`, `\` in slug). Fixed: bash `${//}` parameter expansion
- **tw-git.sh cmd_rebase/merge_to**: `git fetch 2>/dev/null` with `set -e` killed script silently on network error. Fixed: `|| WARNING`
- **tw-git.sh cmd_tag**: grep regex metacharacters in version (`.` = any char). Fixed: `grep -qF` (fixed string)
- **tw-pr.sh cmd_commit_type**: substring matching false positives ("prefix"→fix, "specification"→test). Fixed: `grep -qEw` (word boundary)
- **tw-contract.sh cmd_toggle_task**: reported success even when task N didn't exist. Fixed: `found` flag + exit 1

**MEDIUM fixes:**
- **tw-git.sh cmd_tag**: verification grep missing `$` anchor → false positive
- **tw-git.sh cmd_push**: `2>&1` mixed stderr into stdout → polluted output
- **tw-git.sh cmd_protect_check**: empty output on detached HEAD
- **tw-label.sh cmd_transition**: "done" transition dropped FROM label when from ≠ wip/review
- **tw-pr.sh cmd_exists**: BASE parameter accepted but never passed to `gh pr list`
- **tw-pr.sh cmd_create**: error message claimed BODY required (actually optional); `2>&1` contaminated URL extraction

## [2.7.0] — 2026-03-04

### Changed — Script Extraction (Von Neumann Mechanism-Content Separation)

Extracted ~64% of deterministic operations from LLM-interpreted skill prose into reusable bash scripts. Skills now orchestrate + judge; scripts execute deterministic operations.

**4 new scripts** in `scripts/`:
- **tw-git.sh** — 13 subcommands: ensure-base, create-branch, current, protect-check, push, fetch, rebase, merge-to, tag, commit, worktree-add, worktree-remove, log-since
- **tw-label.sh** — 4 subcommands: transition, set, verify, pr-label (config-aware status label state machine)
- **tw-contract.sh** — 8 subcommands: teamwork-dir, find, read-field, hash, check-freshness, toggle-task, sync-checkbox, delete
- **tw-pr.sh** — 7 subcommands: exists, commit-type, create, comment, watch, add-reviewer, verify-merged

**6 skill files refactored** to call scripts instead of inline bash:
- **team-claim.md**: branch creation → tw-git.sh, label transition → tw-label.sh
- **team-drive.md**: freshness check → tw-contract.sh, protect check → tw-git.sh, checkbox toggle → tw-contract.sh, log review → tw-git.sh
- **team-ship.md**: push → tw-git.sh, PR lifecycle → tw-pr.sh, labels → tw-label.sh, contract cleanup → tw-contract.sh, rebase → tw-git.sh
- **team-release.md**: merge → tw-git.sh, tag → tw-git.sh, commit → tw-git.sh
- **team-issue.md**: version bump only
- **team.md**: freshness check → tw-contract.sh, version references updated

**Design principles**:
- Scripts accept LLM-generated content as parameters (pure I/O boundary)
- Scripts self-discover config via SCRIPT_DIR + tw-config.sh
- Subcommand pattern: `tw-{domain}.sh {subcommand} [args...]`
- All scripts macOS compatible, meaningful exit codes, stderr for errors

## [2.6.1] — 2026-03-04

### Fixed — Falsification Audit (Popper's method applied across all skill files)

**CRITICAL fixes:**
- **team.md + team-drive.md**: Freshness check completely broken — `ISSUE_TITLE`/`ISSUE_BODY` never extracted from JSON, `CONTRACT_PATH` never defined. Hash always computed on empty string → false "ISSUE UPDATED" warning on every `/team-drive`. Fixed: added `jq` extraction + proper loop over Contract files.
- **team.md**: Merge mode used `import yaml` (PyYAML) — not in Python stdlib. Fails on systems without PyYAML. Fixed: replaced with `grep -q "^${section}:"` (zero dependencies).
- **team.md**: Branch protection `gh api --field` sent JSON objects as strings → 422 Validation Error. Fixed: switched to `--input` with heredoc for proper JSON body.
- **team-release.md**: Shell injection in CHANGELOG Python script — release body with triple quotes breaks embedded `'''$ENTRY'''`. Fixed: write to temp file, pass as `sys.argv`.
- **team-release.md**: `git merge "$BASE_BRANCH"` used stale local copy without fetch → release could miss latest code. Fixed: `git fetch` before merge, use `origin/$BASE_BRANCH`.
- **team-release.md**: Version bump committed on `$RELEASE_BRANCH` but pushed to `$BASE_BRANCH` → wrong branch in dual-branch mode. Fixed: `git checkout "$BASE_BRANCH"` before config update commit.

**HIGH fixes:**
- **team.md**: `init` force mode promised in routing table but never implemented — `/team init` on existing project showed dashboard. Fixed: added `$ARGUMENTS == "init"` check in Step 1.
- **team.md**: Version display in merge summary showed `2.5.0` (stale from v2.5). Fixed → `2.6.1`.
- **team.md**: Issue template hardcoded `"status:queued"`. Fixed → `"{STATUS_PREFIX}queued"`.
- **team.md**: Git hooks `grep` matched commented-out config lines + no `head -1`. Fixed: `grep -v '^\s*#'` + `head -1`.
- **team.md**: `{REPO}` template syntax mixed with `$REPO` shell syntax in bash code. Fixed → all `$REPO`.
- **team.md**: Duplicate section ID `6c` (two sections). Fixed → second renamed `6d`.
- **team.md**: Fallback label creation hardcoded `"mission"` and `"status:*"`. Fixed → config-driven.
- **team-issue.md**: macOS BSD sed `\+` syntax fails — `sed 's/.*--milestone \+\([^ ]*\).*/\1/'`. Fixed → `\+` replaced with `  *` (portable).
- **team-issue.md**: `MILESTONE_FLAG="--milestone \"$MILESTONE\""` embeds literal escaped quotes → milestone assignment always fails. Fixed → `${MILESTONE:+--milestone "$MILESTONE"}` parameter expansion.
- **team-issue.md**: References nonexistent `team.repo` config key. Fixed → proper `mc_label` + `STATUS_PREFIX` reads.
- **team-ship.md**: All label operations hardcoded `status:` prefix. Fixed → reads `$STATUS_PREFIX` from config.
- **team-ship.md**: `$ISSUE_TITLE` undefined in PR creation → commit type detection always defaulted to `feat`. Fixed → extract from Contract frontmatter.
- **team-ship.md**: `gh pr list --head {branch}` without `--state open` could find closed PRs. Fixed → added `--state open`.
- **team-claim.md**: Step 6 hardcoded `"status:queued"` / `"status:wip"`. Fixed → config-driven `${STATUS_PREFIX}`.
- **team-release.md**: No check if tag already exists before `git tag`. Fixed → `git rev-parse` + `git ls-remote` guards.
- **team-release.md**: `repos/{REPO}/milestones` template syntax in bash code. Fixed → `repos/$REPO/milestones`.
- **setup-github-labels.sh**: Hardcoded `"mission"` label, ignoring `mc_label` config. Fixed → reads via `tw-config.sh` with fallback.
- **setup-github-labels.sh**: `grep '^\s*status:'` could match wrong config line. Fixed → prefers `tw-config.sh`, fallback grep excludes comments.

### Changed
- All skill files bumped to v2.6.1
- Post-merge Action regex (committed in previous session fix): expanded from `Close(s)` to all 9 GitHub closing keywords, added `parseInt` for proper number type, replaced milestone race condition workaround with `listForRepo` query

## [2.6.0] — 2026-03-04

### Added — Dual-branch model + release safety gates

- **Dual-branch support** — New `conventions.release_branch` config key enables base/release branch separation:
  - When `release_branch == base_branch` (default) → single-branch mode, backward compatible with v2.5
  - When different (e.g. base=develop, release=main) → dual-branch mode: `/team-release` merges base→release before tagging
- **`team-release.md`** v2.5.0 → v2.6.0:
  - **Staging deploy gate** (Step 4b): if `deploy.staging_workflow` configured, checks latest Action run status before tagging. Warns on failure, user can abort or proceed.
  - **Merge base→release** (Step 5): in dual-branch mode, merges base into release branch before creating tag. Stops on conflict.
  - **CHANGELOG append** (Step 7b): after `gh release create`, fetches release body and prepends to `CHANGELOG.md`. Non-fatal if fails.
  - Renumbered steps 5-11 → 6-12 to accommodate new steps
- **`team-drive.md`** v2.4.0 → v2.6.0:
  - **Branch safety check** (Step 2b): prevents code execution on protected branches (base_branch or release_branch). Must be on feature branch.
- **`team-claim.md`** v2.4.1 → v2.6.0:
  - Explicitly checks out `base_branch` and pulls before creating feature branch (was implicit before)
- **`team-issue.md`** v2.5.1 → v2.6.0:
  - `--milestone` parameter: override milestone assignment per-issue (e.g. `/team-issue --milestone V0.2 fix camera`)
  - Priority: `--milestone` arg > `versions.current` from config > none

### Changed — Config-driven branch references

- **`team-ship.md`** v2.4.0 → v2.6.0:
  - Sync operation, done operation, help text all use `$BASE_BRANCH` from config instead of hardcoded "main"
  - **Done operation D3/D4 → fallback pattern**: checks if post-merge Action already handled label updates and Issue closure before acting. Skips with `(handled by PR merge)` / `(handled by post-merge Action)` messages.
- **`team.md`** v2.5.2 → v2.6.0:
  - **New Step 4e: Post-merge Action** — generates `.github/workflows/post-merge.yml` that auto-runs on PR merge: extracts `Closes #N` from PR body, updates labels (wip/review→done), checks all Issue checkboxes, checks milestone completion and comments when 100%
  - **New Step 5b: Repo merge settings** — auto-delete head branches, squash merge only, PR_BODY commit message (preserves `Closes #N`)
  - **Step 5c: Dual-branch protection** — protects both base_branch AND release_branch in dual-branch mode
  - **CI workflow templates** — use `{BASE_BRANCH}` placeholder instead of hardcoded `main`; dual-branch mode includes both branches in push triggers
  - Config health check table now includes `release_branch`, `deploy.staging_workflow`, and post-merge Action
  - Fresh install template includes commented `release_branch` and `deploy` sections
  - Dashboard merge count uses config `base_branch`
  - All `skill_version` references updated to 2.6.0

### Design principle

All branch names, workflow names, and deployment behaviors are config-driven. Zero hardcoded project references in skill files. Generic design validated through vi_agent practice.

## [2.5.1] — 2026-03-04

### Added — `/team-issue` duplicate check

- **`team-issue.md`** v2.4.1 → v2.5.1 — New **Step 1b: Duplicate Check** before Issue body generation:
  - Extracts 2-3 key terms from analyzed title/description
  - Runs `gh issue list --search` against open Issues
  - AI evaluates results for **semantic similarity** (not string match)
  - If duplicates found → `AskUserQuestion` with options: create anyway, update existing, or cancel
  - If no match → proceeds silently (zero friction on happy path)
- Help text updated: "WHAT HAPPENS (create)" now shows 6 steps including duplicate search

## [2.5.0] — 2026-03-04

### Added — `/team-release` skill

- **`team-release.md`** — New skill: close a version milestone, create git tag, publish GitHub Release, and prepare the next version. Full 11-step flow:
  1. Pre-flight: detect config dir, read `versions.current` (required), `versions.spec_path` (optional)
  2. Milestone check: show open/closed Issue counts, warn if open issues remain
  3. AI audit: if `versions.spec_path` configured, compare spec Success Criteria vs merged PRs + closed Issues. Outputs ✅/⚠️/❌ per criterion
  4. User confirmation before any mutations
  5. `git tag {VERSION}` + `git push origin {VERSION}`
  6. `gh release create {VERSION} --generate-notes` — auto-generates notes from merged PRs
  7. Close GitHub Milestone
  8. Prompt for next version name
  9. Create next GitHub Milestone
  10. Update `versions.current` in config.yml
  11. Commit config change + push
- Tag format: uses `versions.current` value exactly (e.g. `"V0.1"` → tag `"V0.1"`)
- AI audit is conditional: only runs when `versions.spec_path` is set and file exists

### Changed — `/team init` idempotency fix

- **`team.md`** v2.4.1 → v2.5.0 — `Step 4b` now has two modes:
  - **MERGE MODE** (config exists): preserves all existing sections, updates `skill_version` in-place via sed, appends only missing sections (`project`, `conventions`, `label_prefix`, `quality`). Explicitly does NOT touch `team`/`members`, `github`, `worktree`, `versions`, `roles`, or any custom sections.
  - **FRESH INSTALL** (no config): writes full template (existing behavior, unchanged).
  - Previous behavior: unconditional overwrite. Running `/team init` on a project with customized config (e.g. vi_agent's nested `github.mc_label` schema) would silently destroy all customizations.
- **`team.md` config template** — added `spec_path` comment to `versions:` block, pointing to `/team-release` as consumer.

---

## [2.4.1] — 2026-03-03

### Changed — Dashboard Upgrade (team.md v2.3.2 → v2.4.1)

- **`team.md`** — Replaced all fragile `grep/sed` config chains in Step 6c with `tw-config.sh` calls. Four sed chains eliminated:
  - `MISSION_LABEL` — now via `tw-config.sh github.mc_label` (dual-schema: teamspace first, then flat `mc_label`, then `"mission"` default)
  - `STATUS_PREFIX` — now via `tw-config.sh label_prefix.status`
  - `PRIORITY_PREFIX` — now via `tw-config.sh label_prefix.priority`
  - `CURRENT_VERSION` — now via `tw-config.sh versions.current`
- **`team.md` config template** — `skill_version` in generated `.teamspace/config.yml` template updated from `2.1.0` to `2.4.1`. New installs get correct version.
- **`team.md` version** — Bumped from `2.3.2` to `2.4.1` (skips 2.4.0 — dashboard was deferred during stability hardening, now catches up).

### Fixed — E2E Validation on vi_agent

- **`scripts/tw-config.sh`** — Fixed inline YAML comment stripping. Values like `mc_label: "mission-contract"  # comment` were returning `mission-contract"  # comment` instead of `mission-contract`. Now correctly extracts quoted value, ignoring trailing inline comment.
- **`team-claim.md`** — mc_label resolution now handles both config schemas: tries `github.mc_label` (teamspace/vi_agent schema) first, then `mc_label` (teamwork v2 schema), then defaults to `"mission"`. Fixes silent fallback to wrong label on vi_agent.
- **`team-issue.md`** — Same mc_label dual-schema fix. Both `github.mc_label` and `mc_label` paths tried before falling back to default.

Discovered and fixed during E2E validation run on `../vi_agent`. Full skill flow (issue → claim → drive → ship) verified non-destructively (Issue #27, PR #28, all closed/deleted post-test).

---

## [2.4.0] — 2026-03-03

### Changed — Stability Hardening

- **`scripts/tw-config.sh`** — New unified config parser. Replaces 15+ fragile sed chains across all skill files. Handles colon-containing values (label prefixes like `status:`), quoted strings, and nested YAML. Usage: `bash ~/.claude/commands/scripts/tw-config.sh project.test_command ""`.
- **Placeholder normalization** — Single canonical naming convention across all 5 skills: `{issue}`, `{pr}`, `{user}`, `{branch}`, `{title}`, `{repo}`, `{milestone}`. Eliminates confusion between `{N}`, `{ISSUE_NUMBER}`, `{pr-number}`.
- **team-ship pseudocode implemented** — tech-lead extraction (reads team roster for `role: tech-lead`), commit-type detection (prefix-based: fix/refactor/test/docs/feat), and base_branch reading were pseudocode in v2.3.x. Now real bash.
- **Critical command verifications** — `gh api user` failure now fatal with clear message in all skills. `git checkout` verifies branch existence before switching. TEST_CMD empty check warns instead of silently passing.
- **Issue bidirectional sync in team-drive** — After each sub-task is checked off in the Contract, the corresponding checkbox in the GitHub Issue body is updated. Team members see real-time progress on GitHub without visiting the branch. Non-fatal: network errors warn and continue.
- **Version from Milestone (not config)** — team-claim reads Milestone from Issue JSON (`milestone.title`) instead of `config.yml versions.current`. Config fallback still works for backward compatibility. Removes need to keep `versions.current` in sync manually.
- **REPO detection via `gh repo view`** — team-issue no longer requires a `repo:` field in config.yml. Uses `gh repo view --json nameWithOwner` auto-detection instead (same approach as other skills).

---

## [2.3.3] — 2026-03-03

### Added — Script-Based Skill Architecture (Pilot)

- **`scripts/setup-github-labels.sh`** — Executable bash script that creates/updates all teamwork labels on GitHub. Reads label prefixes from `.teamwork/config.yml` automatically. Idempotent (uses `--force`). Run: `bash ~/.claude/commands/scripts/setup-github-labels.sh`
- **`install.sh` scripts support** — `install_skill()` now detects and installs `scripts/*.sh` files from each skill directory to `$TARGET_DIR/scripts/`. Symlink mode: symlinks auto-update with `git pull`. Copy mode: copies standalone.
- **`/team` label setup uses script** — Step 5a now calls the script first with inline fallback. Eliminates the fragile 10-command sequence the LLM had to interpret.
- Establishes the pattern: skill folder = `.md` (AI brain) + `scripts/` (deterministic bash). LLM runs scripts; scripts do the mechanical work.

---

## [2.3.2] — 2026-03-03

### Added — Version Management + Issue Format Standardization

- **Milestone-based version tracking** — If `versions.current` is set in config, `/team-issue` assigns the Issue to that GitHub Milestone. Dashboard now queries milestone progress (open/closed counts) and displays `Version X: N/M tasks done`.
- **`/team` dashboard version header** — Reads `versions.current` from config, queries GitHub Milestones API for progress, shows `Version {name}: {closed}/{total} tasks done ({pct}%)` at top.
- **Canonical mission-contract format** — `/team-issue` now generates a consistent structure: `### Objective` (new top section), `### Success Criteria` (canonical name), `### Context & References` (not "Context"). Field names documented as canonical so parsers don't drift.
- **`/team-claim` backward-compatible parsing** — Reads `Success Criteria` (canonical) and `Acceptance Criteria` (legacy), `Context & References` and `Context` (legacy). Populates `version:` Contract frontmatter from `versions.current` config.
- `team-issue`, `team-claim`, `team` bumped to v2.3.2. `team-ship` stays v2.3.1.

---

## [2.3.1] — 2026-03-03

### Fixed — Ship Status Lifecycle

- **`/team-ship` label verification** — After updating Issue label from `status:wip` to `status:review`, immediately verifies via `gh issue view --json labels`. Shows actual labels in output instead of assumed ✅. If label update failed, shows diagnostic warning with manual fix command.
- **`/team` dashboard REVIEW section** — Added `UNDER REVIEW (PR open, awaiting merge)` section between member status and QUEUED. Ships `status:review` issues are now visible on the dashboard instead of falling into a grey zone.
- Both skills bumped to v2.3.1.

---

## [2.3.0] — 2026-03-03

### Added — Issue Sync & Lifecycle Comments

- **Issue freshness detection** — Contract stores `issue_content_hash` (SHA256 of title+body at claim time). `/team-drive` checks hash on entry; if Issue content changed, shows current body and asks user to Update Contract / Continue / Abort. Uses content hash instead of `updatedAt` to avoid false positives from our own comments, label changes, and assignee changes.
- **Dashboard [UPDATED] badge** — `/team` dashboard marks claimed Issues with `[UPDATED]` if content hash differs from Contract.
- **Lifecycle comments** — 3 key events posted as Issue comments for team visibility:
  - `/team-claim`: "Claimed by @user" (already existed)
  - `/team-drive` completion: "All sub-tasks complete — ready for review"
  - `/team-ship` PR creation: "PR #N created — {url}"
- All freshness checks and comments are **non-fatal** — network failures warn but don't block execution.
- Backward compatible: pre-v2.3.0 Contracts without `issue_content_hash` skip freshness check silently.

### Changed

- All skills bumped to v2.3.0

---

## [2.2.0] — 2026-03-03

### Added

- **`/team-issue`** — New skill: turn natural language into standardized GitHub Issues (mission-contract format). AI-enriches description with title, priority, size, domain, sub-tasks, and relevant files from codebase scan. Preview before publish.

### Changed

- **`/team-claim`** — Removed inline `create "title"` subcommand. Issue creation now handled by dedicated `/team-issue` skill (single responsibility).
- All skills bumped to v2.2.0

---

## [2.1.1] — 2026-03-02

### Fixed — Architect Review (13 bugs)

- **CRITICAL**: Contract inaccessible from worktree (active/ gitignored → added copy-to-worktree step)
- **CRITICAL**: Issue template hardcoded "mission" label → now uses `{MISSION_LABEL}` from config
- **CRITICAL**: Branch pattern hardcoded `mission/...` → reads `conventions.branch_pattern` from config
- **HIGH**: `team:` key format collision (erwin=member list, vi-agent=metadata) → check `members:` first
- **HIGH**: Missing config health check → added Step 1c with non-blocking warning
- **HIGH**: Operation Done assumes `mission/` branch prefix → generic numeric extraction
- **MEDIUM**: Worktree `enabled` flag missing → section presence = enabled
- **MEDIUM**: sed greedy pattern `'s/.*'` → all normalized to `'s/^[^:]*://'`
- **MEDIUM**: `git add -A` in team-drive → changed to specific file staging
- **FIX**: `cp` command used `{N}` instead of `${ISSUE_NUMBER}`
- **FIX**: Step 1b→1c routing contradiction (found users bypassed health check)
- **FIX**: `$BRANCH_PATTERN` extraction command missing

---

## [2.1.0] — 2026-03-02

### Added — vi-agent Feature Absorption

Integrated 6 advantages from vi-agent's `.teamspace` system while keeping erwin's portability.

- **Prefixed labels** — `status:wip`, `priority:P1`, `status:blocked`, `status:queued`, `status:done` (queryable, no collisions)
- **Claim comment visibility** — `gh issue comment` posted when claiming an Issue for team transparency
- **Worktree isolation** (optional) — `worktree.enabled: true` in config; creates isolated working directories per mission
- **Version management** (optional) — `versions.current: "V1.0"` in config; version labels + dashboard progress tracking
- **`/team-ship done`** — Post-merge cleanup: close Issue, update labels to `status:done`, clean worktree, return to main
- **`/team-ship review`** — AI code review: fetch PR diff, analyze for correctness/security/architecture/quality/performance, publish `gh pr review`
- **`/team-ship sync`** — Rebase current branch on latest main
- **`.mission` file** — Worktree mode detection (Issue number stored in worktree root)

### Changed

- Labels upgraded from flat (`in-progress`, `P0`) to prefixed (`status:wip`, `priority:P0`)
- Issue template now auto-applies `status:queued` label
- Config schema extended with optional `label_prefix`, `worktree`, `versions` sections
- `team-ship` now has argument routing: `done`, `review`, `sync` subcommands
- Backward compatible: unprefixed labels still work for legacy configs

---

## [2.0.0] — 2026-03-02

### Changed — GitHub-first Redesign

Complete rewrite. GitHub Issues/PRs/Actions replace local file-based coordination.

**Breaking changes:**
- `/teamwork` → renamed to `/team`
- `/team-get-mission` → renamed to `/team-claim`
- `/team-complete` → renamed to `/team-ship`
- `_teamwork/` directory → replaced by `.teamwork/` + GitHub ecosystem
- Mission contracts now auto-generated from GitHub Issues (not manually written)
- Config format changed: `_teamwork/config.md` → `.teamwork/config.yml` (YAML)

### Added

- **`/team`** — Init system with project auto-detection + GitHub config (labels, CI, hooks, Issue template) + dashboard from live GitHub data
- **`/team-claim`** — Claim GitHub Issue → auto-generate AI-enriched Mission Contract → create branch → assign on GitHub
- **`/team-drive`** — Read Contract, execute sub-tasks with verify loop, update checkboxes, commit with Mission reference
- **`/team-ship`** — Pre-flight checks → push → create PR with "Closes #N" → watch CI → request review → cleanup Contract
- **GitHub Actions CI** — auto-generated workflow per language (Node, Python, Go, Rust, Java)
- **Git hooks** — pre-commit (lint) + pre-push (test) via `.githooks/`
- **GitHub Issue template** — structured mission template (`mission.yml`)
- **Priority labels** — P0/P1/P2/P3 + mission/in-progress/review
- **Branch protection** — optional, requires CI pass + PR review
- **AI-enriched Context Files** — Contract auto-discovers relevant files via Glob/Grep
- **Dashboard** — live team status from GitHub API (assigned Issues, open PRs, merge count)

### Removed

- `_teamwork/` directory structure (replaced by `.teamwork/` + GitHub)
- Manual mission contract authoring (now auto-generated from Issues)
- Per-person status files (replaced by GitHub Issue assignment)
- Linear merge protocol (replaced by PR-based workflow)

### Architecture

- Design doc: `docs/teamwork-v2-architecture.md`
- ADR: `_project/decisions/0010-teamwork-v2-github-first.md`
- Inspired by vi-agent lifecycle patterns + GitHub-native workflows

---

## [1.0.0] — 2026-03-02

### Added

- **`/teamwork`** — Init system with interactive team config + dashboard view
- **`/team-get-mission`** — Claim missions, auto-create branches, update status
- **`/team-drive`** — Execute missions wrapping /drive methodology with teamwork context
- **`/team-complete`** — Push, rebase, conflict resolution, merge, status close
- **`_teamwork/` directory structure** — config.md, missions/, members/, archive/
- **Per-person status files** — zero metadata merge conflicts by design
- **Identity detection** — automatic via `gh auth status`
- **Branch auto-creation** — `mission/{id}-{slug}-{username}` naming convention
- **Linear merge protocol** — first merger wins, last merger resolves all conflicts
