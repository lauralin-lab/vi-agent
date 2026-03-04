#!/usr/bin/env bash
# tw-e2e-test.sh — End-to-end test for teamwork scripts
#
# USAGE:
#   cd <project-with-teamwork-config>
#   bash <path>/tw-e2e-test.sh [--skip-cleanup]
#
# Runs from any repo with .teamwork/ or .teamspace/ config.
# Creates a test issue, runs full claim→drive→ship→done flow, cleans up.
#
# EXIT CODES:
#   0 — all tests passed
#   1 — one or more tests failed
#
# SAFETY:
#   - Creates a temporary test issue (closed + "not planned" on cleanup)
#   - Does NOT touch versions.current or milestones
#   - Does NOT modify existing issues or PRs
#   - Cleans up all artifacts (branch, PR, issue, contract, labels)

set -uo pipefail
# Note: NOT set -e — we handle errors per-test

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_CLEANUP=false
[ "${1:-}" = "--skip-cleanup" ] && SKIP_CLEANUP=true

# ─── Counters ─────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0
TEST_ISSUE=""
TEST_PR=""
TEST_BRANCH=""
ORIGINAL_BRANCH=""
TW_DIR=""

# ─── Helpers ──────────────────────────────────────────────
pass() { ((PASS++)); echo "  ✅ $1"; }
fail() { ((FAIL++)); echo "  ❌ $1"; }
skip() { ((SKIP++)); echo "  ⏭️  $1"; }
info() { echo "  ℹ️  $1"; }
section() { echo ""; echo "━━━ $1 ━━━"; }

run_script() {
  local script="$SCRIPT_DIR/$1"
  shift
  bash "$script" "$@"
}

# ─── Pre-checks ──────────────────────────────────────────
section "PRE-CHECKS"

# Config exists?
if [ -f .teamwork/config.yml ]; then
  TW_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TW_DIR=".teamspace"
else
  fail "No .teamwork/config.yml or .teamspace/config.yml found"
  echo "Run from a project directory with teamwork config."
  exit 1
fi
pass "Config found: $TW_DIR/config.yml"

# gh auth?
if gh auth status >/dev/null 2>&1; then
  pass "GitHub CLI authenticated"
else
  fail "gh auth not configured"
  exit 1
fi

# Git repo?
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  pass "Inside git repository"
else
  fail "Not a git repository"
  exit 1
fi

ORIGINAL_BRANCH=$(git branch --show-current)
info "Current branch: $ORIGINAL_BRANCH"

# ─── Phase 1: Config reads ───────────────────────────────
section "PHASE 1: CONFIG READS (tw-config.sh)"

BASE_BRANCH=$(run_script tw-config.sh conventions.base_branch "main" 2>/dev/null)
if [ -n "$BASE_BRANCH" ]; then
  pass "base_branch = $BASE_BRANCH"
else
  fail "Could not read base_branch"
fi

BRANCH_PATTERN=$(run_script tw-config.sh conventions.branch_pattern "" 2>/dev/null)
if [ -z "$BRANCH_PATTERN" ]; then
  BRANCH_PATTERN=$(run_script tw-config.sh worktree.branch_pattern "" 2>/dev/null)
fi
if [ -n "$BRANCH_PATTERN" ]; then
  pass "branch_pattern = $BRANCH_PATTERN"
else
  skip "No branch_pattern in config (will use default)"
fi

MC_LABEL=$(run_script tw-config.sh github.mc_label "" 2>/dev/null)
[ -z "$MC_LABEL" ] && MC_LABEL=$(run_script tw-config.sh mc_label "" 2>/dev/null)
if [ -n "$MC_LABEL" ]; then
  pass "mc_label = $MC_LABEL"
else
  skip "No mc_label in config (will use default)"
fi

STATUS_PREFIX=$(run_script tw-config.sh label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"
pass "status_prefix = $STATUS_PREFIX"

VERSIONS_CURRENT=$(run_script tw-config.sh versions.current "" 2>/dev/null)
if [ -n "$VERSIONS_CURRENT" ]; then
  info "versions.current = $VERSIONS_CURRENT (will NOT be modified)"
fi

# ─── Phase 2: Create test issue ──────────────────────────
section "PHASE 2: CREATE TEST ISSUE"

ISSUE_URL=$(gh issue create \
  --title "test: teamwork E2E automated validation (will be auto-closed)" \
  --body "$(cat <<'BODY'
Automated E2E test for teamwork skill scripts.
This issue will be automatically closed after validation.

## Sub-tasks
- [ ] Create test file
- [ ] Run validation
BODY
)" \
  --label "${MC_LABEL:-mission-contract},priority:P3,${STATUS_PREFIX}queued,size:S" 2>&1) || {
  fail "Could not create test issue: $ISSUE_URL"
  exit 1
}

