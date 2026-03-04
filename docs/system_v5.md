# VI Agent — System v5: Card Template Architecture

> **Last Updated:** 2026-03-04
>
> **Builds on:** architecture-v5.md (infrastructure phasing — unchanged, see `.archived/`)
>
> **Scope:** This document defines the **Experience Package Architecture**, **Card Template Protocol**, **Camera→Session Dual World Architecture**, and **NanoClaw Streaming Protocol** — the technical systems that power the Session Canvas experience.

---

## 1. Dual World Architecture

The system is organized around two complementary spaces:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   CAMERA (Input Space)          SESSION (Output Space)       │
│   "User shows AI the world"     "AI shows user its world"   │
│                                                              │
│   • Continuous, raw              • Structured, curated       │
│   • Human-controlled             • AI-driven                 │
│   • Multimodal input             • Card-based output         │
│   • Real-time perception         • Streaming cognition       │
│                                                              │
│         ──── transition: power handoff ────►                 │
│         Camera shrinks to PiP (control shifts to AI)         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The transition from Camera to Session is not a page navigation — it's a **power transfer**. The user says "I've shown you enough, now show me." Camera shrinks to a floating PiP; Session Canvas expands to fill the stage.

### 1.1 Active PiP Camera

When the user enters Session, Camera doesn't die — it persists as a FaceTime-style floating window in the top-right corner.

**Technical Spec:**

| Property | Value |
|----------|-------|
| Default size | 120×160px (3:4 aspect ratio) |
| Position | Top-right, 16px margin, `position: fixed` |
| Z-index | Above Canvas, below system modals |
| Draggable | Yes — snap to corners on release |
| Tap behavior | Expand to mini-camera (240×320px) with shutter button |
| Double-tap | Return to full Camera view |
| Camera feed | LiveKit local video track stays published |
| Audio | Mic stays active — voice input continues |
| Transition animation | Spring animation, 400ms, Camera view scales down while Session slides up |

**State Machine:**

```
                    ┌─────────────┐
              ┌────►│  Collapsed   │◄────┐
              │     │  (120×160)   │     │
              │     └──────┬──────┘     │
         double-tap        │ tap        │ tap-outside
              │     ┌──────▼──────┐     │
              │     │  Expanded    │─────┘
              │     │  (240×320)   │
              │     │  + shutter   │
              │     └──────┬──────┘
              │            │ double-tap
              │     ┌──────▼──────┐
              └─────│  Full Camera │
                    │  View        │
                    └─────────────┘
```

**Why Active PiP:**
- User can show AI something new mid-session: "Wait, look at this too"
- Voice conversation continues seamlessly
- The "video call" metaphor is preserved — you're still on the call, AI is just showing you something on its screen

### 1.2 Camera → Session Transition

```
BEFORE (Camera View):                 AFTER (Session View):
┌─────────────────────┐              ┌─────────────────────┐
│                     │   spring     │ ┌─────┐             │
│   Full Camera       │   400ms     │ │ PiP │   Camera    │
│   Feed              │  ──────►    │ └─────┘             │
│                     │             │                     │
│   [Observation]     │             │ ┌─────────────────┐ │
│   [IntentionCards]  │             │ │ Card Stream     │ │
│                     │             │ │ (waterfall)     │ │
│   [Shutter] [Mic]   │             │ │                 │ │
└─────────────────────┘             │ └─────────────────┘ │
                                    │ [Voice Input Bar]   │
                                    └─────────────────────┘
```

**Trigger:** User taps an Intention Card, or says "done" / "go ahead".

**Animation Sequence:**
1. Camera view begins shrinking (scale + translate to top-right)
2. Session Canvas slides up from bottom simultaneously
3. First card (Thinking Process) begins streaming immediately
4. Duration: 400ms spring animation (`stiffness: 300, damping: 30`)

---

## 2. Experience Package Architecture

The core deployable unit is not a Skill, not a Template — it's an **Experience Package**. When the growth team ships a new use case (e.g., "Restaurant Finder"), they ship everything in one bundle.

### 2.1 What is an Experience Package?

```
Experience Package = Skill + Templates + Tools + APIs
                   = One folder → One complete user experience
```

An Experience Package contains everything needed to go from user intent to rendered result:

| Component | What It Is | Example (Restaurant Finder) |
|-----------|-----------|---------------------------|
| **Skill** | NanoClaw system prompt + execution logic | "Analyze photo for restaurants, search Yelp, recommend top 3" |
| **Templates** | Card layouts for rendering results | `map-pins`, `place-card`, `comparison-table` |
| **Tools** | Function definitions NanoClaw can call | `search_yelp`, `get_directions`, `make_reservation` |
| **APIs** | External service configurations + auth | Yelp API key, Google Maps API, OpenTable API |

### 2.2 Package Structure

