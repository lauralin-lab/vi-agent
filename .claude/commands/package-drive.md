---
description: "Create or improve experience packages. Try: /package-drive help"
version: "1.0.0"
---

# /package-drive — Experience Package Workshop

> For product managers, marketers, and designers. Create or improve VI Agent experience packages — no coding required.

**User input**: $ARGUMENTS

If `$ARGUMENTS` is `help` or `-h`, output the following and **STOP**:

```
/package-drive — Create or improve experience packages

USAGE:
  /package-drive                     Start a new package from scratch
  /package-drive improve {id}        Improve an existing package
  /package-drive test {id}           Test a package and iterate

WHAT IS AN EXPERIENCE PACKAGE?
  A package = everything needed for one AI capability.
  It can be simple (add a skill) or transformative (turn the app into a scanner).

  Examples:
  • "Movie Poster Creator" — user takes a photo → AI makes a movie poster
  • "Document Scanner" — app becomes a scanner with guides and "Scan" button
  • "Calorie Calculator" — app tracks daily intake with running totals

  A package has:
  • SKILL.md — the skill prompt (what the AI does, in plain English)
  • manifest.json — metadata (name, triggers, templates, app mode)
  • templates/ — how results look (card layouts)
  • examples/ — saved test runs showing input → output

  At runtime, SKILL.md gets auto-deployed to .claude/skills/{id}/SKILL.md
  where the Claude Code agent discovers it as a native skill.

WHERE TO FIND THINGS:
  • Packages live in:      packages/{package-id}/
  • SKILL.md lives in:     packages/{package-id}/SKILL.md
  • Shared templates:      packages/_shared/
  • Dashboard Skills tab:  shows all SKILL.md content (Shared + From Package)

NO CODING NEEDED:
  You write what the AI should do in plain English (SKILL.md).
  I handle the technical parts (manifest, templates, file structure).
```

---

## Step 0: Git Workflow Gate

All package changes go through the team's GitHub Issue workflow. Before any work, check if the user has an active mission branch.

```bash
# Check if teamwork is initialized
if [ -f .teamwork/config.yml ] || [ -f .teamspace/config.yml ]; then
  TEAMWORK_DIR=$([ -f .teamwork/config.yml ] && echo ".teamwork" || echo ".teamspace")
  echo "TEAMWORK_OK"
else
  echo "NO_TEAMWORK"
fi
```

```bash
# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "$CURRENT_BRANCH"
```

```bash
# Check for active mission contract
ls .teamwork/active/MISSION-*.md 2>/dev/null || ls .teamspace/active/MISSION-*.md 2>/dev/null || echo "NO_CONTRACT"
```

**If NO_TEAMWORK** → Tell the user: "Let me set things up for you first." Run `/team` to initialize. Then continue.

**If on `main` or `pre-launch` (no mission branch):**

Use `AskUserQuestion`:

```
question: "Before we start, your changes need to go through the team workflow — this keeps everything tracked and reviewable. I'll handle the technical parts. What would you like to do?"
options:
  - label: "Create a new package — set up everything for me"
    description: "I'll create a GitHub Issue, set up a branch, and we'll start building. You just describe what you want."
  - label: "Improve an existing package — set up everything for me"
    description: "I'll create an Issue for the improvement, set up a branch, and we'll edit together."
  - label: "Just test an existing package (no changes)"
    description: "I only want to test — no Issue or branch needed for read-only testing."
  - label: "I already have an Issue assigned to me"
    description: "I've been assigned an Issue — let me give you the number."
```

**If user picks "set up everything for me" (create or improve):**

1. Ask what they want to do (brief description in their own words)
2. Create a GitHub Issue for them automatically:
   ```bash
   # Compose the Issue title and body from user's description
   gh issue create --title "pkg: {short-title}" \
     --label "mission" \
     --body "## Objective
   {user's description}

   ## Acceptance Criteria
   - [ ] Package files created/updated in packages/{id}/
   - [ ] SKILL.md reviewed and tested
   - [ ] manifest.json valid with correct triggers and templates
   - [ ] At least one example test case added"
   ```
3. Claim the Issue for them: run the equivalent of `/team-claim #{issue-number}`
4. Tell the user: "All set! I created Issue #{N} and set up your branch. Let's build your package."

**If user picks "I already have an Issue":**
- Ask for the Issue number
- Run `/team-claim #{number}` if not already claimed

**If user picks "Just test":**
- Skip git workflow, go directly to TEST mode (Step 3)

**After the git gate is resolved, proceed to the appropriate mode.**

---