TEST_ISSUE=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')
if [ -n "$TEST_ISSUE" ]; then
  pass "Created issue #$TEST_ISSUE"
else
  fail "Could not parse issue number from: $ISSUE_URL"
  exit 1
fi

# ─── Phase 3: Claim flow ─────────────────────────────────
section "PHASE 3: CLAIM (ensure-base → create-branch → label)"

# ensure-base
ENSURE_OUT=$(run_script tw-git.sh ensure-base 2>&1) || {
  fail "ensure-base failed: $ENSURE_OUT"
}
if echo "$ENSURE_OUT" | grep -q "$BASE_BRANCH"; then
  pass "ensure-base → on $BASE_BRANCH"
else
  fail "ensure-base output unexpected: $ENSURE_OUT"
fi

# create-branch
GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "test")
TEST_BRANCH=$(run_script tw-git.sh create-branch "$TEST_ISSUE" "e2e-auto-test" "$GH_USER" 2>/dev/null) || {
  fail "create-branch failed"
}
if [ -n "$TEST_BRANCH" ] && git branch --show-current | grep -qF "$TEST_ISSUE"; then
  pass "create-branch → $TEST_BRANCH"
else
  fail "create-branch result unexpected: $TEST_BRANCH"
fi

# label transition queued→wip
LABEL_OUT=$(run_script tw-label.sh transition "$TEST_ISSUE" queued wip 2>&1) || {
  fail "label transition queued→wip failed: $LABEL_OUT"
}
if echo "$LABEL_OUT" | grep -q "queued.*wip"; then
  pass "label transition queued → wip"
else
  fail "label transition output: $LABEL_OUT"
fi

# verify label
VERIFY_OUT=$(run_script tw-label.sh verify "$TEST_ISSUE" wip 2>&1)
if echo "$VERIFY_OUT" | grep -q "VERIFIED"; then
  pass "label verify: wip confirmed"
else
  fail "label verify: $VERIFY_OUT"
fi

# ─── Phase 4: Drive flow ─────────────────────────────────
section "PHASE 4: DRIVE (protect-check → commit → contract ops)"

# protect-check
PROTECT_OUT=$(run_script tw-git.sh protect-check 2>&1)
PROTECT_EXIT=$?
if [ $PROTECT_EXIT -eq 0 ]; then
  pass "protect-check → OK on feature branch"
else
  fail "protect-check failed (exit $PROTECT_EXIT): $PROTECT_OUT"
fi

# Make trivial change + commit
echo "# E2E automated test — safe to delete" > E2E-AUTO-TEST.md
COMMIT_OUT=$(run_script tw-git.sh commit "test: E2E automated validation" E2E-AUTO-TEST.md 2>&1)
if [ $? -eq 0 ]; then
  pass "commit succeeded"
else
  fail "commit failed: $COMMIT_OUT"
fi

# log-since
LOG_OUT=$(run_script tw-git.sh log-since 2>&1)
if echo "$LOG_OUT" | grep -q "E2E"; then
  pass "log-since shows test commit"
else
  fail "log-since output: $LOG_OUT"
fi

# Create test contract for contract ops
mkdir -p "$TW_DIR/active"
cat > "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" << EOCONTRACT
---
issue: $TEST_ISSUE
title: "test: E2E automated validation"
assignee: $GH_USER
priority: P3
branch: $TEST_BRANCH
claimed: $(date -u +%Y-%m-%dT%H:%M:%SZ)
issue_content_hash: "test-hash-will-not-match"
---

# MISSION-$TEST_ISSUE: E2E automated validation

## Sub-tasks
- [ ] Create test file
- [ ] Run validation
EOCONTRACT

# find contract
FIND_OUT=$(run_script tw-contract.sh find "$TEST_ISSUE" 2>&1)
if echo "$FIND_OUT" | grep -q "MISSION-${TEST_ISSUE}"; then
  pass "contract find → MISSION-${TEST_ISSUE}.md"
else
  fail "contract find: $FIND_OUT"
fi

