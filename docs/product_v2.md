# VI Agent — Product v2: Two Worlds

> **Last Updated:** 2026-03-04
>
> **Evolves from:** product.md (v1, see `.archived/`)
>
> **Companion doc:** system_v5.md (technical architecture)

---

## 1. Product Philosophy — Two Worlds

### 1.1 The Fundamental Insight

Every VI Agent session is a conversation between two worlds:

```
┌────────────────────────────────┐    ┌────────────────────────────────┐
│         MY WORLD               │    │         AI'S WORLD             │
│                                │    │                                │
│  What I see.                   │    │  What AI understands.          │
│  What I want.                  │    │  What AI can do.               │
│  Raw, messy, human.            │    │  Structured, rich, curated.    │
│                                │    │                                │
│  Camera is the window.         │    │  Session Canvas is the window. │
│  I point it at reality.        │    │  AI fills it with cognition.   │
│  Voice is my narration.        │    │  Cards are its narration.      │
│                                │    │                                │
│        ────────────────────────┼────┼──►                             │
│        "Here, look at this"    │    │  "Here's what I see / think /  │
│                                │    │   suggest / made for you"      │
└────────────────────────────────┘    └────────────────────────────────┘
```

**Camera** = I show AI my world.
**Session** = AI shows me its world.

The transition between them — Camera shrinking to a corner, Session expanding to fill the screen — is the physical manifestation of a **power handoff**. "I've shown you enough. Now show me what you've got."

### 1.2 Evolution from v1

| v1 (Product.md) | v2 (This Document) |
|-----------------|---------------------|
| Camera is an input interface | Camera is "my world" — a window I point at reality |
| Session is a result viewer | Session is "AI's world" — a canvas where AI cognition becomes visible |
| Hard navigation cut between views | Fluid transition: Camera shrinks to PiP, Session slides in |
| HTML blobs + 8 fixed React modules | 60+ card templates organized by cognitive function |
| Skills are backend features | Experience Packages: Skill + Templates + Tools + APIs in one bundle |
| Flat result rendering | Living cards: stream, mutate, interact, persist |
| Session ends when results appear | Session is an ongoing canvas — new cards flow in, old cards stay alive |

### 1.3 Core Axiom (Unchanged)

```
Max Aggregated Effective Token Across the Whole System
```

The Card Template system serves this axiom: structured templates mean NanoClaw spends tokens on **thinking and data**, not on generating HTML markup. More cognition per token = more value per dollar.

---

## 2. Camera — "My World"

> "The camera is not a shutter. It is the window through which I show AI my reality."

### 2.1 What Hasn't Changed

The Talking Camera concept from v1 remains intact:

- **Predictive Coding Model**: AI predicts intent from visual input before the user asks
- **Intention Hierarchy**: L0 (domain) → L1 (task type) → L2 (specific action) — system predicts to L2
- **Six Design Principles**: Predict Don't Ask, Confirm Don't Choose, Value Over Probability, Camera Time = Thinking Time, Output is the Best Question, Context is Free Signal
- **Observation Card**: Floating text showing AI's real-time perception
- **Media Capture**: Photo (tap), video (long-press), media stack with thumbnails

### 2.2 What's New: Camera as Persistent Presence

In v1, Camera dies when Session opens. In v2, **Camera never dies** — it shrinks to a floating PiP (Picture-in-Picture) that stays active in the top-right corner of Session.

**Why this matters:**

```
v1 flow:
Camera → [hard cut] → Session → [hard cut] → Camera
"Let me go back and show it something else"

v2 flow:
Camera ──────────────────────────────────────►
         ↕ (PiP, always active)
         Session Canvas ──────────────────────►
"Wait, look at this too" (tap PiP → expand → snap photo → tap PiP → back to Session)
```

The user is **always on a video call with AI**. Session is what the AI shares on its screen during the call. Camera PiP is the user's face in the corner. The metaphor is complete.

### 2.3 Camera → Session Transition

The most important UX moment in the app. Here's what the user experiences:

```
Step 1: User is in Camera view, observing the world with AI
        AI's observation card is showing predictions
        Intention Cards appear: "📊 Nutrition Analysis (85%)"

Step 2: User taps an Intention Card (or says "do it" / "go ahead")
        ┌─────────────────────┐
        │     Full Camera     │
        │                     │    Camera begins shrinking...
        │     Observation     │    Session Canvas slides up from bottom...
        │   [Shutter] [Mic]   │
        └─────────────────────┘

Step 3: Mid-transition (200ms in)
        ┌─────────────────────┐
        │ ┌───────┐           │
        │ │Camera │           │    Camera is now 50% size
        │ │ (PiP) │           │    Canvas is partially visible
        │ └───────┘           │
        │ ┌─────────────────┐ │
        │ │ 🧠 Thinking...  │ │    First card already streaming!
        │ └─────────────────┘ │
        └─────────────────────┘

Step 4: Transition complete (400ms)
        ┌─────────────────────┐
        │ ┌─────┐             │
        │ │ PiP │             │    Camera is a small floating window
        │ └─────┘             │    Mic stays active (voice continues)
        │                     │
        │ ┌─────────────────┐ │
        │ │ 🧠 Thinking...  │ │    Cards flowing in...
        │ │ Step 1: ✓       │ │
        │ │ Step 2: ▋       │ │
        │ └─────────────────┘ │
        │                     │
        │ [🎤 Voice Input]    │
        └─────────────────────┘
```

**Key UX principles:**
- The first card (Thinking Process) begins streaming **immediately** — no blank screen
- Voice conversation doesn't interrupt — user hears AI narrating what it's doing
- PiP is tappable — user can always go back to show AI something new
- The transition feels like **the AI taking the stage**, not a page loading

---

## 3. Session Canvas — "AI's World"

> "The Session Canvas is where AI cognition becomes visible. Every card is a thought made tangible."

### 3.1 The Canvas Metaphor

Session is not a chat log. It's not a results page. It's a **living canvas** where the AI paints its understanding of your world.

```
┌─────────────────────────────────┐
│ ┌─────┐                        │
│ │ PiP │   ← My world (still live) │
│ └─────┘                        │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🧠 Thinking Process         │ │  ← AI shows how it's thinking
│ │ "Analyzing the pasta dish"  │ │
│ │ Step 1: Identifying... ✓   │ │
│ │ Step 2: Estimating...  ▋   │ │
│ └─────────────────────────────┘ │
│           ↕ 12px gap            │
│ ┌─────────────────────────────┐ │
│ │ 🔍 Image Analysis          │ │  ← AI shows what it sees
│ │ [Photo]                    │ │
│ │ "Spaghetti Carbonara"     │ │
│ │ #italian #pasta #cream    │ │
│ └─────────────────────────────┘ │
│           ↕ 12px gap            │
│ ┌─────────────────────────────┐ │
│ │ 📊 Nutrition Card          │ │  ← AI shows what it knows
│ │ 650 kcal                   │ │
│ │ [═══Protein═══]  25g      │ │
│ │ [════Carbs════]  72g      │ │
│ │ [═══Fat═══════]  28g      │ │
│ │ "Consider lighter sauce"   │ │
│ └─────────────────────────────┘ │
│           ↕ 12px gap            │
│ ┌─────────────────────────────┐ │
│ │ 🛒 Shopping List           │ │  ← AI shows what to do
│ │ ☑ Whole wheat spaghetti    │ │
│ │ ☐ Turkey bacon             │ │
│ │ ☐ Egg whites               │ │
│ │ "Healthier version: 420cal"│ │
│ └─────────────────────────────┘ │
│                                 │
│ [🎤 "What about protein?"    ] │  ← Voice input bar
└─────────────────────────────────┘
```

### 3.2 Card Flow — Waterfall of Cognition

Cards flow vertically like a river of AI thought:

1. **Thinking Process** always comes first — "Here's what I'm doing and why"
2. **Perception cards** follow — "Here's what I see in your photo/video"
3. **Analysis cards** build on perception — "Here's what I understand"
4. **Action cards** emerge from analysis — "Here's what you can do"
5. **Interactive cards** may follow actions — "Let me help you decide"