```
packages/
├── nutrition-analyzer/                  ← Experience Package
│   ├── manifest.json                    ← Package metadata + capability declaration
│   ├── skill.md                         ← NanoClaw system prompt
│   ├── tools/
│   │   ├── nutrition_lookup.ts          ← Custom tool implementation
│   │   └── tools.json                   ← Tool schema definitions
│   ├── templates/
│   │   ├── nutrition-card.json          ← Card template schema
│   │   ├── nutrition-card.html          ← HTML renderer (if HTML-rendered)
│   │   └── NutritionCardModule.tsx      ← React component (if React-rendered)
│   ├── apis/
│   │   └── config.json                  ← External API config (keys, endpoints, auth)
│   └── examples/
│       ├── pasta.json                   ← Example input/output for testing
│       └── salad.json
│
├── restaurant-finder/
│   ├── manifest.json
│   ├── skill.md
│   ├── tools/
│   │   ├── search_yelp.ts
│   │   ├── get_directions.ts
│   │   └── tools.json
│   ├── templates/
│   │   ├── map-pins.json               ← Can reference shared templates
│   │   ├── place-card.json
│   │   └── restaurant-detail.html
│   ├── apis/
│   │   └── config.json                 ← { "yelp": { "required": true }, "google_maps": { "required": true } }
│   └── examples/
│       └── italian-restaurant.json
│
└── _shared/                             ← Shared templates available to all packages
    ├── thinking-process.json
    ├── thinking-process.html
    ├── image-analysis.json
    ├── hero-image.json
    ├── conversation.json
    └── ...
```

### 2.3 manifest.json

The manifest declares what the package provides and requires:

```json
{
  "id": "restaurant-finder",
  "version": "1.0.0",
  "name": "Restaurant Finder",
  "description": "Find nearby restaurants from photos of food, menus, or neighborhoods",
  "icon": "🍽️",
  "category": "lifestyle",

  "trigger": {
    "visual_cues": ["restaurant", "menu", "food court", "dining area", "cafe sign"],
    "voice_keywords": ["restaurant", "where to eat", "hungry", "dinner", "lunch"],
    "intention_level": "L1"
  },

  "skill": {
    "prompt": "skill.md",
    "model": "claude-sonnet-4-6",
    "max_turns": 5,
    "max_tokens": 8192
  },

  "templates": {
    "bundled": ["restaurant-detail"],
    "shared": ["thinking-process", "map-pins", "comparison-table", "conversation"]
  },

  "tools": {
    "bundled": ["search_yelp", "get_directions", "make_reservation"],
    "builtin": ["web_search", "web_fetch", "memory_update"]
  },

  "apis": {
    "yelp": { "required": true, "scopes": ["businesses.search"] },
    "google_maps": { "required": true, "scopes": ["directions"] },
    "opentable": { "required": false, "scopes": ["reservations"] }
  },

  "output": {
    "card_sequence": ["thinking-process", "map-pins", "restaurant-detail"],
    "estimated_time": "15-30s",
    "estimated_cost": "$0.03-0.08"
  }
}
```

### 2.4 Package Lifecycle

```
┌───────────────────────────────────────────────────────────┐
│ Growth Team builds package                                │
│                                                           │
│   1. Write skill.md (NanoClaw prompt)                    │
│   2. Define templates (JSON schema + renderer)           │
│   3. Implement tools (API wrappers)                      │
│   4. Configure APIs (keys, auth, endpoints)              │
│   5. Write examples (input → expected output)            │
│   6. Fill manifest.json                                  │
│                                                           │
│   Test locally: `vi-test-package restaurant-finder/`     │
│   Deploy: merge to packages/ directory                   │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│ System loads package on startup                           │
│                                                           │
│   1. Parse manifest.json                                 │
│   2. Register templates in Template Registry              │
│   3. Register tools in NanoClaw's tool set               │
│   4. Load skill.md into Skill Registry                   │
│   5. Configure API clients with credentials              │
│   6. Add trigger patterns to Intention Predictor         │
│                                                           │
│   Package is now active — Camera can predict this intent │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│ Runtime execution                                         │
│                                                           │
│   1. User points camera → Intention Predictor fires      │
│   2. Predictor checks package triggers → match!          │
│   3. Intention Card appears: "🍽️ Find Restaurants (85%)" │
│   4. User taps → NanoClaw loads skill.md + tools        │
│   5. Execution streams cards using package's templates   │
│   6. User sees: thinking → map → restaurant details     │
└───────────────────────────────────────────────────────────┘
```

### 2.5 Shared vs Bundled Templates

Templates come in two flavors:

| Type | Location | Example | Use When |
|------|----------|---------|----------|
| **Shared** | `packages/_shared/` | `thinking-process`, `map-pins`, `image-analysis` | Template is general-purpose, used by multiple packages |
| **Bundled** | `packages/{pkg}/templates/` | `restaurant-detail`, `nutrition-card` | Template is specific to this package's domain |

Shared templates are the 60+ templates in the Cognitive Function Taxonomy (Section 4). These are the general-purpose templates any package can reference. Bundled templates are domain-specific additions that only make sense within a particular package.

**Resolution order:** Bundled templates override shared templates with the same ID. This allows packages to customize shared templates while maintaining the default behavior for others.

### 2.6 Growth Team Workflow

The goal: a growth team member can ship a new use case **without touching core system code**.

```
Day 1: Identify use case ("Pet Health Checker")
Day 2: Write skill.md — describe the AI behavior
Day 3: Design templates — what cards should the user see?
Day 4: Implement tools — wrap any external APIs needed
Day 5: Test with examples — verify end-to-end flow
Day 6: PR → merge → package auto-loads → users can use it
```

**No changes to:** NanoClaw core, frontend core, API server, realtime agent, or any shared infrastructure. Pure additive deployment.

