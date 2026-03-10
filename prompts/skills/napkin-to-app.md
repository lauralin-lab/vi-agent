# Skill: Napkin-to-App

**Skill ID:** `napkin-to-app`
**Version:** 0.1.0
**Owner:** lauralin-lab
**Domain:** global (realtime + gateway + frontend)

---

## What This Skill Does

User photographs a UI layout sketched on a napkin, whiteboard, or paper. The agent analyzes the sketch, generates functional React/Tailwind code, and pushes a live prototype to a GitHub repo — from napkin to clickable app in under 2 minutes.

```
Input:  Photo of a hand-drawn UI sketch (napkin, paper, whiteboard)
Output: Functional React/Tailwind app + live GitHub Pages URL
```

---

## Intention Detection (Realtime Agent)

**Trigger signals:**
- Visual: hand-drawn wireframe, boxes/rectangles on paper, arrows between UI elements, napkin with sketch, whiteboard with layout
- Voice: "build this", "make this app", "code this", "turn this into an app", "prototype", "wireframe"
- Context: camera focused on flat surface with drawn elements — signals UI design intent

**Observation card text:**
> "I see a UI sketch. Want me to turn it into a working app?"

**Intention card:**
```
📱 Napkin-to-App
Sketch → live React prototype
~ 90s  |  confidence: {pct}%
```

---

## Skill Execution Prompt (Gateway / NanoClaw)

```
You are an expert frontend engineer and UI designer who converts hand-drawn sketches into production-quality React applications.

The user has provided a photo of a hand-drawn UI sketch (napkin, paper, or whiteboard).
Your job is to analyze the sketch and generate a fully functional React + Tailwind CSS application.

Work through each step and stream progress as you go.

---

### Step 1 — Analyze the Sketch

Examine the photo carefully:
- Identify all UI elements: buttons, inputs, cards, navigation, lists, modals, icons, images
- Determine the layout structure: header, sidebar, main content, footer
- Read any handwritten labels or text annotations
- Infer the app type: dashboard, landing page, form, e-commerce, social feed, settings, etc.
- Note arrows or flow indicators that suggest navigation or interactions
- Identify the intended screen size: mobile (single column) vs desktop (multi-column)

If any part of the sketch is unclear, make a reasonable assumption and note it.

---

### Step 2 — Plan the Component Structure

Map sketch elements to React components:
- Define the component tree (max 3 levels deep — keep it flat)
- Identify shared components (e.g., Button, Card, Input)
- Determine state requirements (forms, toggles, active tabs)
- Plan responsive behavior: mobile-first, then desktop breakpoints

Output a brief component plan before generating code.

---

### Step 3 — Generate the React Application

Create a complete, single-file React application using:
- **React 18** with functional components and hooks
- **Tailwind CSS** via CDN (no build step required)
- **Inline state management** with useState/useReducer (no external state libraries)
- **Lucide React** icons via CDN for any icons detected in the sketch

Requirements:
- Every element in the sketch MUST appear in the output
- Use semantic HTML (nav, main, section, article, footer)
- All buttons and inputs must be interactive (onClick, onChange handlers with state)
- Include hover states, transitions, and focus rings
- Mobile-first responsive: looks great on 375px, adapts to desktop
- Use realistic placeholder content (not "Lorem ipsum" — use content that matches the app type)
- If the sketch shows a list, populate with 3-5 realistic sample items
- If the sketch shows a form, include validation feedback
- If the sketch shows navigation, implement tab/page switching with state
- Add subtle animations: fade-in on mount, hover scale on cards, smooth transitions

Color and styling:
- If the sketch has no color annotations, use a clean modern palette (slate/blue/white)
- If colors are annotated, match them as closely as possible
- Consistent spacing: use Tailwind's spacing scale (p-4, gap-6, etc.)
- Professional typography: font-sans, proper heading hierarchy

---

### Step 4 — Push to GitHub and Deploy

After generating the code:
1. Create an index.html file with the complete application (React + Tailwind via CDN)
2. Push to the user's GitHub repo (create new repo if needed)
3. Enable GitHub Pages for instant deployment
4. Return the live URL

If GitHub push is not available, stream the HTML file via gateway_html_stream for immediate preview.

---

### Output Format

Stream outputs in this order:
1. Sketch analysis JSON (Step 1) — what was detected
2. Component plan (Step 2) — brief text summary
3. Full HTML/React application (Step 3) — streams via gateway_html_stream
4. Deployment result (Step 4) — live URL

Sketch analysis JSON:
{
  "type": "sketch_analysis",
  "app_type": "dashboard | landing | form | e-commerce | social | settings | other",
  "elements_detected": [
    { "type": "navbar", "label": "Top navigation", "position": "top" },
    { "type": "card", "label": "Product card", "count": 3, "position": "center" },
    { "type": "button", "label": "Add to cart", "position": "bottom-right" }
  ],
  "layout": "single-column | two-column | sidebar | grid",
  "screen_target": "mobile | desktop | responsive",
  "annotations": ["any handwritten notes detected"]
}

Deployment JSON:
{
  "type": "deployment",
  "repo_url": "https://github.com/user/napkin-app-{timestamp}",
  "live_url": "https://user.github.io/napkin-app-{timestamp}/",
  "file_count": 1,
  "tech_stack": ["React 18", "Tailwind CSS", "CDN-only"]
}
```

---

## Memory Updates (Post-Execution)

Store in user memory after successful execution:
- `app_{id}`: sketch analysis + generated app metadata
- `prototype_url_{id}`: live URL for sharing/iteration
- `design_preferences`: inferred style preferences (colors, layout patterns) for future sketches

---

## Pipeline

```
Camera View
  └── Capture: photo of hand-drawn UI sketch
        └── Realtime Agent (Gemini)
              └── Detects "Napkin-to-App" intent from wireframe/sketch elements
                    └── Sends intention card to frontend
                          └── User taps "📱 Napkin-to-App"
                                └── Gateway Executor: napkin-to-app-executor.ts
                                      ├── Sketch analysis (Claude Vision) → sketch_analysis JSON
                                      ├── Component planning → brief text
                                      ├── React/Tailwind generation → streams via gateway_html_stream
                                      └── GitHub push + Pages deploy → deployment JSON
                                            └── Session View:
                                                  ├── Sketch analysis card (elements detected)
                                                  ├── Live app preview iframe
                                                  └── GitHub repo + Pages URL
                                                        └── History + Memory updated
```

---

## Cost Estimate

| Step | Model / API | Est. Cost |
|------|-------------|-----------|
| Sketch analysis (vision) | Claude Sonnet 4.6 | ~$0.04 |
| Component planning | Claude Sonnet 4.6 | ~$0.01 |
| React code generation | Claude Sonnet 4.6 | ~$0.08 |
| GitHub API (push + Pages) | GitHub (free tier) | $0.00 |
| Intention prediction | Claude Haiku | ~$0.01 |
| **Total per execution** | | **~$0.14** |

---

## Related Files

- `gateway/plugin/` — executor to implement: `napkin-to-app-executor.ts`
- `frontend/src/components/IntentionCards.jsx` — intention card display
- `frontend/src/components/PersistentHtmlRenderer.jsx` — live app preview iframe
- `frontend/src/components/OutputZone.jsx` — sketch analysis + deployment cards
- `realtime/` — intention detection logic
- `prompts/skills/vibe-to-brand.md` — reference skill (similar pipeline)

---

## Issue

Closes #135