## Step 0b: Understand What We're Doing

Read the user's input. Determine the mode:

- **No arguments / natural language description** → CREATE mode (new package)
- **`improve {id}`** → IMPROVE mode (edit existing package)
- **`test {id}`** → TEST mode (run and iterate)

---

## Step 1: CREATE Mode — New Package from Scratch

### 1.1 Gather the Idea

Use `AskUserQuestion` to understand what the user wants:

```
question: "What should this AI skill do? Describe it like you're explaining to a friend."
options:
  - label: "Photo → Analysis"
    description: "User takes a photo, AI analyzes it and shows results (e.g., identify plants, rate outfits, check nutrition)"
  - label: "Photo → Creative"
    description: "User takes a photo, AI transforms it into something creative (e.g., movie poster, comic strip, meme)"
  - label: "Chat → Action"
    description: "User asks a question, AI researches and acts (e.g., find restaurants, plan trips, compare products)"
  - label: "I'll describe it"
    description: "I have a specific idea — let me explain"
```

### 1.2 Define the App Experience

Based on the user's description, first determine if this package transforms the app or just adds a skill:

Use `AskUserQuestion`:

```
question: "How much should this change the app when active? [restate the idea in 1 sentence]"
options:
  - label: "Just add a skill"
    description: "The app looks the same — user takes a photo or chats, AI responds with result cards. Most packages work this way."
  - label: "Transform into a scanner"
    description: "Change the camera to scan mode with frame guides, replace the capture button with 'Scan', show extracted content as the main result."
  - label: "Transform into a tracker/diary"
    description: "Add a running total or dashboard widget (e.g., daily calories, expense total), keep a persistent summary visible."
  - label: "I'll describe the experience"
    description: "I have a specific vision for how the app should look and behave"
```

If user picks a transformation mode, generate an `app_mode` section in manifest.json:
- **Scanner**: `camera.overlay: "scan-frame"`, `camera.resolution: "high"`, `shutter.label: "Scan"`
- **Tracker/diary**: `persistent_widget` with summary template, `layout: "dashboard"`
- **Custom**: Ask follow-up questions about camera, buttons, layout

Then ask about card output:

```
question: "What cards should the user see after using this skill?"
options:
  - label: "Thinking → Result"
    description: "Show a thinking animation, then the final result card. Simple and clean."
  - label: "Step-by-step"
    description: "Show progress through multiple steps, each with its own card. Good for complex analysis."
  - label: "Image + Details"
    description: "Hero image card at the top, then detail cards below. Good for visual results."
  - label: "Let me customize"
    description: "I want to pick specific card templates from the catalog"
```

If user wants to customize, show them available templates:

```bash
ls packages/_shared/
```

Read a few template JSON files to show what each looks like, and let the user pick.

### 1.3 Pick a Package ID

Use `AskUserQuestion`:

```
question: "What should we call this package? (This becomes the folder name — lowercase, hyphens, no spaces)"
options:
  - label: "{suggested-id-1}"
    description: "Based on your description"
  - label: "{suggested-id-2}"
    description: "Alternative name"
  - label: "{suggested-id-3}"
    description: "Shorter version"
  - label: "I'll type my own"
    description: "I have a name in mind"
```

### 1.4 Generate the Package

Now generate all files. Explain each one as you create it:

**Tell the user:**
```
Creating your package: {name}

I'll create these files:
  📄 packages/{id}/manifest.json  — package metadata & config
  📝 packages/{id}/SKILL.md       — the skill prompt (what the AI does — you can edit this!)
  📁 packages/{id}/examples/      — we'll add test examples next

At runtime, SKILL.md auto-deploys to .claude/skills/{id}/SKILL.md
so the agent discovers it as a native skill.
```

**Create manifest.json** in `packages/{id}/manifest.json`:
- Use the user's description for `name` and `description`
- Pick an appropriate emoji for `icon`
- Set `category` (health, creative, lifestyle, productivity, general)
- Define `trigger.voice_keywords` from the user's description
- Set `skill.model` to `claude-sonnet-4-6` (default)
- Pick appropriate `templates.shared` from `packages/_shared/`
- Estimate `output.estimated_time` and `output.estimated_cost`

**Create SKILL.md** in `packages/{id}/SKILL.md`:
- Write in plain English — this IS the skill
- Structure: what to analyze → how to think → what cards to output → how to present results
- Reference the card templates by name
- Keep it under 50 lines — concise instructions, not a novel
- Use existing packages as style reference: `packages/nutrition-analyzer/SKILL.md`