### 2.7 Package Dependencies

Packages can depend on external APIs that require OAuth tokens from the user:

```json
{
  "apis": {
    "google_calendar": {
      "required": true,
      "oauth_provider": "google",
      "scopes": ["calendar.events"],
      "connection_prompt": "Connect Google Calendar to create events"
    }
  }
}
```

If a user doesn't have the required OAuth connection:
1. Intention Card shows with a "🔗 Connect required" badge
2. Tapping the card prompts OAuth flow first
3. After connecting, the skill executes normally
4. Connection persists — future uses don't re-prompt

---

## 3. Card Template Protocol

The Card Template Protocol defines how NanoClaw creates, streams, and mutates cards in the Session Canvas.

### 2.1 Core Concepts

| Concept | Definition |
|---------|-----------|
| **Template** | A registered card type with a fixed layout structure and a JSON data schema |
| **Card** | An instance of a Template, created by NanoClaw, identified by `cardId` |
| **Living Card** | A card that accepts mutations after initial creation |
| **Slot** | A named data field within a Template that NanoClaw can populate or update |

### 3.2 Template Registry

Templates are auto-discovered from Experience Packages (Section 2). The system builds a unified registry at startup by scanning:

1. `packages/_shared/` → shared templates (available to all packages)
2. `packages/{pkg}/templates/` → bundled templates (scoped to package)

Adding a new template requires exactly **3 things**:

```
1. Template ID:     unique string identifier (e.g., "nutrition-card")
2. JSON Schema:     data contract defining slots and their types
3. Renderer:        HTML template file OR React component
```

**Unified Registry (auto-generated at startup):**

```json
{
  "version": "1.0",
  "templates": {
    "thinking-process": {
      "category": "think",
      "renderer": "html",
      "source": "_shared",
      "mutable": true,
      "streamable": true,
      "description": "Shows AI reasoning chain in real-time"
    },
    "nutrition-card": {
      "category": "perceive",
      "renderer": "react",
      "component": "NutritionCardModule",
      "source": "nutrition-analyzer",
      "mutable": false,
      "streamable": true,
      "description": "Calorie and macro breakdown for food photos"
    }
  }
}
```

Templates bundled in a package are only available when that package's skill is executing. Shared templates are always available.

### 3.3 Extension Guide — Adding a New Template

**Option A: Add to an existing Experience Package**

1. Create schema `packages/{pkg}/templates/{template-id}.json`
2. Create renderer (HTML or React component)
3. Add to package's `manifest.json` → `templates.bundled`

**Option B: Add a shared template**

1. Create schema in `packages/_shared/{template-id}.json`
2. Create renderer in `packages/_shared/`
3. Auto-discovered on startup — no manifest edit needed

**Schema format:**

```json
{
  "$id": "my-new-card",
  "category": "act",
  "slots": {
    "title": { "type": "string", "required": true },
    "items": { "type": "array", "items": { "type": "object" } },
    "footer_text": { "type": "string" }
  },
  "mutable_slots": ["items", "footer_text"],
  "streamable_slots": ["title", "items"]
}
```

**Renderer options:**
- **HTML template** (`.html`): For content-heavy, visually rich cards. Uses `{{slot_name}}` placeholders + Tailwind.
- **React component** (`.tsx`): For interactive cards needing local state (checklists, games, forms).

That's it. NanoClaw can immediately use the new template — it sees the schema in its system prompt context and knows what data to produce.

### 2.4 Dual Renderer Architecture

Cards are rendered through two paths, chosen per-template:

```
NanoClaw sends card data
         │
         ├── renderer: "html"
         │   └── Template Engine fills HTML template with JSON data
         │       └── Rendered in sandboxed <iframe>
         │           └── Mutations via postMessage DOM patches
         │
         └── renderer: "react"
             └── React component receives props from JSON data
                 └── Rendered as native React component
                     └── Mutations via React state updates
```

**When to use HTML renderer:** Content presentation, rich layouts, media-heavy cards, anything NanoClaw might want to customize visually beyond the schema.

**When to use React renderer:** Interactive cards with local state (checkboxes, drag-and-drop, form inputs), cards needing native platform APIs (maps, camera access), high-performance rendering.

**Escape hatch — Freeform HTML:** For content that no template covers, NanoClaw can use `template: "freeform-html"` and stream raw HTML directly. This is the current PersistentHtmlRenderer path. It should be the exception, not the rule.

---

## 4. Cognitive Function Taxonomy

Templates are organized by the **AI cognitive function** they represent — what the AI is doing when it generates this card.

### 4.1 Five Categories

```
🔍 PERCEIVE    AI shows what it sees        Camera input → recognition result
🧠 THINK       AI shows how it reasons      Analysis → structured insight
📍 ACT         AI shows what to do          Recommendation → actionable plan
🎮 INTERACT    AI invites participation     Question → user response → result
🎨 PRESENT     AI delivers finished work    Creation → polished output
```

This taxonomy serves two purposes:
1. **For NanoClaw:** Reasoning framework — "I'm analyzing an image, so I need a Perceive template"
2. **For developers:** Where to add new templates — new templates slot into categories naturally

### 4.2 Complete Template Catalog (60+)

#### 🔍 PERCEIVE — "AI shows what it sees"

