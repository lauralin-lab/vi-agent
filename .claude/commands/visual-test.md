# Visual Test Skill

> Take a screenshot of the running dev server, analyze it visually, fix any issues found, and verify the fix. Collapses the "write → user sees → describes bug → Claude fixes" loop into "write → Claude sees → Claude fixes."

**User input**: $ARGUMENTS

---

## Requirements

- Dev server accessible at a URL (default: `http://localhost:5173`)
- `npx playwright` available in the project (install with `npm install --save-dev @playwright/test && npx playwright install chromium`)

---

## Call Variants

```
/visual-test              # Default: localhost:5173, 1440×900 viewport
/visual-test mobile       # Mobile viewport: 390×844 (iPhone 14)
/visual-test full         # Full-page capture (all scrollable content)
/visual-test <url>        # Custom URL, e.g. /visual-test http://localhost:3000
/visual-test scroll       # Full-page scroll capture (alias for full)
```

---

## Protocol

### Step 1: Parse Arguments

Check `$ARGUMENTS`:
- Empty → URL = `http://localhost:5173`, viewport = `1440,900`
- `mobile` → URL = `http://localhost:5173`, viewport = `390,844`
- `full` or `scroll` → URL = `http://localhost:5173`, add `--full-page` flag
- Starts with `http` → use as URL, viewport = `1440,900`
- Other text → interpret contextually

### Step 2: Detect Dev Server

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:{PORT}
```

- If returns 200 or 304 → server is running, proceed
- If fails or returns error → start the dev server:
  ```bash
  cd {project-directory} && npm run dev > /tmp/dev-server.log 2>&1 &
  sleep 3
  ```
  Then verify it started. For non-npm projects, use the appropriate start command.

**Note**: The project directory for the current project is where `package.json` lives. Detect it by looking at the current working directory or checking for `package.json` up the directory tree.

### Step 3: Take Screenshot

Generate a timestamp: `TS=$(date +%s)`

```bash
# Default viewport
npx playwright screenshot {URL} /tmp/vt-${TS}.png --viewport-size=1440,900

# Mobile viewport
npx playwright screenshot {URL} /tmp/vt-${TS}.png --viewport-size=390,844

# Full page
npx playwright screenshot {URL} /tmp/vt-${TS}.png --full-page
```

Wait for the command to complete.

### Step 4: Analyze

Read the screenshot:

```
Read tool: /tmp/vt-{TS}.png
```

Claude Code's Read tool supports PNG images natively — no special setup needed.

**Visual inspection checklist:**
- Layout: Is content overflowing, clipped, or misaligned?
- Colors: Low contrast, wrong colors, missing backgrounds?
- Empty states: Any sections unexpectedly blank or missing content?
- Typography: Font size issues, text overflow, missing translations?
- Spacing: Padding/margin problems, elements too close or too far?
- Z-index: Any elements hidden behind others that shouldn't be?
- Responsive: At this viewport width, does everything fit correctly?
- Animations: Is the page captured at a good animation frame? (If animation in progress, wait and retake)

**If no issues found:**
- Report: "Visual check passed — no issues detected."
- Skip to Step 7.

**If issues found:**
- List them concisely (e.g., "nodes clustered to right edge", "hero text overflows at mobile width")
- Identify the likely CSS/code cause
- Proceed to Step 5.

### Step 5: Fix

Make the necessary code changes to resolve the identified visual issues.

- Apply the minimal fix — don't refactor, just fix the visual bug
- One fix at a time if multiple issues: fix the most critical first

### Step 6: Wait for HMR and Retake

```bash
sleep 1.5
TS2=$(date +%s)
npx playwright screenshot {URL} /tmp/vt-${TS2}.png {same-flags-as-before}
```

Read the new screenshot:

```
Read tool: /tmp/vt-{TS2}.png
```

### Step 7: Verify and Report

**If issues are resolved:**
```
✅ Visual check passed.

Issues found: {list}
Fixes applied: {list}
Before: /tmp/vt-{TS}.png
After:  /tmp/vt-{TS2}.png
```

**If issues persist after fix:**
- Try a different approach and repeat from Step 5
- Max 3 fix-verify cycles
- If still unresolved after 3 cycles, report the remaining issue and the attempted fixes

**If no issues were found in the first place:**
```
✅ Visual check passed — no issues detected.

Screenshot: /tmp/vt-{TS}.png
Viewport: {dimensions}
URL: {url}
```

---

## Integration with Drive Mode

Add visual verification as a standard task in UI-heavy Drive Mode missions:

```
Wave N (Implementation):
  [implementer] → Write component X

Wave N+1 (Visual Verify):
  [Team Lead] → /visual-test → analyze → fix if needed
```

The visual-test skill should run:
- After every component implementation wave in UI missions
- As part of the "Final Verification" phase before MISSION_COMPLETE in any frontend task
- Whenever you suspect a layout issue but can't confirm from code alone

---

## Troubleshooting

**"npx playwright not found"**
```bash
cd {project-dir} && npm install --save-dev @playwright/test && npx playwright install chromium
```

**Screenshot is blank or mostly white**
- Page may still be loading → add `--wait-for-selector "body"` or increase wait time
- Try: `sleep 2 && npx playwright screenshot ...`

**Server not starting**
- Check if another process has the port: `lsof -i :5173`
- Try the alternative port: `http://localhost:3000`, `http://localhost:4173` (Vite preview)

**Chromium not installed**
```bash
npx playwright install chromium
```
