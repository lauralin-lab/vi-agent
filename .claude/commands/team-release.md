---
description: "Release a version → git tag → GitHub Release → close Milestone. Try: /team-release help"
version: "2.7.0"
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
RELEASE_BRANCH=$(bash ~/.claude/commands/scripts/tw-config.sh conventions.release_branch "" 2>/dev/null)
RELEASE_BRANCH="${RELEASE_BRANCH:-$BASE_BRANCH}"
STAGING_WORKFLOW=$(bash ~/.claude/commands/scripts/tw-config.sh deploy.staging_workflow "" 2>/dev/null)
```

Determine branch mode:
- If `RELEASE_BRANCH == BASE_BRANCH` → **single-branch mode** (tag directly on base branch)
- If `RELEASE_BRANCH != BASE_BRANCH` → **dual-branch mode** (merge base→release before tagging)

Output:
```
/team-release
Repo:     {REPO}
Version:  {VERSION}
Base:     {BASE_BRANCH}
Release:  {RELEASE_BRANCH} {if same as BASE_BRANCH, show "(single-branch mode)"}
Staging:  {STAGING_WORKFLOW if set, else "(no staging check configured)"}
Spec:     {SPEC_PATH if set, else "(none — AI audit will be skipped)"}
```

---

## Step 2: Milestone Check

```bash
MILESTONE_DATA=$(gh api repos/$REPO/milestones \
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
  1. {If dual-branch:} Merge {BASE_BRANCH} → {RELEASE_BRANCH}
  2. {If STAGING_WORKFLOW:} Check staging deploy status
  3. git tag {VERSION} → push to origin
  4. gh release create {VERSION} --generate-notes
  5. Update CHANGELOG.md
  6. Close GitHub Milestone "{VERSION}"
  7. Prompt for next version → create Milestone → update config
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

## Step 4b: Staging Deploy Check (conditional)

**If `STAGING_WORKFLOW` is empty** → skip, output: `(Staging check skipped — no deploy.staging_workflow configured)`

**If `STAGING_WORKFLOW` is set:**

```bash
LATEST_RUN=$(gh run list --workflow "$STAGING_WORKFLOW" --branch "$RELEASE_BRANCH" --limit 1 \
  --json conclusion,displayTitle,createdAt 2>/dev/null)
```

- If no runs found → warn: `⚠ No staging deploy runs found for workflow '$STAGING_WORKFLOW' on branch '$RELEASE_BRANCH'. Proceed with caution.`
- If latest run conclusion is `"success"` → output: `✅ Staging deploy passed: {displayTitle} ({createdAt})`
- If latest run conclusion is NOT `"success"` → output warning:
  ```
  ⚠ Latest staging deploy did NOT succeed:
    Workflow: {STAGING_WORKFLOW}
    Status:   {conclusion}
    Title:    {displayTitle}
    Date:     {createdAt}

  Releasing without a passing staging deploy is risky.
  ```
  Ask user: "Proceed anyway?" / "Abort" — If abort → **STOP**

---

## Step 5: Merge Base → Release (conditional, dual-branch mode only)

**If `BASE_BRANCH == RELEASE_BRANCH`** → skip this step (single-branch mode)

**If `BASE_BRANCH != RELEASE_BRANCH`** (dual-branch mode):

```bash
bash ~/.claude/commands/scripts/tw-git.sh merge-to "$RELEASE_BRANCH"
```

- If exit 2 → merge conflict or push fail → `⛔ Merge conflict merging $BASE_BRANCH → $RELEASE_BRANCH. Resolve conflicts manually, then re-run /team-release.` → **STOP**
- Output: `✅ Merged $BASE_BRANCH → $RELEASE_BRANCH`

---

## Step 6: Git Tag

Ensure on release branch and up to date:

```bash
git checkout "$RELEASE_BRANCH" && git pull origin "$RELEASE_BRANCH"
```

Create and verify tag:

```bash
bash ~/.claude/commands/scripts/tw-git.sh tag "$VERSION"
```

If exit 2 → tag push verification failed → **STOP**. If tag already exists, script skips creation.

Output: `✅ Tag {VERSION} pushed`

---

## Step 7: GitHub Release

```bash
gh release create {VERSION} \
  --generate-notes \
  --title "{VERSION}" \
  --repo "$REPO"
```

Capture and output the release URL.

Output: `✅ GitHub Release created: {release_url}`

If command fails → output error details. The tag exists — user can create the release manually via GitHub UI or re-run `gh release create`.

---

## Step 7b: Append to CHANGELOG.md

Fetch the release body and prepend it to `CHANGELOG.md`:

```bash
RELEASE_BODY=$(gh release view "$VERSION" --json body --jq '.body' 2>/dev/null)
```

If `RELEASE_BODY` is non-empty and `CHANGELOG.md` exists (or should be created):

```bash
# Write release body to temp file to avoid shell injection into Python
echo "$RELEASE_BODY" > /tmp/release-body-$$.txt

if [ -f CHANGELOG.md ]; then
  # Insert new version entry after the title heading, before existing entries
  python3 - "$VERSION" /tmp/release-body-$$.txt CHANGELOG.md << 'PYEOF'
import sys
version = sys.argv[1]
with open(sys.argv[2]) as f:
    body = f.read()
with open(sys.argv[3]) as f:
    content = f.read()
entry = f"\n## {version}\n\n{body}\n"
lines = content.split('\n')
insert_at = 0
for i, line in enumerate(lines):
    if line.startswith('# ') and i == 0:
        insert_at = i + 1
        continue
    if line.startswith('## '):
        insert_at = i
        break
    if i > 5:
        insert_at = i
        break
lines.insert(insert_at, entry)
with open(sys.argv[3], 'w') as f:
    f.write('\n'.join(lines))
PYEOF
else
  printf "# Changelog\n\n## %s\n\n%s\n" "$VERSION" "$RELEASE_BODY" > CHANGELOG.md
fi

rm -f /tmp/release-body-$$.txt

git add CHANGELOG.md
git commit -m "docs: update CHANGELOG.md for $VERSION"
git push origin "$RELEASE_BRANCH"
```

Output: `✅ CHANGELOG.md updated with $VERSION release notes`

If any step fails → warn but continue (CHANGELOG is nice-to-have, not a blocker).

---

## Step 8: Close Milestone

If `MILESTONE_ID` is set:

```bash
gh api repos/$REPO/milestones/{MILESTONE_ID} \
  --method PATCH \
  --field state=closed
```

Verify:

```bash
gh api repos/$REPO/milestones/{MILESTONE_ID} --jq '.state'
# Expected: "closed"
```

Output: `✅ Milestone "{VERSION}" closed`

If `MILESTONE_ID` is empty → output: `(No milestone to close — skipped)`

---

## Step 9: Next Version

Ask user: `What is the next version? (e.g. V0.2 — leave blank to skip)`

**If blank → skip Steps 10 and 11.** Output: `(Skipped next version setup)`

**If provided (NEXT_VERSION):**

Validate: NEXT_VERSION must not equal VERSION. If same → warn and ask again.

---

## Step 10: Create Next Milestone

```bash
gh api repos/$REPO/milestones \
  --method POST \
  --field title="{NEXT_VERSION}"
```

Output: `✅ Milestone "{NEXT_VERSION}" created`

If creation fails (e.g. milestone already exists) → warn but continue.

---

## Step 11: Update Config

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

If update succeeds → stage and commit. Note: in dual-branch mode, we're on `$RELEASE_BRANCH` from Step 5, so switch back to `$BASE_BRANCH` first:

```bash
bash ~/.claude/commands/scripts/tw-git.sh ensure-base
bash ~/.claude/commands/scripts/tw-git.sh commit "chore(teamwork): bump version to $NEXT_VERSION after releasing $VERSION" $TEAMWORK_DIR/config.yml
bash ~/.claude/commands/scripts/tw-git.sh push "$BASE_BRANCH"
```

Output: `✅ Config updated: versions.current = {NEXT_VERSION}`

---

## Step 12: Summary

```
RELEASE COMPLETE ✅
════════════════════════════════════════
Released:     {VERSION}
Release URL:  {release_url}
Tag:          pushed to origin
{If dual-branch:} Merge: {BASE_BRANCH} → {RELEASE_BRANCH} ✅
{If STAGING_WORKFLOW:} Staging: passed ✅
CHANGELOG:    updated ✅
Milestone:    "{VERSION}" closed
════════════════════════════════════════
Next version: {NEXT_VERSION}
  - Milestone "{NEXT_VERSION}" created on GitHub
  - Config updated: versions.current = {NEXT_VERSION}

Next: /team-issue to create missions for {NEXT_VERSION}
      /team to view the dashboard
════════════════════════════════════════
```
