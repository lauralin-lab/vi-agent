---
description: "Release a version → git tag → GitHub Release → close Milestone. Try: /team-release help"
version: "2.5.0"
---

# /team-release — Close a Version

> Close the current milestone, create a git tag + GitHub Release, and prepare the next version.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Full release flow |
| `help` or `-h` | Show usage guide |

---

## Route by Argument

Parse `$ARGUMENTS`:

- If `help` or `-h` → output the following and **STOP**:

```
/team-release — Close a version and publish a GitHub Release

USAGE:
  /team-release           Full release flow

PREREQUISITES:
  - versions.current must be set in .teamspace/config.yml (or .teamwork/config.yml)
  - GitHub Milestone matching versions.current should exist (optional but recommended)
  - All Issues for this version should be closed

FLOW:
  1. Pre-flight: read config, verify versions.current
  2. Milestone check: show open/closed Issue counts
  3. AI audit: if versions.spec_path configured, compare spec goals vs merged PRs
  4. User confirmation
  5. git tag {version} + push
  6. gh release create --generate-notes
  7. Close GitHub Milestone
  8. Prompt next version → create next Milestone → update config

NOTES:
  - Tag name = versions.current value exactly (e.g. "V0.1" → tag "V0.1")
  - Release notes auto-generated from PRs merged since last tag
  - Config update is immediate (commit separately or let it ride)
```

---

## Step 1: Pre-flight

Detect config directory:

```bash
if [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=".teamspace"
elif [ -f .teamwork/config.yml ]; then
  TEAMWORK_DIR=".teamwork"
else
  echo "ERROR: No config found. Run /team to initialize."
  exit 1
fi
```

Read required values:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "ERROR: Cannot detect repo. Run: gh auth login"
  exit 1
fi

VERSION=$(bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null)
if [ -z "$VERSION" ]; then
  echo "ERROR: versions.current not set in $TEAMWORK_DIR/config.yml"
  echo "  Add: versions:"
  echo "         current: \"V0.1\""
  exit 1
fi

SPEC_PATH=$(bash ~/.claude/commands/scripts/tw-config.sh versions.spec_path "" 2>/dev/null)
BASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.base_branch "main" 2>/dev/null)
BASE_BRANCH="${BASE_BRANCH:-main}"
```

Output:
```
/team-release
Repo:     {REPO}
Version:  {VERSION}
Branch:   {BASE_BRANCH}
Spec:     {SPEC_PATH if set, else "(none — AI audit will be skipped)"}
```

---

## Step 2: Milestone Check

```bash
MILESTONE_DATA=$(gh api repos/{REPO}/milestones \
  --jq ".[] | select(.title == \"$VERSION\")" 2>/dev/null)
```

**If milestone found:**

```bash
MILESTONE_ID=$(echo "$MILESTONE_DATA" | jq -r '.number')
OPEN_COUNT=$(echo "$MILESTONE_DATA" | jq -r '.open_issues')
CLOSED_COUNT=$(echo "$MILESTONE_DATA" | jq -r '.closed_issues')
TOTAL=$((OPEN_COUNT + CLOSED_COUNT))
```

- If `OPEN_COUNT == 0` → output `✅ Milestone complete: {VERSION} — {CLOSED_COUNT}/{TOTAL} issues closed`
- If `OPEN_COUNT > 0` → list open issues:

  ```bash
  gh issue list --milestone "{VERSION}" --state open --json number,title \
    --jq '.[] | "  #\(.number) \(.title)"'
  ```

  Output warning: `⚠️  {OPEN_COUNT} issues still open in milestone {VERSION}:` followed by list.

**If milestone NOT found:**

Output: `ℹ️  No milestone "{VERSION}" found on GitHub. Release will proceed without closing a milestone.`

Set `MILESTONE_ID=""`.

---

## Step 3: AI Audit (conditional)

**If `SPEC_PATH` is empty or file does not exist:**

Output: `(AI audit skipped — no versions.spec_path configured)`

Skip to Step 4.

**If `SPEC_PATH` is set and file exists:**

Read the spec:
```bash
cat {SPEC_PATH}
```

Fetch merged PRs for this milestone:
```bash
gh pr list --state merged --search "milestone:{VERSION}" \
  --json number,title,body --limit 100
```

Fetch closed Issues for this milestone:
```bash
gh issue list --milestone "{VERSION}" --state closed \
  --json number,title,body --limit 100
