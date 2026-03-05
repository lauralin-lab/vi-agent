---
description: "Review submitted MCs (Leader only). Try: /review-mc help"
version: "3.0.0"
---

# /review-mc -- Leader Reviews Mission Contract

> Leader reviews submitted MCs: view queue, review code, approve or request changes.

**User input**: $ARGUMENTS

**Argument routing:**

| Input | Action |
|-------|--------|
| `#{N}` or `N` | Review specific MC |
| (empty) | Show review queue |
| `approve #{N}` | Approve and merge MC |
| `changes #{N}` | Request changes on MC |
| `help` or `-h` | Show usage guide |

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/review-mc -- Review submitted Mission Contracts (Leader only)

USAGE:
  /review-mc              Show review queue (MCs awaiting review)
  /review-mc #42          Review specific MC (view diff + AI analysis)
  /review-mc approve #42  Approve and merge
  /review-mc changes #42  Request changes (sends feedback to assignee)

REVIEW FLOW:
  1. Member runs /complete-mc -> PR created, leader notified
  2. Leader runs /review-mc -> sees queue
  3. Leader runs /review-mc #42 -> views diff, AI review
  4. Leader runs /review-mc approve #42 -> merge + close
     or /review-mc changes #42 -> feedback + back to wip

LEADER ONLY: Members cannot review MCs.

SEE ALSO:
  /complete-mc    (Member) Submit completed MC
  /create-mc      Create new MC
  /team           Team dashboard
```

---

## Step 0: Prerequisites + Permission Check

```bash
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
if [ -z "$GH_USER" ]; then
  echo "ERROR: Not authenticated. Run 'gh auth login' first."
  # STOP
fi
```

```bash
if [ ! -f .teamwork/config.yml ]; then
  echo "ERROR: No teamwork config. Run /team init first."
  # STOP
fi
```

### Permission Check (Leader only)

Read `.teamwork/config.yml`. Find the current user's member entry by matching `github: {GH_USER}`. Get their `role` field. Look up that role in the `roles:` list and check `level`.

If user's role level is NOT `leader`:
- Output: "Only leaders can review missions. Ask your leader."
- **STOP**

Read config values:

```bash
MISSION_LABEL=$(bash ~/.claude/commands/scripts/tw-config.sh labels.mission "mission" 2>/dev/null)
STATUS_PREFIX=$(bash ~/.claude/commands/scripts/tw-config.sh labels.status_prefix "status:" 2>/dev/null)
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
```

---

## Route by Argument

Parse `$ARGUMENTS`:
- If `help` or `-h` -> output help (above) and **STOP**
- If starts with `approve` -> extract Issue number, jump to **Operation Approve**
- If starts with `changes` -> extract Issue number, jump to **Operation Changes**
- If `#{N}` or number -> jump to **Operation Review Specific**
- If empty -> jump to **Operation Review Queue**

---

## Operation Review Queue

> Shows all MCs with status:review, awaiting leader review.

### Fetch review-status MCs

```bash
gh issue list --label "$MISSION_LABEL" --label "${STATUS_PREFIX}review" \
  --state open --json number,title,assignees,labels --limit 20
```

### Find associated PRs

For each review-status Issue, find the associated PR:

```bash
gh pr list --search "Closes #{issue}" --state open \
  --json number,url,statusCheckRollup,headRefName --limit 1
```

### Display queue

```
REVIEW QUEUE -- {repo name}
=============================================

#{N} {title}
    Assignee:  @{assignee}
    PR:        #{pr} -- {CI status: passing/failing/pending}

#{N} {title}
    Assignee:  @{assignee}
    PR:        #{pr} -- {CI status}

=============================================
{total} MCs awaiting review

Review:  /review-mc #{N}
Approve: /review-mc approve #{N}
Changes: /review-mc changes #{N}
```

If no MCs in review status:
- "No MCs awaiting review. All clear." -> **STOP**

---

## Operation Review Specific

> Fetch MC details, PR diff, and run AI review.

### R1: Fetch Issue details

```bash
ISSUE_DATA=$(gh issue view {issue} --json number,title,body,assignees,labels,milestone,url)
```

Verify the Issue has the `${STATUS_PREFIX}review` label. If not:
- Warn: "MC #{issue} is not in review status (current: {status}). Reviewing anyway."

### R2: Find PR

```bash
gh pr list --search "Closes #{issue}" --state open \
  --json number,url,headRefName,statusCheckRollup --limit 1
```

If no open PR found:
- "No open PR found for MC #{issue}. The member may need to run `/complete-mc` first." -> **STOP**

### R3: Get PR diff

```bash
gh pr diff {pr}
```

### R4: Read changed files

For each file in the diff, read the full current content to understand context beyond just the diff hunks. Use `Read` tool to view changed files.

### R5: AI Review

Analyze the changes for:

- **Correctness**: Logic errors, missing edge cases, off-by-one errors
- **Security**: Injection vulnerabilities, exposed secrets, unsafe operations
- **Architecture**: Coupling, separation of concerns, pattern consistency
- **Quality**: Naming, readability, dead code, duplication
- **Performance**: N+1 queries, unnecessary allocations, missing indexes

### R6: Display review summary

