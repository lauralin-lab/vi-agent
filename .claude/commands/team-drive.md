---
description: "Execute mission from Contract. Try: /team-drive help"
version: "2.2.0"
---

# /team-drive — Execute Mission

> Read your Mission Contract, enter drive-like execution, and work through sub-tasks systematically.

**User input**: $ARGUMENTS

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/team-drive — Execute your claimed mission

USAGE:
  /team-drive           Read Contract, execute sub-tasks with verify loop

WHAT HAPPENS:
  1. Reads your Mission Contract (.teamwork/active/MISSION-N.md)
  2. Verifies you're on the correct branch
  3. For each unchecked sub-task:
     — Read context files → implement → run tests → commit
     — Checks off sub-task in Contract with timestamp
  4. After all sub-tasks: verify acceptance criteria + self-review
  5. Can be interrupted — progress saved via checkboxes

PREREQUISITES:
  Run /team-claim first to generate a Contract.

NEXT: /team-ship to deliver via PR
```

---

## Step 0: Find Active Contract

```bash
# Detect worktree mode — .mission file contains Issue number
if [ -f .mission ]; then
  WORKTREE_MODE=true
  MISSION_ISSUE=$(cat .mission)
fi

# Detect config directory (in worktree, may need to check parent repo)
if [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
elif [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
else
  echo "NO_CONFIG"
fi
```

- If no config → "Teamwork not initialized. Run `/team` first." → **STOP**
- If in worktree mode (`WORKTREE_MODE=true`) → no branch switching needed in Step 1.
- **Worktree note**: Contract should be in `$TEAMWORK_DIR/active/` within the worktree (copied during `/team-claim`). If not found but `.mission` exists, look for the Contract in the main repo parent directory as fallback.

```bash
ls $TEAMWORK_DIR/active/MISSION-*.md 2>/dev/null
```

- If no Contract found → "No active mission. Run `/team-claim` first." → **STOP**
- If multiple Contracts found → "Multiple active contracts found. This shouldn't happen. Keep one, remove the rest." → **STOP**

Read the Contract file fully. Extract from YAML frontmatter:
- `issue` number
- `title`
- `branch`
- `priority`

Extract from body:
- **Objective**
- **Sub-tasks** (with checkbox status)
- **Acceptance Criteria**
- **Context Files**
- **Test Command**

---

## Step 1: Verify Branch

**If worktree mode** (`WORKTREE_MODE=true`): skip branch check — worktree is already on the correct branch.

**Otherwise:**
```bash
CURRENT_BRANCH=$(git branch --show-current)
```

Compare with Contract's `branch` field.
- If on wrong branch → `git checkout {contract.branch}`
- If branch doesn't exist locally → "Branch {branch} not found. It may have been deleted. Re-run `/team-claim #{issue}` to recreate." → **STOP**

---

## Step 2: Display Mission Briefing

Output a formatted briefing:

```
MISSION BRIEFING
═══════════════════════════════════════
Issue:    #{issue} — {title}
Priority: {priority}
Branch:   {branch}

Objective:
  {objective}

Progress: {completed}/{total} sub-tasks
  {For each sub-task:}
  [x] {completed task} — {timestamp if present}
  [ ] {remaining task} ← current
  [ ] {remaining task}

Acceptance Criteria:
  {criteria}

Context Files:
  {files list}
═══════════════════════════════════════
```

If all sub-tasks are already checked → "All sub-tasks complete. Run `/team-ship` to deliver." → **STOP**

---

## Step 3: Execution Loop

For each unchecked sub-task in order:

### 3a: Announce current task
```
Working on: {sub-task description}
```

### 3b: Read context
Read the files listed in **Context Files** section of the Contract. Use `Glob` and `Grep` to explore further if needed.

### 3c: Implement
Write the code, make the changes. Follow the project's existing patterns and conventions.

### 3d: Verify
Run the test command from the Contract (or from config):
```bash
# From Contract's Test Command field, or fall back to config
{TEST_CMD}
```

If tests fail → fix the issue and verify again. Do not move on until verification passes.

### 3e: Update Contract
After completing a sub-task, update the Contract file:
- Change `- [ ]` to `- [x]` for the completed task
- Add timestamp: `- [x] {task description} — {HH:MM}`

### 3f: Commit
```bash
# Stage only files modified for this sub-task (avoid git add -A which stages everything)
git add {specific files changed for this sub-task}
git commit -m "{type}({scope}): {description} | Mission: #{issue}"
```

Use appropriate commit type:
- `feat` for new functionality
- `fix` for bug fixes
- `refactor` for restructuring
- `test` for adding tests
- `docs` for documentation

**Do NOT push** — save pushes for `/team-ship`.

### 3g: Next task
Move to the next unchecked sub-task. Repeat from 3a.

---

## Step 4: Completion Check

After all sub-tasks are checked:

### 4a: Verify acceptance criteria
Go through each acceptance criterion from the Contract. For each one:
- Can you demonstrate it's met? (run a test, show output, etc.)
- If not met → identify what's missing, add it as a new sub-task in the Contract, implement it

### 4b: Run full test suite
```bash
{TEST_CMD from config}
```

All tests must pass.

### 4c: Self-review
Read through all changes made during this session:
```bash
# Use the branch name from Contract frontmatter (not hardcoded)
BASE_BRANCH=$(grep 'base_branch:' $TEAMWORK_DIR/config.yml | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' || echo "main")
git log --oneline ${BASE_BRANCH}..HEAD
git diff ${BASE_BRANCH}...HEAD --stat
```

Check for:
- Missing error handling
- Untested edge cases
- Code quality issues
- Leftover debug code

Fix any issues found.

### 4d: Update Contract AI Notes
Add execution notes to the Contract's **AI Notes** section:
```markdown
## AI Notes
- Completed: {timestamp}
- Key decisions: {any decisions made during implementation}
- Issues encountered: {any problems and how they were resolved}
- Files modified: {list of files changed}
```

---

## Step 5: Output Completion Summary

```
MISSION EXECUTION COMPLETE
═══════════════════════════════════════
Issue:    #{issue} — {title}
Status:   All sub-tasks done
Commits:  {N} commits on branch {branch}

Sub-tasks completed:
  [x] {task 1} — {time}
  [x] {task 2} — {time}
  ...

Acceptance Criteria:
  {criterion 1} — verified by {evidence}
  {criterion 2} — verified by {evidence}

Tests: passing
═══════════════════════════════════════
Next: /team-ship to create PR and deliver
```

---

## Error Handling

- Config missing → "Run `/team` first to initialize teamwork." → **STOP**
- Contract references files that don't exist → warn, skip those context files
- Test command not defined → warn "No test command configured. Add `test_command` to `$TEAMWORK_DIR/config.yml`."
- Git conflicts → resolve them, then continue
- If execution is interrupted (user stops mid-task), the Contract preserves progress via checkboxes — next `/team-drive` run picks up where it left off

---

## Integration with /drive

This skill provides a **lightweight drive-like experience** focused on the Mission Contract. For full drive mode (with Phase 0 briefing, team assembly, wave decomposition), use `/drive` directly and pass the Contract path as context:

```
/drive Execute the mission defined in $TEAMWORK_DIR/active/MISSION-{N}.md
```

`/team-drive` is the **quick path** — it skips Phase 0 (the Contract IS the briefing) and executes directly. Use it for straightforward missions. Use full `/drive` for complex missions that need deeper planning.