This sequence mirrors human cognition: See → Understand → Plan → Act. The user watches AI "think out loud" through cards.

**The stream never ends.** User can:
- Ask follow-up questions via voice → new cards flow in
- Tap PiP to show AI something new → new perception cards flow in
- Interact with existing cards (check items, answer quiz) → cards update live

### 3.3 Living Cards

Cards are not static results. They are **living documents** that evolve:

| State | Visual | What Happens |
|-------|--------|-------------|
| **Streaming** | Pulsing border, typewriter text | Content flowing in from NanoClaw |
| **Active** | Normal, interactive elements enabled | User can interact (check items, rate, answer) |
| **Updated** | Brief highlight flash on changed elements | NanoClaw modified the card data |
| **Finalized** | Subtle completed indicator | No more changes expected |

**Examples of living behavior:**
- Shopping list: user checks off items → count updates → AI suggests substitutes
- Map: AI adds new pins as it researches → user taps pin → detail card appears below
- Quiz: user answers → AI reveals correct answer with explanation
- Thinking process: starts with 3 steps, AI adds more as it discovers complexity

### 3.4 Voice in Session

Voice doesn't stop in Session. The user's mic stays active via PiP, and the Spokesperson (Gemini) continues the conversation:

```
User (voice): "What about the protein content?"
AI (voice):   "Let me check that for you..."
Canvas:       [New thinking-process card streams in]
              [New nutrition-card appears with protein detail]

User (voice): "Add it to my shopping list"
AI (voice):   "Done! I've added high-protein ingredients."
Canvas:       [Existing shopping-list card updates with new items]
```

Voice is the **narration track**. Cards are the **visual track**. Together they create a rich, multi-sensory experience.

---

## 4. Experience Packages — Complete Use Cases

### 4.1 What the User Sees

The user doesn't know about packages. They see **Skills** — things AI can do for them. Each Skill is backed by an Experience Package that bundles everything needed.

```
User perspective:                     System perspective:
┌──────────────────┐                  ┌──────────────────────────────┐
│ 📊 Nutrition     │                  │ packages/nutrition-analyzer/ │
│ Analyzer         │ ──── is ────►    │ ├── skill.md                │
│                  │                  │ ├── templates/              │
│ "Tap to analyze" │                  │ ├── tools/                  │
│ 85% confidence   │                  │ └── apis/                   │
│ ~10s             │                  └──────────────────────────────┘
└──────────────────┘
```

### 4.2 The Full Experience Flow

When a user encounters a new use case, the experience is seamless:

```
1. DISCOVER
   User points camera at a plate of food
   AI predicts: "📊 Nutrition Analysis" (Intention Card appears)

2. TRIGGER
   User taps the card (or says "analyze this")
   Camera shrinks to PiP

3. COGNITION (cards flow in)
   🧠 "Analyzing your meal..."                    ← thinking-process
   🔍 "I see Spaghetti Carbonara"                 ← image-analysis
   📊 "650 kcal, 25g protein, 72g carbs"          ← nutrition-card
   📝 "Compared to your daily goal: 45% consumed" ← comparison-table

4. INTERACT
   User: "Can you suggest a healthier version?"
   🛒 Shopping list appears with substitutions     ← shopping-list (live)
   📊 Updated nutrition: 420 kcal                  ← nutrition-card (new)

5. PERSIST
   Session saved to History
   User can revisit anytime
   Shopping list items stay checked
```

### 4.3 Building New Experiences (Growth Team)

The growth team ships new use cases without touching core code:

**Example: "Pet Health Checker"**

```
packages/pet-health-checker/
├── manifest.json     "Identify pet breed, check common health issues"
├── skill.md          System prompt with pet health knowledge
├── templates/
│   ├── pet-id.json           Species + breed identification card
│   ├── health-report.json    Health risk assessment card
│   └── vet-finder.json       Nearby vet clinics map card
├── tools/
│   ├── search_vets.ts        Google Maps API for vet clinics
│   └── pet_database.ts       Breed + health database lookup
└── examples/
    ├── golden-retriever.json
    └── persian-cat.json
```