| Template ID | Description | Streamable | Mutable |
|-------------|-------------|:----------:|:-------:|
| `image-analysis` | Object annotations, scene description | yes | no |
| `text-extraction` | OCR results (receipts, menus, signs) | yes | no |
| `object-detection` | Bounding boxes with labels | no | no |
| `scene-description` | Narrative description of environment | yes | no |
| `barcode-scan` | Barcode/QR code decode result | no | no |
| `color-palette` | Extracted colors from image | no | no |
| `document-scan` | Structured table/text from document | yes | no |
| `handwriting-ocr` | Handwritten text recognition | yes | no |
| `plant-animal-id` | Species identification with taxonomy | yes | no |
| `face-analysis` | Expression, age estimate, count | no | no |
| `label-read` | Product label / ingredient list parse | yes | no |
| `landmark-id` | Landmark recognition + context | yes | no |

#### 🧠 THINK — "AI shows how it reasons"

| Template ID | Description | Streamable | Mutable |
|-------------|-------------|:----------:|:-------:|
| `thinking-process` | Real-time reasoning chain visualization | yes | yes |
| `intention-proposal` | Predicted actions with confidence scores | no | yes |
| `comparison-table` | Multi-column feature matrix | yes | no |
| `pros-cons` | Dual-column pros vs cons analysis | yes | no |
| `decision-tree` | Expandable decision flow | no | yes |
| `timeline` | Chronological event analysis | yes | no |
| `summary` | Condensed summary/abstract | yes | no |
| `fact-check` | Claim verification with sources | yes | no |
| `translation` | Side-by-side translation pairs | yes | no |
| `explanation` | Concept breakdown (ELI5 / expert) | yes | no |
| `estimation` | Numerical estimate with confidence range | yes | no |
| `sentiment-analysis` | Tone/emotion analysis of text | no | no |

#### 📍 ACT — "AI shows what to do / suggests action"

| Template ID | Description | Streamable | Mutable |
|-------------|-------------|:----------:|:-------:|
| `map-navigation` | Map with route and turn-by-turn | no | yes |
| `map-pins` | Multi-point map (nearby recommendations) | no | yes |
| `shopping-list` | Checkable shopping items | yes | yes |
| `recipe` | Ingredients + step-by-step cooking | yes | no |
| `nutrition-card` | Calorie and macro breakdown | yes | no |
| `calendar-event` | Event details + "Add to Calendar" | no | yes |
| `reminder` | Time-based reminder setup | no | yes |
| `booking` | Reservation card (restaurant/hotel/flight) | no | no |
| `price-comparison` | Multi-platform price matrix | yes | no |
| `step-guide` | Numbered guide with collapsible steps | yes | no |
| `checklist` | Interactive to-do with checkboxes | yes | yes |
| `itinerary` | Day-by-day travel plan + map | yes | yes |
| `weather-forecast` | Current + multi-day forecast | no | yes |
| `workout-plan` | Exercise schedule with sets/reps | yes | yes |
| `budget-tracker` | Income/expense breakdown | yes | yes |
| `file-download` | File preview + download button | no | no |
| `link-preview` | URL preview card (OG data) | no | no |
| `contact-card` | Contact info + vCard export | no | no |
| `code-snippet` | Syntax-highlighted code + copy button | yes | no |

#### 🎮 INTERACT — "AI invites user participation"

| Template ID | Description | Streamable | Mutable |
|-------------|-------------|:----------:|:-------:|
| `quiz` | Question + multiple choice + feedback | no | yes |
| `poll-vote` | Voting with live result visualization | no | yes |
| `rating-review` | Star rating + text review input | no | yes |
| `swipe-cards` | Tinder-style swipe selection | no | yes |
| `form-input` | Structured form fields | no | yes |
| `draw-canvas` | Drawing pad for user input | no | yes |
| `ar-overlay` | AR annotations using Camera PiP | no | yes |
| `before-after` | Slider comparison of two states | no | no |
| `sorting-game` | Drag-to-reorder game | no | yes |
| `memory-game` | Card-flip matching game | no | yes |
| `drag-arrange` | Drag items into categories | no | yes |
| `conversation` | Embedded chat thread | yes | yes |

#### 🎨 PRESENT — "AI delivers finished work"

| Template ID | Description | Streamable | Mutable |
|-------------|-------------|:----------:|:-------:|
| `hero-image` | Large image + title + description | yes | no |
| `image-gallery` | Photo grid or carousel | no | no |
| `video-player` | Video playback with controls | no | no |
| `slideshow` | Swipeable slide deck | no | no |
| `document` | Long-form with collapsible sections | yes | no |
| `infographic` | Data visualization poster | no | no |
| `chart-data` | Bar/line/pie/radar charts | no | yes |
| `social-post` | Social media post preview | yes | no |
| `music-player` | Audio playback with waveform | no | no |
| `pdf-viewer` | PDF page viewer | no | no |
| `markdown-render` | Rendered markdown document | yes | no |
| `webpage-preview` | Mini browser iframe | no | no |
| `story-card` | Rich narrative with inline images | yes | no |
| `3d-model-viewer` | 3D model with rotation controls | no | no |

---

## 5. NanoClaw ↔ Frontend Streaming Protocol