**Create examples directory** `packages/{id}/examples/`

### 1.5 Review Together

Show the user what was created:

```
✅ Package created: {name}

Here's your SKILL.md (this is what the AI will do):
──────────────────────────────────────
{content of SKILL.md}
──────────────────────────────────────

And here's the manifest.json summary:
  Name:      {name}
  Triggers:  {voice_keywords}
  Templates: {template list}
  Model:     {model}
  Est. cost: {cost}
```

Use `AskUserQuestion`:

```
question: "How does this look?"
options:
  - label: "Looks great — let's test it!"
    description: "Move on to testing with a real photo or prompt"
  - label: "Edit the skill prompt"
    description: "I want to change what the AI does — let's refine SKILL.md"
  - label: "Change the templates"
    description: "I want different card layouts for the output"
  - label: "Start over"
    description: "This isn't what I had in mind — let's try again"
```

If user wants to edit → show SKILL.md, let them describe changes in plain English, you rewrite it. Repeat until satisfied.

### 1.6 Test the Package

**Tell the user:**
```
To test your package:

  1. Open the dashboard: http://localhost:3001
  2. Go to the Chat tab
  3. Type a prompt that would trigger your skill
     Example: "{suggested test prompt}"
  4. Watch the cards stream in real-time

Or, I can run a quick test right here. Want me to?
```

Use `AskUserQuestion`:

```
question: "How would you like to test?"
options:
  - label: "Test in dashboard"
    description: "I'll open the dashboard and try it there (recommended — you see the real card UI)"
  - label: "Describe a test scenario"
    description: "I'll describe a test case and you tell me what the AI would do"
  - label: "Skip testing for now"
    description: "I'll test later — just save what we have"
  - label: "Add example test cases"
    description: "Let me define some example inputs and expected outputs"
```

If adding examples → create JSON files in `packages/{id}/examples/`:
```json
{
  "name": "descriptive-name",
  "prompt": "user's test prompt",
  "mediaUrls": ["url-or-path-to-test-image"],
  "expectedCards": ["thinking-process", "result-card"],
  "notes": "what the ideal output looks like"
}
```

### 1.7 Save Test Runs as Examples

After testing in the dashboard, guide the user to save good test runs:

```
To build your package gallery with real examples:

  1. Open dashboard → test your package with different inputs
  2. When you get a result you like, click "Save as Example"
  3. The dashboard saves the input photo + card output as an example
  4. Examples appear in the package gallery for everyone to see

Each saved example becomes:
  📸 The input (photo/prompt) → what the user sent
  🖼️ The output (card screenshots) → what the AI produced
  ⭐ A gallery entry → shows up in the package detail page
```

Use `AskUserQuestion`:

```
question: "Would you like to test and save some examples now?"
options:
  - label: "Yes — let's test in the dashboard"
    description: "I'll guide you through testing and saving good examples"
  - label: "I'll do that later"
    description: "Move on to shipping — I'll add examples next time"
  - label: "How does 'Save as Example' work?"
    description: "Explain the dashboard save feature in more detail"
  - label: "Add example test cases manually"
    description: "I want to define example inputs as JSON files (for automated testing)"
```

If user tests and saves examples via dashboard, those are automatically stored in `packages/{id}/examples/` with input + output snapshots.

### 1.8 Wrap Up and Ship

```
✅ Package ready: {name}

Files created:
  📄 packages/{id}/manifest.json    — package config
  📝 packages/{id}/SKILL.md         — the skill prompt
  📁 packages/{id}/templates/       — card templates (if any)
  📁 packages/{id}/examples/        — test examples (if any)
```

Use `AskUserQuestion`:

```
question: "Your package is ready! What's next?"
options:
  - label: "Ship it — create PR for review"
    description: "I'll commit your files and create a pull request. A teammate will review before it goes live."
  - label: "Test more first"
    description: "Go back to testing — I want to refine the skill prompt more"
  - label: "Save for later"
    description: "Commit what we have — I'll come back to finish with /package-drive improve {id}"
  - label: "Improve the skill prompt"
    description: "The package structure is fine but I want to tweak what the AI does"
```

**If "Ship it":**

Commit the package files and use the team ship workflow:

```bash
# Stage package files
git add packages/{id}/

# Commit
git commit -m "pkg({id}): create {name} experience package

Adds SKILL.md, manifest.json, templates, and examples.
Mission: #{issue}"
```

Then tell the user:
```
Files committed. To create a pull request, run:
  /team-ship

A teammate will review your package, then it goes live!
```

**If "Save for later":**