**Result:** User points camera at their dog → "🐾 Pet Health Check" card appears → tap → thinking → breed identification → health report → nearby vet map. Complete experience in one package.

---

## 5. Card Cognitive Taxonomy — What the User Sees

Cards are organized by what the AI is doing. The user intuitively understands this without being told the taxonomy:

### 5.1 Perceive Cards — "AI describes what it sees"

The first cards to appear after the transition. They build trust by showing the user that AI understands their input correctly.

```
┌─────────────────────────────────┐
│ 🔍 Image Analysis              │
│                                 │
│ [════════════════════════════]  │
│ [   Photo with annotations   ]  │
│ [════════════════════════════]  │
│                                 │
│ "I see a plate of spaghetti    │
│  carbonara with a side salad   │
│  and sparkling water."         │
│                                 │
│ 🏷 #italian  #pasta  #dinner   │
└─────────────────────────────────┘
```

**User feeling:** "Yes, it gets what I showed it."

### 5.2 Think Cards — "AI shows its reasoning"

These cards make AI transparent. The user sees the thinking process, building confidence in the output.

```
┌─────────────────────────────────┐
│ 🧠 Thinking Process            │
│                                 │
│ ✓ Identifying dish type        │
│ ✓ Estimating portion size      │
│ ▋ Calculating macronutrients   │
│ ○ Comparing to daily goals     │
│ ○ Generating recommendation    │
│                                 │
│ "Using USDA nutritional data   │
│  for traditional carbonara..." │
└─────────────────────────────────┘
```

**User feeling:** "I can see it working. It's thorough."

### 5.3 Act Cards — "AI suggests what to do"

Actionable recommendations with real utility. These are where value is delivered.

```
┌─────────────────────────────────┐
│ 📊 Nutrition Analysis          │
│                                 │
│ Spaghetti Carbonara    650 kcal│
│                                 │
│ Protein  ████████░░░░  25g     │
│ Carbs    ██████████░░  72g     │
│ Fat      ███████░░░░░  28g     │
│ Fiber    ██░░░░░░░░░░   4g     │
│                                 │
│ Daily goal: 45% consumed       │
│ "Rich in carbs. Consider a     │
│  lighter sauce option."        │
│                                 │
│ [🔄 Suggest Healthier] [📋 Save]│
└─────────────────────────────────┘
```

**User feeling:** "This is actually useful. I can act on this."

### 5.4 Interact Cards — "AI invites participation"

Cards that require user input to produce better results. Used when AI needs clarification or wants to engage.

```
┌─────────────────────────────────┐
│ 🎮 Quick Quiz                  │
│                                 │
│ How many servings is this?      │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ○  One serving              │ │
│ │ ● Two servings              │ │  ← user tapped this
│ │ ○  Three or more            │ │
│ └─────────────────────────────┘ │
│                                 │
│ ✓ Correct! Adjusting calories  │
│   to 325 per serving.          │
└─────────────────────────────────┘
```

**User feeling:** "It's listening to me, not just talking at me."

### 5.5 Present Cards — "AI delivers polished work"

Final outputs, ready to save, share, or use. The culmination of the session.

```
┌─────────────────────────────────┐
│ 🎨 Meal Photo                  │
│                                 │
│ [═══════════════════════════]  │
│ [                             ]  │
│ [   Enhanced photo with       ]  │
│ [   professional styling      ]  │
│ [                             ]  │
│ [═══════════════════════════]  │
│                                 │
│ "Spaghetti Carbonara"          │
│ 650 kcal · Italian · Dinner    │
│                                 │
│ [📤 Share] [💾 Save] [📕 Post] │
└─────────────────────────────────┘
```

**User feeling:** "This is beautiful. I can share this."

---

## 6. Session Lifecycle

### 6.1 Session States

```
┌─────────┐   user triggers   ┌──────────┐   all cards    ┌───────────┐
│ CAMERA  │ ──────────────►   │ ACTIVE   │ ──finalized──► │ COMPLETE  │
│ (input) │   Intention Card  │ (canvas  │                │ (history) │
│         │   or voice cmd    │  filling)│                │           │
└─────────┘                   └──────────┘                └───────────┘
                                   │                           │
                              user asks                   user re-opens
                              follow-up                   from History
                                   │                           │
                                   ▼                           ▼
                              continues                   read-only view
                              (new cards                  (all cards in
                               flow in)                    final state)
```