```
REVIEW: #{issue} -- {title}
=============================================
Assignee:  @{assignee}
PR:        #{pr} -- {url}
CI:        {passing/failing/pending}
Milestone: {milestone or "none"}

Changes:
  {summary of files changed and what changed}

Review:
  Correctness:  {assessment}
  Security:     {assessment}
  Architecture: {assessment}
  Quality:      {assessment}

{Overall recommendation: Approve / Request Changes / Needs Discussion}

=============================================
```

### R7: Choose review action

Use `AskUserQuestion`:
```
question: "What review action?"
options:
  - label: "Approve"
    description: "Changes look good -- approve the PR and merge"
  - label: "Request changes"
    description: "Issues found -- send feedback to assignee"
  - label: "Comment only"
    description: "Leave feedback without approval decision"
  - label: "Skip"
    description: "Exit without taking action"
```

If **Approve** -> jump to **Operation Approve** with this Issue number.
If **Request changes** -> ask for feedback, jump to **Operation Changes**.
If **Comment only** -> publish comment on PR, **STOP**.
If **Skip** -> **STOP**.

---

## Operation Approve

> Approve PR, merge, update labels, notify assignee.

### A1: Fetch Issue and PR

```bash
ISSUE_DATA=$(gh issue view {issue} --json number,title,assignees,labels,url)
```

Find associated PR:

```bash
PR_DATA=$(gh pr list --search "Closes #{issue}" --state open \
  --json number,url,headRefName --limit 1)
PR_NUMBER=$(echo "$PR_DATA" | jq -r '.[0].number')
PR_URL=$(echo "$PR_DATA" | jq -r '.[0].url')
```

If no open PR -> "No open PR found for MC #{issue}." -> **STOP**

### A2: Approve PR

```bash
gh pr review "$PR_NUMBER" --approve --body "Reviewed and approved. LGTM."
```

### A3: Merge PR

```bash
gh pr merge "$PR_NUMBER" --squash --delete-branch
```

If merge fails (CI not passing, conflicts):
- "Merge failed. Check PR for details: {pr-url}"
- Do NOT stop -- the approval is still recorded. Assignee can fix and re-push.

### A4: Labels update

Labels are auto-updated by the post-merge GitHub Action (review -> done). As fallback:

```bash
bash ~/.claude/commands/scripts/tw-label.sh transition {issue} review done
```

Non-fatal if this fails.

### A5: Notify assignee

```bash
ASSIGNEE=$(echo "$ISSUE_DATA" | jq -r '.assignees[0].login // empty')

bash ~/.claude/commands/scripts/tw-notify.sh review.approved \
  --issue "$ISSUE_NUMBER" --assignee "$ASSIGNEE"
```

Non-fatal: if notification fails, warn but continue.

### A6: Output

```
MC APPROVED
=============================================
Issue:   #{N} -- {title}
PR:      {pr-url} -- merged
Status:  done
Assignee @{assignee} notified

Notification sent to: {channels}
=============================================
Next: /review-mc to check remaining queue
      /team for dashboard
```

---

## Operation Changes

> Request changes on PR, revert labels, notify assignee.

### C1: Get feedback

If feedback not already provided in arguments, use `AskUserQuestion`:
```
question: "What changes are needed?"
```

The user provides feedback text.

### C2: Fetch Issue and PR

```bash
ISSUE_DATA=$(gh issue view {issue} --json number,title,assignees,labels,url)
PR_DATA=$(gh pr list --search "Closes #{issue}" --state open \
  --json number,url --limit 1)
PR_NUMBER=$(echo "$PR_DATA" | jq -r '.[0].number')
```

If no open PR -> "No open PR found for MC #{issue}." -> **STOP**

### C3: Request changes on PR

```bash
gh pr review "$PR_NUMBER" --request-changes --body "{feedback}"
```

### C4: Update labels

Move back to wip so the assignee knows to rework:

```bash
bash ~/.claude/commands/scripts/tw-label.sh transition {issue} review wip
```

Non-fatal if this fails.

### C5: Notify assignee

```bash
ASSIGNEE=$(echo "$ISSUE_DATA" | jq -r '.assignees[0].login // empty')

bash ~/.claude/commands/scripts/tw-notify.sh review.changes_requested \
  --issue "$ISSUE_NUMBER" --assignee "$ASSIGNEE" --feedback "$FEEDBACK"
```

Non-fatal: if notification fails, warn but continue.

### C6: Output

```
CHANGES REQUESTED
=============================================
Issue:    #{N} -- {title}
PR:       #{pr-url}
Status:   wip (returned to assignee)
Feedback: {feedback summary}

Assignee @{assignee} notified.
=============================================
Next: Assignee fixes issues, re-runs /complete-mc
      /review-mc to check remaining queue
```

---

## Error Handling

- Not a leader -> "Only leaders can review missions." -> **STOP**
- No MCs in review -> "No MCs awaiting review. All clear." -> **STOP**
- Issue not found -> "Issue #{N} not found." -> **STOP**
- No PR found -> "No open PR for MC #{N}. Member should run /complete-mc." -> **STOP**
- Merge fails -> warn but continue (approval recorded)
- Label/notification failures -> warn but continue (non-fatal)