```bash
git add packages/{id}/ packages/{id}/
git commit -m "pkg({id}): work in progress — {name}

Mission: #{issue}"
```

Tell the user:
```
Saved! When you're ready to continue:
  /package-drive improve {id}    — to keep editing
  /package-drive test {id}       — to test
  /team-ship                     — to ship when done
```

---

## Step 2: IMPROVE Mode — Edit Existing Package

### 2.1 Load the Package

```bash
ls packages/{id}/
```

Read `packages/{id}/manifest.json` and `packages/{id}/SKILL.md`.

**Show the user what exists:**
```
📦 Package: {name} (v{version})
   {description}

   SKILL.md preview:
   ──────────────────────────────────────
   {first 20 lines of SKILL.md}
   ──────────────────────────────────────

   Templates: {list}
   Triggers:  {voice_keywords}
   Model:     {model}
```

### 2.2 What to Improve?

Use `AskUserQuestion`:

```
question: "What would you like to improve?"
options:
  - label: "Change what the AI does"
    description: "Edit the skill prompt (SKILL.md) — make it smarter, more detailed, or different"
  - label: "Change how results look"
    description: "Switch templates, add more cards, change the output sequence"
  - label: "Change triggers"
    description: "Update voice keywords or visual cues that activate this skill"
  - label: "Fix a problem"
    description: "Something isn't working right — let me describe the issue"
```

### 2.3 Apply Changes

Based on user's choice, edit the relevant files. After each change:

- Show the diff ("Here's what I changed")
- Ask if it looks right
- Suggest testing

### 2.4 Iterate

Loop back to 2.2 until the user is satisfied.

### 2.5 Wrap Up

Same as CREATE mode 1.7-1.8 — offer asset upload, then ship/save options with commit and `/team-ship`.

---

## Step 3: TEST Mode — Run and Iterate

### 3.1 Load and Show

Same as IMPROVE 2.1 — load and display the package.

### 3.2 Guide Testing

**Tell the user:**
```
Let's test "{name}".

DASHBOARD TESTING (recommended):
  1. Open http://localhost:3001
  2. Go to Chat tab
  3. Type: "{suggested prompt based on triggers}"
  4. Watch the cards stream in

Tell me what you see — I'll help fix any issues.
```

Use `AskUserQuestion`:

```
question: "What happened when you tested?"
options:
  - label: "It worked great!"
    description: "The output was good — I'm happy with it"
  - label: "Output was wrong"
    description: "The AI said the wrong thing or misunderstood the task"
  - label: "Cards looked wrong"
    description: "The layout or formatting was off"
  - label: "It didn't trigger"
    description: "The skill didn't activate — it used the generic assistant instead"
```

### 3.3 Fix Based on Feedback

- **Output was wrong** → Edit SKILL.md to be more specific about what the AI should do
- **Cards looked wrong** → Check template references in SKILL.md and manifest.json
- **Didn't trigger** → Update `trigger.voice_keywords` in manifest.json, check if the skill slug matches

After each fix, tell the user to test again. Loop until satisfied.

---

## Principles for Non-Programmers

Throughout the entire flow, follow these rules:

1. **No jargon.** Say "what the AI does" not "system prompt." Say "card layout" not "template schema." Say "trigger words" not "voice_keywords array."

2. **Show, don't tell.** When describing a template, show what it looks like. When creating a skill, show the plain English prompt, not the file structure.

3. **One question at a time.** Don't overwhelm with options. Each AskUserQuestion should be one clear decision.

4. **Always explain WHERE things are.** After creating files, tell the user the exact path and what each file does. They should be able to find and edit things later.

5. **Celebrate progress.** Use clear checkmarks and summaries at each step. The user should always know where they are in the process.

6. **Default to simple.** If the user doesn't have a preference, pick the simplest option. Two-card flow (thinking → result) covers 80% of use cases.

7. **SKILL.md is king.** The skill prompt is what matters most. Spend time getting it right. Everything else is packaging.

---

## Drive Integration

This skill uses the `/drive` execution engine for implementation work. When creating or editing package files, follow Drive Mode's discipline:

- **Verify after changes:** Check that manifest.json is valid JSON, SKILL.md is well-formatted
- **Self-review:** Re-read created files before presenting to user
- **Don't stop:** After each user answer, immediately proceed to the next step
- **AskUserQuestion always:** Never output questions as plain text — always use the AskUserQuestion tool

But unlike `/team-drive`, there is NO Mission Contract, NO GitHub Issue, NO branch management. This is a lightweight creative workshop, not a code mission.