### 6.2 What Persists

When a session completes, the following is saved:

| Data | Where | Used For |
|------|-------|----------|
| All cards (final state) | PostgreSQL + S3 | Session replay in History |
| Captured photos/videos | S3 (GCS) | Session thumbnail, card context |
| Session metadata | PostgreSQL | History list (title, summary, time) |
| User interactions | PostgreSQL | Learning user preferences |
| Card action events | PostgreSQL (optional) | Analytics, improving AI |

### 6.3 History Card Preview

Each past session appears in History as a compact card:

```
┌──────────────────────────────────────┐
│ [Photo Thumbnail]  Pasta Analysis    │
│                    "Analyzed nutritio │
│                    n for Spaghetti C │
│                    arbonara — 650 kc │
│                    al, suggested hea │
│                    lthier version."  │
│                    5 cards · Today   │
└──────────────────────────────────────┘
```

Tapping opens the full Session Canvas with all cards rendered in their final state (read-only, but interactive cards still respond to taps for exploration).

---

## 7. Design Language

### 7.1 Visual Theme

The Session Canvas uses a **clean, light iOS aesthetic** — cards are the hero content:

| Element | Style |
|---------|-------|
| Canvas background | `#F2F2F7` (iOS system gray) |
| Card background | `#FFFFFF` with subtle shadow |
| Card border radius | 16px |
| Card padding | 16px |
| Text color | `#1C1C1E` (primary), `#8E8E93` (secondary) |
| Accent color | `#a855f7` (purple) — links, interactive elements, progress |
| Streaming indicator | Pulsing purple border (1px) |
| PiP border | 2px white, 8px rounded corners, subtle drop shadow |

### 7.2 Typography

| Role | Size | Weight |
|------|------|--------|
| Card title | 17px | Semibold |
| Card body | 15px | Regular |
| Card meta (tags, timestamps) | 13px | Regular, secondary color |
| Section label | 13px | Semibold, uppercase, secondary |
| Voice input text | 16px | Regular |

### 7.3 Motion Design

All motion uses Framer Motion springs:

| Transition | Duration | Easing |
|------------|----------|--------|
| Camera → PiP | 400ms | Spring (stiffness: 300, damping: 30) |
| Card slide-in | 200ms | Spring (stiffness: 400, damping: 35) |
| Card content stream | ~40 chars/sec | Linear typewriter |
| Card finalize flash | 100ms | Ease-out |
| PiP expand/collapse | 250ms | Spring (stiffness: 350, damping: 28) |
| Card remove | 200ms | Ease-in (slide left + fade) |

### 7.4 Sound Design (Additions)

| Event | Sound | When |
|-------|-------|------|
| Card appear | Soft chime (ascending) | New card streams in |
| Card finalize | Subtle completion tone | Card finishes loading |
| PiP tap | Camera click (muted) | User taps PiP to expand |
| Interaction feedback | Checkbox tick / button press | User interacts with card |

---

## 8. V1 Priority Roadmap

### 8.1 Core Templates for V1 (10 templates)

These 10 templates cover the V0.1 use cases and extend into daily-use scenarios:

| Priority | Template | Category | V0.1 UC | Notes |
|:--------:|----------|----------|:-------:|-------|
| P0 | `thinking-process` | Think | All | Always first card, universal |
| P0 | `image-analysis` | Perceive | All | Visual recognition baseline |
| P0 | `nutrition-card` | Perceive | UC-1 | Food calorie analysis |
| P0 | `hero-image` | Present | All | Simple image + text result |
| P1 | `plant-animal-id` | Perceive | UC-2 | Plant/animal identification |
| P1 | `comparison-table` | Think | UC-3 | Feature comparison |
| P1 | `step-guide` | Act | UC-3 | How-to instructions |
| P2 | `shopping-list` | Act | — | First interactive card |
| P2 | `map-pins` | Act | — | Location recommendations |
| P2 | `conversation` | Interact | — | Threaded follow-up chat |