A custom lightweight semantic protocol for card operations. All messages flow over the existing `vi:stream:{uid}` Redis channel → SSE → Frontend.

### 5.1 Message Format

Every message is a JSON object with an `op` (operation) field:

```json
{
  "op": "<operation>",
  "cardId": "<unique card identifier>",
  "timestamp": "<ISO 8601>",
  ...operation-specific fields
}
```

### 5.2 Operations

#### `create_card` — Create a new card

```json
{
  "op": "create_card",
  "cardId": "card_abc123",
  "template": "nutrition-card",
  "data": {
    "title": "Pasta Carbonara",
    "calories": 650,
    "protein_g": 25,
    "carbs_g": 72,
    "fat_g": 28,
    "photo_url": "https://..."
  },
  "position": "append"
}
```

- `template`: Template ID from the registry
- `data`: JSON matching the template's schema (can be partial for streamable cards)
- `position`: `"append"` (bottom of canvas) or `"prepend"` (top) or `"after:{cardId}"`

#### `stream_to_card` — Stream data into an existing card's slot

```json
{
  "op": "stream_to_card",
  "cardId": "card_abc123",
  "slot": "reasoning_steps",
  "chunk": "Step 3: Comparing nutritional density per 100g..."
}
```

- Used for progressive content loading (thinking process, long text, analysis)
- Chunks are appended to the slot's current value
- Frontend renders incrementally (typewriter effect for text, progressive list for arrays)

#### `update_card` — Mutate specific slots in a living card

```json
{
  "op": "update_card",
  "cardId": "card_abc123",
  "updates": {
    "items.2.checked": true,
    "footer_text": "3 of 5 items checked"
  }
}
```

- Dot-notation paths for nested updates
- Only works on slots marked `mutable` in the template schema
- Frontend applies minimal re-render on changed slots only

#### `append_to_card` — Add items to an array slot

```json
{
  "op": "append_to_card",
  "cardId": "card_abc123",
  "slot": "markers",
  "items": [
    { "lat": 37.78, "lng": -122.41, "label": "Blue Bottle Coffee" }
  ]
}
```

- For list-type slots: shopping items, map markers, gallery images
- Items are appended to the existing array

#### `replace_card` — Replace a card's template entirely

```json
{
  "op": "replace_card",
  "cardId": "card_abc123",
  "template": "nutrition-card",
  "data": { ... }
}
```

- Thinking card → final result card (template changes from `thinking-process` to `nutrition-card`)
- Smooth crossfade transition on the frontend

#### `finalize_card` — Mark a card as complete (no more mutations)

```json
{
  "op": "finalize_card",
  "cardId": "card_abc123"
}
```

- Card transitions from "streaming" to "complete" visual state
- Loading indicators removed, card becomes static
- Card is archived for session replay

#### `remove_card` — Remove a card from the canvas

```json
{
  "op": "remove_card",
  "cardId": "card_abc123",
  "reason": "superseded"
}
```

- Slide-out animation, card removed from DOM
- Used when AI decides a previous card is no longer relevant

#### `html_stream` — Freeform HTML escape hatch

```json
{
  "op": "html_stream",
  "cardId": "card_abc123",
  "chunk": "<div class='vi-card'>...</div>"
}
```

- Falls back to current PersistentHtmlRenderer behavior
- For content that no template covers
- Should be used sparingly — templates are preferred

### 5.3 Typical Card Stream Sequence

A typical NanoClaw execution produces this sequence:

```
1. create_card   → thinking-process (empty, streaming)
2. stream_to_card → thinking-process.steps (progressive reasoning)
3. stream_to_card → thinking-process.steps (more reasoning)
4. finalize_card  → thinking-process (reasoning complete)
5. create_card   → image-analysis (partial data)
6. stream_to_card → image-analysis.description
7. finalize_card  → image-analysis
8. create_card   → nutrition-card (full data, appears instantly)
9. finalize_card  → nutrition-card
```

User sees: thinking → analysis → result, all flowing in as a smooth waterfall.

### 5.4 User → Card Interactions (Upstream)

Cards can send events back to NanoClaw:

```json
{
  "op": "card_action",
  "cardId": "card_abc123",
  "action": "item_checked",
  "payload": { "index": 2, "checked": true }
}
```

These flow over the existing `vi:actions:{uid}` Redis stream. NanoClaw can respond with `update_card` mutations.

**Common card actions:**

| Action | Cards | Payload |
|--------|-------|---------|
| `item_checked` | checklist, shopping-list | `{ index, checked }` |
| `option_selected` | quiz, poll-vote | `{ optionId }` |
| `rating_set` | rating-review | `{ stars, text }` |
| `form_submitted` | form-input | `{ fields: {...} }` |
| `marker_tapped` | map-pins, map-navigation | `{ markerId }` |
| `slide_changed` | slideshow, before-after | `{ slideIndex }` |
| `draw_complete` | draw-canvas | `{ imageDataUrl }` |
| `add_to_calendar` | calendar-event | `{ eventId }` |
| `download_file` | file-download | `{ fileId }` |
| `card_dismissed` | any | `{}` |

---

## 6. Ten Detailed Template Specifications

These 10 templates span all 5 categories and demonstrate the full range of the protocol: streaming, mutation, interaction, and presentation.

### 6.1 `thinking-process` (Think)