```

For each **Success Criterion** in the spec, assess:
- ✅ **Covered** — at least one PR/Issue explicitly addresses it
- ⚠️ **Partial** — related work exists but criterion may be incomplete
- ❌ **Not found** — no PR or Issue clearly covers this criterion

Output the audit as a table:

```
AI AUDIT — {VERSION} vs {SPEC_PATH}
══════════════════════════════════════
✅ Criterion 1 — covered by PR #12, #15
⚠️  Criterion 2 — partial: Issue #8 addressed core but edge case unclear
❌ Criterion 3 — no PR found. Was this descoped?
══════════════════════════════════════
Covered: X/N criteria
```

Note: This is an AI assessment, not a guarantee. Review the linked PRs before confirming.

---

## Step 4: Confirmation

Show release summary:

```
════════════════════════════════════════
RELEASE SUMMARY — {VERSION}
════════════════════════════════════════
Repo:       {REPO}
Tag:        {VERSION}  (exact match to versions.current)
Branch:     {BASE_BRANCH}

Milestone:  {OPEN_COUNT} open / {CLOSED_COUNT} closed
{AI audit results if ran, else "(audit skipped)"}

This will:
  1. git tag {VERSION} → push to origin
  2. gh release create {VERSION} --generate-notes
  3. Close GitHub Milestone "{VERSION}"
  4. Prompt for next version → create Milestone → update config
════════════════════════════════════════
```

Ask user:

```
Proceed with release?
Options: Proceed / Abort
```

**If Abort → STOP.** Output: `Release aborted. No changes made.`

**If Proceed → continue.**

---

## Step 5: Git Tag

Ensure on base branch and up to date:

```bash
git checkout {BASE_BRANCH}
git pull origin {BASE_BRANCH}
```

Create and push tag:

```bash
git tag {VERSION}
git push origin {VERSION}
```

Verify tag pushed:

```bash
git ls-remote --tags origin | grep {VERSION}
```

If verification fails → output error and STOP. Do not continue to release creation.

Output: `✅ Tag {VERSION} pushed`

---

## Step 6: GitHub Release

```bash
gh release create {VERSION} \
  --generate-notes \
  --title "{VERSION}" \
  --repo {REPO}
```

Capture and output the release URL.

Output: `✅ GitHub Release created: {release_url}`

If command fails → output error details. The tag exists — user can create the release manually via GitHub UI or re-run `gh release create`.

---

## Step 7: Close Milestone

If `MILESTONE_ID` is set:

```bash
gh api repos/{REPO}/milestones/{MILESTONE_ID} \
  --method PATCH \
  --field state=closed
```

Verify:

```bash
gh api repos/{REPO}/milestones/{MILESTONE_ID} --jq '.state'
# Expected: "closed"
```

Output: `✅ Milestone "{VERSION}" closed`

If `MILESTONE_ID` is empty → output: `(No milestone to close — skipped)`

---

## Step 8: Next Version

Ask user: `What is the next version? (e.g. V0.2 — leave blank to skip)`

**If blank → skip Steps 9 and 10.** Output: `(Skipped next version setup)`

**If provided (NEXT_VERSION):**

Validate: NEXT_VERSION must not equal VERSION. If same → warn and ask again.

---

## Step 9: Create Next Milestone

```bash
gh api repos/{REPO}/milestones \
  --method POST \
  --field title="{NEXT_VERSION}"
```

Output: `✅ Milestone "{NEXT_VERSION}" created`

If creation fails (e.g. milestone already exists) → warn but continue.

---

## Step 10: Update Config

Update `versions.current` in config:

```bash
# macOS/BSD sed
sed -i '' "s/current: \"$VERSION\"/current: \"$NEXT_VERSION\"/" $TEAMWORK_DIR/config.yml

# Linux fallback (try if above fails)
# sed -i "s/current: \"$VERSION\"/current: \"$NEXT_VERSION\"/" $TEAMWORK_DIR/config.yml
```

Verify:

```bash
bash ~/.claude/commands/scripts/tw-config.sh versions.current "" 2>/dev/null
# Expected: NEXT_VERSION
```

If update succeeds → stage and commit:

```bash
git add $TEAMWORK_DIR/config.yml
git commit -m "chore(teamwork): bump version to $NEXT_VERSION after releasing $VERSION"
git push origin {BASE_BRANCH}
```

Output: `✅ Config updated: versions.current = {NEXT_VERSION}`

---

## Step 11: Summary

```
RELEASE COMPLETE ✅
════════════════════════════════════════
Released:     {VERSION}
Release URL:  {release_url}
Tag:          pushed to origin
Milestone:    "{VERSION}" closed
════════════════════════════════════════
Next version: {NEXT_VERSION}
  - Milestone "{NEXT_VERSION}" created on GitHub
  - Config updated: versions.current = {NEXT_VERSION}

Next: /team-issue to create missions for {NEXT_VERSION}
      /team to view the dashboard
════════════════════════════════════════
```