### 8.2 V1 Experience Packages

| Package | Templates Used | Trigger |
|---------|---------------|---------|
| `nutrition-analyzer` | thinking-process, image-analysis, nutrition-card | Food photo |
| `plant-identifier` | thinking-process, image-analysis, plant-animal-id, step-guide | Plant photo |
| `sketch-to-ui` | thinking-process, image-analysis, hero-image | Hand-drawn sketch |

### 8.3 V1 System Capabilities

| Capability | Status | Notes |
|-----------|--------|-------|
| Card Template Protocol | New | `create_card`, `stream_to_card`, `finalize_card` |
| Experience Packages | New | Package loading, template registry, tool discovery |
| Camera PiP | New | Active floating camera, drag-to-corner |
| Session Canvas | Evolves from LiveSessionView | Waterfall card rendering |
| Living Cards | New | `update_card`, `append_to_card`, `card_action` |
| Card Persistence | New | Session replay from History |
| Shared templates | New | `_shared/` directory, available to all packages |
| Template extension | New | 3-step process to add new templates |

### 8.4 Future Packages (Post-V1)

Designed after V1 ships, using the same package system:

| Package | Category | Key Templates |
|---------|----------|---------------|
| `restaurant-finder` | Lifestyle | map-pins, comparison-table, booking |
| `document-scanner` | Productivity | text-extraction, document, file-download |
| `travel-planner` | Lifestyle | itinerary, map-navigation, weather-forecast, booking |
| `style-advisor` | Fashion | image-analysis, comparison-table, shopping-list |
| `language-tutor` | Education | translation, quiz, conversation |
| `workout-tracker` | Health | workout-plan, chart-data, calendar-event |
| `recipe-generator` | Food | recipe, shopping-list, step-guide |
| `code-reviewer` | Development | code-snippet, comparison-table, checklist |
| `interior-designer` | Home | image-analysis, before-after, shopping-list |
| `math-tutor` | Education | explanation, quiz, step-guide |

Each package is independently shippable by the growth team. No core system changes needed.

---

## 9. Metrics That Matter

### 9.1 User Experience Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Camera → first card visible | < 2 seconds | "AI is fast" perception |
| Thinking card → result card | < 10 seconds | Patience threshold |
| Card stream smoothness | 0 blank flashes, 30+ FPS | Professional feel |
| PiP response to tap | < 100ms | Feels instant |
| Session replay load | < 500ms | History feels snappy |

### 9.2 Engagement Metrics

| Metric | Measures |
|--------|----------|
| Cards per session | How much value AI delivers |
| Interactive card engagement rate | How often users interact (check, vote, answer) |
| Follow-up question rate | Whether users continue the conversation |
| PiP usage rate | Whether users show AI more during sessions |
| Session revisit rate | Whether users return to past sessions |

### 9.3 Growth Team Metrics

| Metric | Measures |
|--------|----------|
| Time to ship new package | Growth team velocity |
| Package success rate | % of sessions where package template selection was correct |
| Template reuse rate | How often shared templates are used across packages |
| User satisfaction per package | NPS-like per-experience rating |

---

## 10. What Stays the Same

These v1 concepts are **unchanged and carry forward**:

- **Master-Spokesperson Model**: Claude (NanoClaw) thinks, Gemini talks. Invisible split.
- **Predictive Coding**: AI predicts intent from visual input. Always makes a concrete prediction.
- **Six Design Principles**: Predict Don't Ask, Confirm Don't Choose, Value Over Probability, Camera Time = Thinking Time, Output is the Best Question, Context is Free Signal.
- **Intention Cards**: Horizontal scroll, confidence %, tap-to-execute.
- **Memory System**: Identity / Semantic / Episodic layers. AI learns user preferences.
- **Sound Design**: Contextual audio feedback for all interactions.
- **Agent Economics**: $3-5/user/month target. Token efficiency via templates.
- **Authentication**: Device-based anonymous → Firebase Auth (Phase 1).

---

*VI Agent Product v2 — Two Worlds | 2026-03-04*
*Camera is how I show AI my world. Session is how AI shows me its.*