**Purpose:** Shows AI reasoning chain in real-time. First card to appear in most sessions.

```json
{
  "$id": "thinking-process",
  "category": "think",
  "renderer": "html",
  "mutable": true,
  "streamable": true,
  "slots": {
    "title": {
      "type": "string",
      "default": "Thinking...",
      "streamable": true
    },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "content": { "type": "string" },
          "status": { "type": "string", "enum": ["active", "done", "skipped"] }
        }
      },
      "streamable": true
    },
    "conclusion": {
      "type": "string",
      "streamable": true
    }
  },
  "mutable_slots": ["steps", "conclusion"]
}
```

**Rendering:** Vertical step list. Active step pulses with accent color. Completed steps show checkmark. Conclusion appears below in bolder font when `finalize_card` is received.

**Lifecycle:** Often replaced via `replace_card` with the final result template once thinking is done.

---

### 6.2 `image-analysis` (Perceive)

**Purpose:** AI describes what it sees in a captured photo.

```json
{
  "$id": "image-analysis",
  "category": "perceive",
  "renderer": "html",
  "mutable": false,
  "streamable": true,
  "slots": {
    "photo_url": { "type": "string", "required": true },
    "title": { "type": "string", "streamable": true },
    "description": { "type": "string", "streamable": true },
    "detected_objects": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

**Rendering:** Photo as hero image (rounded, 16:9 crop). Title overlaid on photo bottom. Description streams below. Detected objects as pill badges. Tags as tiny chips.

---

### 6.3 `nutrition-card` (Perceive)

**Purpose:** Calorie and macro breakdown for food photos.

```json
{
  "$id": "nutrition-card",
  "category": "perceive",
  "renderer": "react",
  "component": "NutritionCardModule",
  "mutable": false,
  "streamable": true,
  "slots": {
    "food_name": { "type": "string", "required": true },
    "photo_url": { "type": "string" },
    "calories": { "type": "number", "required": true },
    "protein_g": { "type": "number" },
    "carbs_g": { "type": "number" },
    "fat_g": { "type": "number" },
    "fiber_g": { "type": "number" },
    "serving_size": { "type": "string" },
    "health_score": { "type": "number", "min": 0, "max": 10 },
    "recommendation": { "type": "string", "streamable": true },
    "daily_percent": {
      "type": "object",
      "properties": {
        "calories": { "type": "number" },
        "protein": { "type": "number" },
        "carbs": { "type": "number" },
        "fat": { "type": "number" }
      }
    }
  }
}
```

**Rendering:** React component. Photo banner, food name as title, macro ring chart (animated fill), daily % bars, recommendation text at bottom.

---

### 6.4 `shopping-list` (Act)

**Purpose:** Interactive shopping list with checkable items.

```json
{
  "$id": "shopping-list",
  "category": "act",
  "renderer": "react",
  "component": "ShoppingListModule",
  "mutable": true,
  "streamable": true,
  "slots": {
    "title": { "type": "string", "default": "Shopping List" },
    "items": {
      "type": "array",
      "streamable": true,
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "quantity": { "type": "string" },
          "category": { "type": "string" },
          "checked": { "type": "boolean", "default": false },
          "price_estimate": { "type": "string" }
        }
      }
    },
    "total_estimate": { "type": "string" },
    "store_suggestion": { "type": "string" }
  },
  "mutable_slots": ["items", "total_estimate"]
}
```

**Interactions:**
- User checks/unchecks items → `card_action: item_checked`
- NanoClaw can add items via `append_to_card`
- NanoClaw can update total via `update_card`
- Items grouped by category with section headers

---

### 6.5 `map-pins` (Act)

**Purpose:** Multi-point map with recommended locations.

```json
{
  "$id": "map-pins",
  "category": "act",
  "renderer": "react",
  "component": "MapPinsModule",
  "mutable": true,
  "streamable": false,
  "slots": {
    "title": { "type": "string" },
    "center": {
      "type": "object",
      "properties": {
        "lat": { "type": "number" },
        "lng": { "type": "number" }
      },
      "required": true
    },
    "zoom": { "type": "number", "default": 14 },
    "markers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "lat": { "type": "number" },
          "lng": { "type": "number" },
          "label": { "type": "string" },
          "description": { "type": "string" },
          "rating": { "type": "number" },
          "icon": { "type": "string" }
        }
      }
    },
    "selected_marker": { "type": "string" }
  },
  "mutable_slots": ["markers", "selected_marker", "center", "zoom"]
}
```

**Interactions:**
- Tap marker → expand info card below map, send `marker_tapped` action
- NanoClaw can add/remove markers via `append_to_card` / `update_card`
- Directions button opens native maps app

---

### 6.6 `calendar-event` (Act)

**Purpose:** Calendar event with "Add to Calendar" functionality.

```json
{
  "$id": "calendar-event",
  "category": "act",
  "renderer": "html",
  "mutable": true,
  "streamable": false,
  "slots": {
    "title": { "type": "string", "required": true },
    "start_time": { "type": "string", "format": "datetime" },
    "end_time": { "type": "string", "format": "datetime" },
    "location": { "type": "string" },
    "description": { "type": "string" },
    "attendees": {
      "type": "array",
      "items": { "type": "string" }
    },
    "reminder_minutes": { "type": "number", "default": 15 },
    "status": {
      "type": "string",
      "enum": ["pending", "added", "declined"],
      "default": "pending"
    }
  },
  "mutable_slots": ["status", "reminder_minutes"]
}
```

**Interactions:**
- "Add to Calendar" button → generates .ics file download
- Status updates to "added" after user adds
- NanoClaw can modify time/details via `update_card`

---

### 6.7 `quiz` (Interact)

**Purpose:** Interactive quiz with immediate feedback.

```json
{
  "$id": "quiz",
  "category": "interact",
  "renderer": "react",
  "component": "QuizModule",
  "mutable": true,
  "streamable": false,
  "slots": {
    "question": { "type": "string", "required": true },
    "options": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "text": { "type": "string" },
          "correct": { "type": "boolean" }
        }
      },
      "required": true
    },
    "explanation": { "type": "string" },
    "selected_option": { "type": "string" },
    "revealed": { "type": "boolean", "default": false },
    "image_url": { "type": "string" }
  },
  "mutable_slots": ["selected_option", "revealed", "explanation"]
}
```

**Interactions:**
- User taps option → `card_action: option_selected`
- NanoClaw responds with `update_card: { revealed: true, explanation: "..." }`
- Correct answer highlighted green, wrong highlighted red
- Can chain multiple quiz cards for a quiz game session

---

### 6.8 `comparison-table` (Think)

**Purpose:** Multi-column comparison matrix for decision making.

```json
{
  "$id": "comparison-table",
  "category": "think",
  "renderer": "html",
  "mutable": false,
  "streamable": true,
  "slots": {
    "title": { "type": "string", "streamable": true },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "image_url": { "type": "string" },
          "highlight": { "type": "boolean" }
        }
      }
    },
    "features": {
      "type": "array",
      "streamable": true,
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "values": { "type": "array", "items": { "type": "string" } },
          "category": { "type": "string" }
        }
      }
    },
    "verdict": { "type": "string", "streamable": true }
  }
}
```

**Rendering:** Horizontal scroll table. Column headers = items. Rows = features. Highlighted item column has accent border. Verdict streams below table.

---

### 6.9 `hero-image` (Present)

**Purpose:** Large image with title and description — the simplest presentation card.

```json
{
  "$id": "hero-image",
  "category": "present",
  "renderer": "html",
  "mutable": false,
  "streamable": true,
  "slots": {
    "image_url": { "type": "string", "required": true },
    "title": { "type": "string", "streamable": true },
    "subtitle": { "type": "string" },
    "description": { "type": "string", "streamable": true },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "action": { "type": "string" },
          "icon": { "type": "string" }
        }
      }
    }
  }
}
```

**Rendering:** Full-width image (rounded corners, max-height 300px). Title overlaid on image with gradient scrim. Description below. Action buttons as glass pills.

---

### 6.10 `conversation` (Interact)

**Purpose:** Embedded chat thread within the canvas — for focused back-and-forth on a specific topic.

```json
{
  "$id": "conversation",
  "category": "interact",
  "renderer": "react",
  "component": "ConversationModule",
  "mutable": true,
  "streamable": true,
  "slots": {
    "topic": { "type": "string" },
    "messages": {
      "type": "array",
      "streamable": true,
      "items": {
        "type": "object",
        "properties": {
          "role": { "type": "string", "enum": ["user", "ai"] },
          "content": { "type": "string" },
          "timestamp": { "type": "string" }
        }
      }
    },
    "input_placeholder": { "type": "string", "default": "Type a message..." },
    "resolved": { "type": "boolean", "default": false }
  },
  "mutable_slots": ["messages", "resolved"]
}
```

**Interactions:**
- User types and sends message → `card_action: message_sent`
- NanoClaw appends AI response via `append_to_card`
- Conversation can be marked resolved (collapsed to summary)
- Separate from the global voice conversation — this is topic-scoped

---

## 7. Card Persistence & Session Replay

### 7.1 Persistence Model

Every card operation is recorded as an event log. A session's card state can be reconstructed by replaying the event log.

```
Session Storage:
├── session_id: "sess_abc123"
├── created_at: "2026-03-04T10:30:00Z"
├── card_events: [           ← Ordered event log
│   { op: "create_card", cardId: "card_1", template: "thinking-process", ... },
│   { op: "stream_to_card", cardId: "card_1", slot: "steps", chunk: "..." },
│   { op: "finalize_card", cardId: "card_1" },
│   { op: "create_card", cardId: "card_2", template: "nutrition-card", ... },
│   ...
│ ]
├── final_state: {           ← Snapshot of all cards at session end
│   "card_1": { template: "thinking-process", data: {...}, status: "finalized" },
│   "card_2": { template: "nutrition-card", data: {...}, status: "finalized" },
│ }
└── media: ["photo_url_1", "photo_url_2"]
```

### 7.2 Session Replay

When user opens a past session from History:
1. Load `final_state` — instant render of all cards in their final form
2. No event replay needed for viewing (only for debugging/analytics)
3. Mutable cards load their last-known state (checklist items stay checked)

### 7.3 History View Card Previews

Each session in History shows a preview derived from:
- **Thumbnail:** First captured photo
- **Title:** Extracted from the first result card's title slot
- **Summary:** AI-generated one-line summary (stored in session metadata)
- **Card count:** "5 cards" badge

---

## 8. Session Canvas Layout

### 8.1 Waterfall Flow

Cards flow vertically in chronological order, newest at the bottom:

```
┌─────────────────────────────────┐
│ ┌─────┐                        │
│ │ PiP │  Active Camera          │
│ └─────┘                        │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🧠 Thinking Process        │ │  ← First card (always)
│ │ Step 1: Analyzing image... ✓│ │
│ │ Step 2: Detecting food...  ✓│ │
│ │ Step 3: Estimating macros   │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🔍 Image Analysis          │ │  ← Second card
│ │ [Photo]                    │ │
│ │ "Pasta Carbonara with..."  │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 📊 Nutrition Card          │ │  ← Result card
│ │ 650 kcal                   │ │
│ │ [Macro Ring Chart]         │ │
│ │ Protein: 25g  Carbs: 72g   │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ▋ Streaming...              │ │  ← Active streaming card
│ └─────────────────────────────┘ │
│                                 │
│ [🎤 Voice Input Bar]           │
└─────────────────────────────────┘
```

### 8.2 Card Sizing

| Rule | Value |
|------|-------|
| Width | `100% - 32px` (16px margin each side) |
| Min height | 80px |
| Max height | None (card grows to fit content) |
| Gap between cards | 12px |
| Card border radius | 16px |
| Active card glow | 1px accent border + subtle shadow pulse |

### 8.3 Auto-Scroll Behavior

- New card appears → smooth scroll to make it visible
- User scrolls up → auto-scroll pauses (don't fight the user)
- User scrolls back to bottom → auto-scroll resumes
- "Scroll to latest" FAB appears when user is scrolled up

### 8.4 Card Animations

| Event | Animation |
|-------|-----------|
| New card | Slide up + fade in (200ms) |
| Stream content | Typewriter for text, progressive fill for charts |
| Finalize card | Brief highlight flash (100ms) |
| Remove card | Slide left + fade out (200ms) |
| Replace card | Crossfade (300ms) |
| User interaction | Haptic feedback + micro-animation on element |

---

## 9. NanoClaw Template Selection

### 9.1 Template Context in System Prompt

NanoClaw's system prompt includes the template registry metadata — not the full schemas, but a concise map:

```
Available templates:
PERCEIVE: image-analysis, text-extraction, nutrition-card, plant-animal-id, ...
THINK: thinking-process, comparison-table, pros-cons, summary, ...
ACT: shopping-list, recipe, map-pins, calendar-event, checklist, ...
INTERACT: quiz, poll-vote, form-input, conversation, ...
PRESENT: hero-image, image-gallery, document, chart-data, ...
```

### 9.2 Selection Logic

NanoClaw follows this reasoning:

```
1. What cognitive act am I performing? → Category
2. What's the best template in this category? → Template ID
3. Does this template's schema cover my data? → Yes: use it. No: use freeform-html.
4. Should this card stream or arrive complete? → Streamable flag
5. Will this card need updates later? → Mutable flag
```

### 9.3 Multi-Card Orchestration

For complex tasks, NanoClaw produces **multiple cards in sequence**:

```
Food Analysis Session:
1. thinking-process    ← "Here's what I see and what I'll do"
2. image-analysis      ← "This is pasta carbonara"
3. nutrition-card      ← "Here are the macros"
4. recipe              ← "Here's how to make it healthier" (if relevant)
5. shopping-list       ← "Here's what you need" (if user wants to cook)
```

The card sequence tells a story — NanoClaw's cognitive process made visible.

---

## 10. Infrastructure Reference

Infrastructure phasing (Phase 0 → Phase 1 → Phase 2) is unchanged from `architecture-v5.md`. The Card Template Protocol is infrastructure-agnostic — it works identically on a single GCE or a scaled MIG cluster.

**Key integration points:**
- Cards flow over the existing `vi:stream:{uid}` Redis channel
- SSE relay in api-server forwards card operations to frontend
- No new services required — NanoClaw generates card operations instead of raw HTML
- Template files are served as static assets by the frontend (bundled or lazy-loaded)

---

## 11. Migration Path (Current → Card Template Protocol)

### Phase A: Protocol Layer (No Breaking Changes)

1. Define the 10 core template schemas
2. Add `op` field parsing to frontend SSE handler (`useNanoClawResults.js`)
3. NanoClaw wraps existing HTML output in `create_card + html_stream` operations
4. All existing behavior preserved — just wrapped in protocol messages

### Phase B: Template Renderers

1. Convert existing 8 React modules to template-protocol-aware components
2. Create HTML template files for new card types
3. Build Template Engine in frontend (dispatches `template` → renderer)
4. NanoClaw starts using structured JSON for template-based cards

### Phase C: Living Cards

1. Implement `update_card` and `append_to_card` mutation handling
2. Add `card_action` upstream channel
3. Enable interactive card behaviors (checklist checking, quiz answering)
4. Implement card persistence and session replay

### Phase D: Camera PiP

1. Implement PiP state machine in frontend
2. Add Camera→Session transition animation
3. Keep LiveKit tracks active during PiP mode
4. Test voice conversation continuity in PiP mode

---

*VI Agent System v5 — Card Template Architecture | 2026-03-04*
*From raw HTML streams to structured AI cognition, made visible.*