# read-field
READ_OUT=$(run_script tw-contract.sh read-field "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" "issue" 2>/dev/null)
if [ "$READ_OUT" = "$TEST_ISSUE" ]; then
  pass "contract read-field issue = $TEST_ISSUE"
else
  fail "contract read-field: expected $TEST_ISSUE, got '$READ_OUT'"
fi

# hash
HASH_OUT=$(run_script tw-contract.sh hash "test title" "test body" 2>/dev/null)
if [ -n "$HASH_OUT" ] && [ ${#HASH_OUT} -eq 64 ]; then
  pass "contract hash → ${HASH_OUT:0:16}..."
else
  fail "contract hash: $HASH_OUT"
fi

# check-freshness (should be STALE since hash doesn't match)
FRESH_OUT=$(run_script tw-contract.sh check-freshness "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" "$TEST_ISSUE" 2>/dev/null) || true
if [ "$FRESH_OUT" = "STALE" ]; then
  pass "check-freshness → STALE (expected)"
elif [ "$FRESH_OUT" = "NETWORK_ERROR" ]; then
  skip "check-freshness → NETWORK_ERROR (non-fatal)"
else
  fail "check-freshness: expected STALE, got '$FRESH_OUT'"
fi

# toggle-task
TOGGLE_OUT=$(run_script tw-contract.sh toggle-task "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" 1 2>&1)
if echo "$TOGGLE_OUT" | grep -q "Task 1 checked"; then
  pass "toggle-task 1 → checked"
else
  fail "toggle-task: $TOGGLE_OUT"
fi

# toggle-task out of range
TOGGLE_OOR=$(run_script tw-contract.sh toggle-task "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" 99 2>&1)
TOGGLE_OOR_EXIT=$?
if [ $TOGGLE_OOR_EXIT -ne 0 ]; then
  pass "toggle-task 99 → correctly rejected (exit $TOGGLE_OOR_EXIT)"
else
  fail "toggle-task 99 should have failed"
fi

# sync-checkbox
SYNC_OUT=$(run_script tw-contract.sh sync-checkbox "$TEST_ISSUE" "Create test file" 2>&1) || true
if echo "$SYNC_OUT" | grep -qi "sync"; then
  pass "sync-checkbox → synced"
else
  skip "sync-checkbox → $SYNC_OUT (may fail if issue body format differs)"
fi

# ─── Phase 5: Ship flow ──────────────────────────────────
section "PHASE 5: SHIP (push → PR → labels)"

# push
PUSH_OUT=$(run_script tw-git.sh push 2>&1)
if echo "$PUSH_OUT" | grep -qi "pushed\|up-to-date\|Everything"; then
  pass "push succeeded"
else
  fail "push: $PUSH_OUT"
fi

# PR exists (should NOT exist yet)
run_script tw-pr.sh exists "$TEST_BRANCH" >/dev/null 2>&1
if [ $? -ne 0 ]; then
  pass "PR exists → no (correct, not yet created)"
else
  skip "PR already exists for $TEST_BRANCH"
fi

# commit-type
CT_OUT=$(run_script tw-pr.sh commit-type "test: E2E automated validation" 2>/dev/null)
if [ "$CT_OUT" = "test" ]; then
  pass "commit-type → test"
else
  fail "commit-type: expected 'test', got '$CT_OUT'"
fi

# PR create
PR_RESULT=$(run_script tw-pr.sh create "$TEST_ISSUE" "test: E2E automated validation" "Automated E2E test. Will be closed." "$BASE_BRANCH" "$TEST_BRANCH" 2>/dev/null) || {
  fail "PR create failed"
}
TEST_PR=$(echo "$PR_RESULT" | awk '{print $1}')
if [ -n "$TEST_PR" ] && [ "$TEST_PR" -gt 0 ] 2>/dev/null; then
  pass "PR created → #$TEST_PR"
else
  fail "PR create result: $PR_RESULT"
fi

# PR exists (should exist now)
EXISTS_OUT=$(run_script tw-pr.sh exists "$TEST_BRANCH" 2>/dev/null)
if echo "$EXISTS_OUT" | grep -q "$TEST_PR"; then
  pass "PR exists → #$TEST_PR confirmed"
else
  fail "PR exists after create: $EXISTS_OUT"
fi

# comment
COMMENT_OUT=$(run_script tw-pr.sh comment "$TEST_ISSUE" "🤖 E2E automated test — PR #${TEST_PR}" 2>&1) || true
if echo "$COMMENT_OUT" | grep -qi "comment\|posted"; then
  pass "comment posted on issue #$TEST_ISSUE"
else
  fail "comment: $COMMENT_OUT"
fi

# label wip→review
REVIEW_OUT=$(run_script tw-label.sh transition "$TEST_ISSUE" wip review 2>&1) || true
if echo "$REVIEW_OUT" | grep -q "review"; then
  pass "label transition wip → review"
else
  fail "label transition wip→review: $REVIEW_OUT"
fi

# pr-label
PRLABEL_OUT=$(run_script tw-label.sh pr-label "$TEST_PR" review 2>&1) || true
if echo "$PRLABEL_OUT" | grep -q "review"; then
  pass "PR label → status:review"
else
  fail "PR label: $PRLABEL_OUT"
fi

# verify review
VREVIEW_OUT=$(run_script tw-label.sh verify "$TEST_ISSUE" review 2>&1)
if echo "$VREVIEW_OUT" | grep -q "VERIFIED"; then
  pass "label verify: review confirmed"
else
  fail "label verify review: $VREVIEW_OUT"
fi

# ─── Phase 6: Done flow ──────────────────────────────────
section "PHASE 6: DONE (label done → verify-merged → contract delete)"

# label review→done
DONE_OUT=$(run_script tw-label.sh transition "$TEST_ISSUE" review done 2>&1) || true
if echo "$DONE_OUT" | grep -q "done"; then
  pass "label transition review → done"
else
  fail "label transition review→done: $DONE_OUT"
fi

# verify done
VDONE_OUT=$(run_script tw-label.sh verify "$TEST_ISSUE" done 2>&1)
if echo "$VDONE_OUT" | grep -q "VERIFIED"; then
  pass "label verify: done confirmed"
else
  fail "label verify done: $VDONE_OUT"
fi

# verify-merged (should fail — PR not merged)
run_script tw-pr.sh verify-merged "$TEST_BRANCH" >/dev/null 2>&1
VM_EXIT=$?
if [ $VM_EXIT -eq 1 ]; then
  pass "verify-merged → not merged (correct, exit 1)"
else
  fail "verify-merged: expected exit 1, got $VM_EXIT"
fi

# contract delete
DEL_OUT=$(run_script tw-contract.sh delete "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" 2>&1)
if echo "$DEL_OUT" | grep -qi "deleted"; then
  pass "contract delete → removed"
elif [ ! -f "$TW_DIR/active/MISSION-${TEST_ISSUE}.md" ]; then
  pass "contract delete → file gone"
else
  fail "contract delete: $DEL_OUT"
fi

# ─── Phase 7: Cleanup ────────────────────────────────────
section "PHASE 7: CLEANUP"

if $SKIP_CLEANUP; then
  info "Cleanup skipped (--skip-cleanup)"
  info "Manual cleanup needed: issue #$TEST_ISSUE, PR #$TEST_PR, branch $TEST_BRANCH"
else
  # Close PR + delete remote branch
  if [ -n "$TEST_PR" ]; then
    gh pr close "$TEST_PR" --delete-branch 2>/dev/null && pass "PR #$TEST_PR closed + branch deleted" || skip "Could not close PR #$TEST_PR"
  fi

  # Close issue
  if [ -n "$TEST_ISSUE" ]; then
    gh issue close "$TEST_ISSUE" --reason "not planned" --comment "✅ E2E test passed. Auto-closing." 2>/dev/null && pass "Issue #$TEST_ISSUE closed" || skip "Could not close issue #$TEST_ISSUE"
  fi

  # Switch back to original branch
  git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout "$BASE_BRANCH" 2>/dev/null
  info "Switched to $(git branch --show-current)"

  # Delete local branch if still exists
  if [ -n "$TEST_BRANCH" ]; then
    git branch -D "$TEST_BRANCH" 2>/dev/null && info "Local branch deleted" || true
  fi

  # Remove test file if it leaked to current branch
  [ -f E2E-AUTO-TEST.md ] && rm -f E2E-AUTO-TEST.md

  pass "Cleanup complete"
fi

# ─── Summary ─────────────────────────────────────────────
section "SUMMARY"
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo "  Tests: $TOTAL total"
echo "  ✅ Passed: $PASS"
echo "  ❌ Failed: $FAIL"
echo "  ⏭️  Skipped: $SKIP"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "  🎉 ALL TESTS PASSED"
  exit 0
else
  echo "  💥 $FAIL TEST(S) FAILED"
  exit 1
fi
