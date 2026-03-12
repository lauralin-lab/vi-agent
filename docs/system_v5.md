# VI Agent — System v5: Card Template Architecture

> **Last Updated:** 2026-03-04
>
> **Builds on:** architecture-v5.md (infrastructure phasing — see `docs/.archived/`)
>
> **Extended by:** system_v5.2.md (Skills, Experience Packages, and the Development Loop)
>
> **Scope:** This document defines the **Experience Package Architecture**, **Card Template Protocol**, **Camera→Session Dual World Architecture**, **NanoClaw Streaming Protocol**, and **NanoClaw Core Backend Architecture** — the technical systems that power the Session Canvas experience and all downstream output channels.

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

## 5. NanoClaw Streaming Protocol

A custom lightweight semantic protocol for card operations. All messages flow over the `vi:stream:{uid}` Redis channel. Downstream consumers (Frontend via SSE, Realtime Agent, Platform Adapters) subscribe independently — see §10.5 for multi-destination fan-out.

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

## 10. Backend Architecture — NanoClaw Core

> **NanoClaw is the heart of the system.** Every user interaction, every card stream, every proactive task flows through NanoClaw. The backend is designed around a single principle: **NanoClaw owns user cognition; everything else is I/O plumbing.**

### 10.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND / CLIENTS                              │
│   VI App (SSE)  │  LiveKit Voice  │  Telegram  │  WhatsApp  │  飞书     │
└───────┬─────────┴────────┬────────┴──────┬─────┴──────┬─────┴──────┬───┘
        │                  │               │            │            │
        ▼                  ▼               ▼            ▼            ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐
│  api-server   │  │  Realtime    │  │     Platform Adapters            │
│  (I/O Gateway)│  │  Agent       │  │  (subscribe Redis, push to       │
│  - Auth       │  │  (LiveKit)   │  │   Telegram/WA/飞书 APIs)         │
│  - SSE Relay  │  │  - Voice I/O │  └──────────────┬───────────────────┘
│  - File Proxy │  │  - Keyframes │                  │
└───────┬───────┘  └──────┬───────┘                  │
        │                 │                           │
        └────────┬────────┴───────────────────────────┘
                 │              All via Redis PUB/SUB
                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          REDIS (Event Bus)                               │
│                                                                          │
│  vi:queue         ← Task queue (competing consumers)                     │
│  vi:stream:{uid}  ← Streaming output (fan-out to all subscribers)        │
│  vi:ctx:{uid}     ← Context snapshots (NanoClaw → Realtime Agent)        │
│  vi:exec:{uid}    ← Direct execution requests                           │
│  vi:actions:{uid} ← User action stream                                   │
│  vi:frames:{uid}  ← Keyframe events                                      │
│  vi:media:{uid}   ← Media capture notifications                          │
│  vi:cron:{uid}    ← Distributed lock for cron jobs                       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     NANOCLAW PROCESS POOL                                │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       ┌────────────┐   │
│  │ NanoClaw-1 │  │ NanoClaw-2 │  │ NanoClaw-3 │  ...  │ NanoClaw-N │   │
│  │            │  │            │  │            │       │            │   │
│  │ executor   │  │ executor   │  │ executor   │       │ executor   │   │
│  │ orchestr.  │  │ orchestr.  │  │ orchestr.  │       │ orchestr.  │   │
│  │ runner     │  │ runner     │  │ runner     │       │ runner     │   │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘       └─────┬──────┘   │
│        │               │               │                     │          │
│        └───────────┬────┴───────────────┴─────────────────────┘          │
│                    │  On-demand user data loading                        │
│                    ▼                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                    USER DATA VOLUMES (GCS/S3)                    │    │
│  │                                                                  │    │
│  │  /users/{uid-A}/          /users/{uid-B}/         ...            │    │
│  │  ├── memory/              ├── memory/                            │    │
│  │  ├── sessions/            ├── sessions/                          │    │
│  │  ├── skills/              ├── skills/                            │    │
│  │  ├── groups/              ├── groups/                            │    │
│  │  ├── cloud_settings/      ├── cloud_settings/                    │    │
│  │  └── cron/                └── cron/                              │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│               ┌──────────┐              ┌──────────────────┐            │
│               │PostgreSQL│              │    GCS / S3       │            │
│               │(auth +   │              │  (per-user data   │            │
│               │ index)   │              │   persistence)    │            │
│               └──────────┘              └──────────────────┘            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 10.2 NanoClaw Process Pool (M:N Model)

NanoClaw processes form a **pool** that serves all users. The ratio of processes to users is configurable (e.g., 10 processes : 100 users).

**Key properties:**

| Property | Description |
|----------|-------------|
| Process identity | Stateless — any process can serve any user |
| User binding | On-demand, per-request (not permanent) |
| Data loading | Pull from GCS on first request, LRU cache on local disk |
| Concurrency | Each process handles one task at a time per user |
| Pool size | Configurable: `NANOCLAW_POOL_SIZE` env var |
| Scaling unit | Process (add more processes = serve more users) |

**Request flow:**

```
1. Request arrives (vi:exec:{uid} or vi:queue)
2. Any idle NanoClaw process picks it up (Redis competing consumers)
3. Process checks local cache for user data
   ├── Cache HIT → proceed immediately
   └── Cache MISS → pull /users/{uid}/ from GCS (~200ms cold start)
4. Process loads user context (memory, skills, settings)
5. Process executes task with full user context (Claude SDK)
6. Results stream to vi:stream:{uid}
7. Changed files sync back to GCS asynchronously
8. Process releases — ready for next request (any user)
```

**LRU cache policy:**

- Each process maintains a local disk cache of recently-served users' data
- Cache size: configurable (default: 20 users per process)
- Eviction: LRU — least recently accessed user data is evicted first
- Write-back: after task completion, changed files sync to GCS asynchronously
- Cache warm-up: popular users' data can be pre-loaded at process startup

### 10.3 Per-User Data Volume

Each user's complete data lives under a single prefix in object storage: `/users/{uid}/`. This is the **single source of truth** for all user-specific state.

```
/users/{uid}/
├── memory/
│   ├── identity/           # Who the user is (SOUL.md, USER.md)
│   ├── semantic/           # Knowledge, preferences, learned facts
│   └── episodic/           # Daily logs (YYYY-MM-DD.md)
├── sessions/
│   └── {session_id}/       # Session event logs + final state
│       ├── events.json     # Card event log
│       └── final_state.json
├── skills/                 # User's custom skills
│   └── {slug}/
│       ├── manifest.json
│       └── skill.md
├── groups/                 # Group memberships and shared contexts
│   └── {group_id}/
│       ├── config.json     # Group settings, members
│       └── shared_memory/  # Group-level shared knowledge
├── cloud_settings/         # User preferences and configurations
│   ├── preferences.json    # UI preferences, language, timezone
│   ├── integrations.json   # Connected platforms (TG, WA, 飞书)
│   └── notifications.json  # Notification preferences
├── tokens/                 # OAuth tokens (encrypted at rest)
│   └── {provider}.json
├── cron/                   # Scheduled tasks
│   └── schedule.json       # Cron job definitions
├── media/                  # Media references (actual files in GCS)
│   └── index.json
└── .meta/
    └── last_active.json    # Last activity timestamp, cache hints
```

**Design principles:**

1. **Completeness** — everything NanoClaw needs to serve a user is in this volume
2. **Portability** — the entire volume can be moved, backed up, or migrated as one unit
3. **Isolation** — process A serving user X cannot access user Y's data
4. **Filesystem-native** — NanoClaw reads `.md` and `.json` files directly, no DB queries

### 10.3.1 Data Persistence Matrix — What Lives Where

NanoClaw processes handle user data at three levels. **This matrix is the definitive reference for what data needs persistent storage.**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 1: PROCESS MEMORY (ephemeral — lost on crash/restart)       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ • Claude SDK conversation state (in-flight turns)            │  │
│  │ • In-flight card streaming buffers                           │  │
│  │ • Redis PUB/SUB subscription handles                        │  │
│  │ • Tool execution intermediate results                       │  │
│  │ • LRU cache index (which users are cached locally)           │  │
│  │ • WebSocket/SSE connection state                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                          │ periodic flush                          │
│                          ▼                                          │
│  Layer 2: MOUNTED DISK (survives restart, single-node, fast I/O)   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ • LRU user data cache (/cache/users/{uid}/)                  │  │
│  │ • Active session write buffer (crash recovery)               │  │
│  │ • Package/template registry (built at startup)               │  │
│  │ • Tool runtime artifacts (temp media, processing scratch)    │  │
│  │ • Process logs & metrics                                     │  │
│  │ • Embedding cache (frequently-used user vectors)             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                          │ async sync (write-back)                 │
│                          ▼                                          │
│  Layer 3: OBJECT STORAGE — GCS/S3 (source of truth, replicated)   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ • Per-user data volumes (/users/{uid}/)                      │  │
│  │ • Media files (photos, videos, generated assets)             │  │
│  │ • Package definitions (packages/)                            │  │
│  │ • System configuration                                       │  │
│  │ • Backups & audit logs                                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Per-User Data — Detailed Persistence Breakdown

Every piece of user data that NanoClaw generates or mutates is classified below. **If it's not on this list, it doesn't get persisted.**

| Data Category | What's In It | Generated When | Write to Mounted Disk | Sync to GCS | Size Estimate (per user) |
|---|---|---|---|---|---|
| **Identity Memory** | `SOUL.md`, `USER.md` — who the user is, core traits | First interactions, updated rarely | ✅ Immediate | ✅ On change | ~5-20 KB |
| **Semantic Memory** | Learned preferences, knowledge, facts about user | During/after sessions (consolidation) | ✅ Immediate | ✅ On change | ~50-500 KB (grows) |
| **Episodic Memory** | Daily interaction logs (`YYYY-MM-DD.md`) | End of each session | ✅ Immediate | ✅ On session end | ~2-10 KB/day |
| **Session Event Log** | Card operations stream (`events.json`) | During active session | ✅ Buffered (every 30s) | ✅ On session finalize | ~20-200 KB/session |
| **Session Final State** | Snapshot of all cards at session end | Session completion | ✅ Immediate | ✅ Immediate | ~10-100 KB/session |
| **Session Media** | Photos, videos captured during session | On capture | ❌ Direct to GCS | ✅ Immediate | ~1-50 MB/session |
| **Custom Skills** | User-created skill definitions | User explicit action | ✅ Immediate | ✅ On change | ~5-50 KB/skill |
| **Cloud Settings** | Preferences, language, timezone, UI config | User changes settings | ✅ Immediate | ✅ On change | ~2-5 KB |
| **Integration Config** | Connected platforms (TG, WA, 飞书), OAuth state | User connects platform | ✅ Immediate | ✅ On change | ~1-3 KB |
| **OAuth Tokens** | Encrypted access/refresh tokens per provider | OAuth flow completion | ✅ Encrypted, immediate | ✅ Encrypted | ~1-2 KB/provider |
| **Cron State** | Scheduled tasks, last-run timestamps | User sets up / system updates | ✅ Immediate | ✅ On change | ~2-5 KB |
| **Group Data** | Group config, shared memories | Group actions | ✅ Immediate | ✅ On change | ~10-100 KB/group |
| **Media Index** | References to GCS media objects | On media capture | ✅ Immediate | ✅ On change | ~5-20 KB |
| **Generated Assets** | AI-generated images, videos, 3D models, audio | Tool execution | ❌ Direct to GCS | ✅ Immediate | ~5-500 MB/asset |
| **Conversation Buffer** | In-progress conversation turns (crash recovery) | During active session | ✅ Buffered (every 10s) | ❌ Not synced (ephemeral) | ~5-50 KB |
| **Embedding Cache** | User's frequently-used vector embeddings | On embedding generation | ✅ Cache only | ❌ Re-generable | ~1-10 MB |

#### Critical Data Flow Patterns

**Pattern 1: Session Write Buffer (crash recovery)**

```
During active session:
  Claude SDK response → card ops → Redis publish (real-time)
                                  → append to session buffer on disk (every 10s)

  If process crashes mid-session:
    New process picks up user → reads last buffer from disk
    → resumes from last checkpoint (user sees brief interruption, no data loss)

  On session finalize:
    Flush complete event log to disk → sync to GCS → delete buffer
```

**Pattern 2: Memory Write-Back**

```
During session:
  NanoClaw learns something about user
  → writes to memory/ on mounted disk immediately
  → queues GCS sync (async, batched every 60s or on session end)

  On process restart:
    Pull latest from GCS (GCS always wins over stale local cache)
```

**Pattern 3: Large Media (bypass disk cache)**

```
User captures photo/video or AI generates media:
  → Stream directly to GCS (never touch mounted disk cache)
  → Store GCS reference in session event log + media/index.json
  → Frontend fetches via signed URL from GCS

  Why: Media files are large (MB-GB). Writing to disk then syncing
       doubles I/O and wastes cache space. GCS is the only copy.
```

#### Mounted Disk Requirements

| Mount Point | Purpose | Recommended Size | I/O Pattern |
|---|---|---|---|
| `/data/cache/` | LRU user data cache | 10 GB per NanoClaw process × cache_size_users | Read-heavy, write-on-sync |
| `/data/sessions/` | Active session write buffers | 1 GB (rotating) | Write-heavy, sequential |
| `/data/tmp/` | Tool execution scratch space | 5 GB (auto-cleanup) | Write-heavy, short-lived |
| `/data/registry/` | Package/template registry | 500 MB | Read-only after startup |
| `/data/logs/` | Process logs & metrics | 2 GB (rotating) | Append-only |
| `/data/embeddings/` | Embedding vector cache | 5 GB (LRU eviction) | Read-heavy |

**Total per NanoClaw node: ~25-50 GB mounted persistent disk (SSD recommended)**

#### Data Loss Risk Matrix

| Failure Scenario | Data at Risk | Recovery Method | Max Data Loss |
|---|---|---|---|
| Process crash | In-flight card stream | Session buffer on disk | Last 10s of cards |
| Process crash | Current conversation turn | Re-prompt from buffer | Current turn only |
| Disk failure | LRU cache | Re-pull from GCS | Zero (GCS is source of truth) |
| Disk failure | Unbuffered session data | Lost | Last 10s of session |
| GCS outage | New writes | Queue on disk, retry | Zero (disk buffers) |
| GCS data loss | All user data | Cross-region replication | Zero (if replicated) |

### 10.4 Orchestrator & Runner

Each NanoClaw process contains an **orchestrator** (scheduler) and **runner** (executor) for proactive tasks. This avoids a separate orchestrator service — coordination happens via Redis distributed locks.

```
┌─────────────────────────────────────────────┐
│              NanoClaw Process                │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │           TASK EXECUTOR               │  │
│  │  - User-initiated tasks               │  │
│  │  - vi:queue / vi:exec:{uid} consumer  │  │
│  │  - Card streaming output              │  │
│  │  - Skill execution (Claude SDK)       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │        ORCHESTRATOR + RUNNER          │  │
│  │  - Scans cached users' cron schedules │  │
│  │  - Heartbeat (context compile loop)   │  │
│  │  - Proactive task generation          │  │
│  │  - Redis SETNX for distributed lock   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │         CONTEXT COMPILER              │  │
│  │  - 30s heartbeat cycle                │  │
│  │  - Memory + scene → context snapshot  │  │
│  │  - Intention prediction (Haiku)       │  │
│  │  - Publish to vi:ctx:{uid}            │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Cron job coordination** via Redis distributed lock:

```
1. Process scans its cached users' cron/schedule.json
2. For each due job: SETNX vi:cron:{uid}:{job_id} with TTL
   ├── Lock acquired → execute the job
   └── Lock exists → another process is handling it, skip
3. After execution: update schedule.json, sync to GCS, release lock
```

**Task priority:** User-initiated tasks (via `vi:exec`) always preempt cron jobs. If a process is executing a cron job when a user request arrives, the cron job is queued (not interrupted) and the user task is handled by another pool process.

**Proactive task types:**

| Task Type | Trigger | Example |
|-----------|---------|---------|
| Context Heartbeat | Every 30s per active user | Compile context, predict intentions |
| Daily Summary | Cron (configurable) | "Good morning, here's your day" |
| Memory Consolidation | Cron (nightly) | Merge episodic → semantic memory |
| Skill Auto-trigger | Event-based (media upload) | Auto-analyze new photo |
| Group Sync | On group data change | Sync shared memory to members |

### 10.5 Streaming Channel — Multi-Destination Fan-Out

NanoClaw's output always goes to `vi:stream:{uid}` (Redis PUB/SUB). **NanoClaw never knows or cares who is listening.** Downstream consumers subscribe independently.

```
                          NanoClaw
                             │
                     publish to Redis
                     vi:stream:{uid}
                             │
              ┌──────────────┼──────────────────────┐
              │              │                      │
              ▼              ▼                      ▼
        ┌──────────┐  ┌───────────┐         ┌──────────────┐
        │SSE Relay │  │ Realtime  │         │  Platform    │
        │(api-srv) │  │ Agent     │         │  Adapters    │
        │          │  │           │         │              │
        │ subscribe│  │ subscribe │         │ subscribe    │
        │ vi:stream│  │ vi:stream │         │ vi:stream    │
        │ → SSE →  │  │ → voice   │         │ → Telegram   │
        │ Frontend │  │   output  │         │ → WhatsApp   │
        │          │  │           │         │ → 飞书        │
        └──────────┘  └───────────┘         └──────────────┘
```

**Subscriber responsibilities:**

| Subscriber | Reads | Transforms to | Output |
|-----------|-------|--------------|--------|
| api-server SSE Relay | `vi:stream:{uid}` | SSE events | Frontend EventSource |
| Realtime Agent | `vi:stream:{uid}` + `vi:ctx:{uid}` | Voice narration | LiveKit audio track |
| Platform Adapter (TG) | `vi:stream:{uid}` | Telegram message format | Telegram Bot API |
| Platform Adapter (WA) | `vi:stream:{uid}` | WhatsApp message format | WhatsApp Business API |
| Platform Adapter (飞书) | `vi:stream:{uid}` | Feishu message card | Feishu Open API |

**Card-to-platform translation:**

All stream messages use the Card Template Protocol operations (§5). Platform Adapters translate card operations into platform-native formats:

| Card Operation | Telegram | WhatsApp | 飞书 |
|---------------|----------|----------|------|
| `create_card: thinking-process` | "🧠 Thinking..." message | Status message | Interactive card |
| `stream_to_card` | Edit message in-place | Buffer, send on finalize | Update card content |
| `create_card: nutrition-card` | Formatted text + photo | Rich message | Message card |
| `finalize_card` | Final formatted message | Complete message | Final card |
| `create_card: map-pins` | Location messages | Location pins | Map card link |

**User-to-platform binding** (stored in user volume):

```json
// /users/{uid}/cloud_settings/integrations.json
{
  "platforms": {
    "telegram": { "chat_id": "123456", "enabled": true },
    "whatsapp": { "phone": "+1234567890", "enabled": false },
    "feishu":   { "user_id": "ou_xxx", "enabled": true }
  },
  "default_output": "app"
}
```

Platform Adapters read this config to decide whether to forward streams for a given user.

### 10.6 Service Responsibility Matrix

With NanoClaw as the heart, each service has a sharply defined role:

| Service | Owns | Does NOT Own |
|---------|------|-------------|
| **NanoClaw** | AI execution, user data, memory, skills, sessions, context compilation, cron/orchestration, streaming output | Auth, HTTP routing, SSE delivery, voice I/O |
| **api-server** | Auth (JWT/Firebase), SSE relay, file proxy to GCS, HTTP API surface | Business logic, session management, memory operations |
| **Realtime Agent** | Voice I/O (LiveKit), keyframe capture, context subscription, voice narration | Task execution, memory, data persistence |
| **Platform Adapters** | Protocol translation (card ops → platform format), platform API calls | AI logic, data storage, user management |
| **PostgreSQL** | User auth records, user→volume index, global metadata | Session content, memory content, skill data |
| **Redis** | Event bus (PUB/SUB), task queue, distributed locks, activity cache | Persistent data |
| **GCS/S3** | Per-user data volume persistence, media storage | Computation |

**api-server endpoint evolution:**

| Endpoint | Current Role | Target Role |
|----------|-------------|-------------|
| `/api/auth/*` | Auth + user CRUD | **Unchanged** — auth remains core |
| `/api/users/events` | SSE relay | **Unchanged** — I/O plumbing |
| `/api/users/exec` | Dispatch to NanoClaw | **Unchanged** — thin proxy to Redis |
| `/api/sessions/*` | Session CRUD (DB queries) | **Thin proxy** — reads from GCS |
| `/api/memory/*` | Memory CRUD (DB queries) | **Removed** — NanoClaw reads files directly |
| `/api/skills/*` | Skill management (DB queries) | **Removed** — NanoClaw reads from user volume |
| `/api/fs/*` | File proxy to GCS | **Unchanged** — NanoClaw uses for GCS sync |

### 10.7 Scalability Design

The architecture scales horizontally at every layer. No architectural changes are needed to go from demo to production scale.

```
Phase 0 (Demo)          Phase 1 (100 users)       Phase 2 (1000+ users)
─────────────────       ───────────────────────    ──────────────────────────
Single GCE              Single GCE (bigger)        Multi-GCE / K8s

NanoClaw ×1             NanoClaw ×10               NanoClaw ×N (autoscale)
api-server ×1           api-server ×1              api-server ×2+ (LB)
Realtime ×1             Realtime ×10               Realtime ×N (autoscale)
Redis (Docker)          Redis (Docker)             Redis (Memorystore)
PostgreSQL (Docker)     PostgreSQL (Docker)        Cloud SQL
GCS (single bucket)     GCS (single bucket)        GCS (multi-regional)
—                       —                          Platform Adapters ×1+
```

**Scaling levers:**

| Lever | Mechanism | Trigger |
|-------|-----------|---------|
| Add NanoClaw processes | Increase `NANOCLAW_POOL_SIZE` | Task queue latency > 2s |
| Add machines | Docker Compose → K8s pods | Single machine saturated |
| Separate Redis | Docker → Memorystore | Redis memory > 4GB or connections > 1000 |
| Separate PostgreSQL | Docker → Cloud SQL | Auth reliability requirements |
| Add Platform Adapters | Deploy per platform | New platform integration needed |
| Regional deployment | Multi-region GCS + GCE | Latency for non-US users |

**What makes this scalable:**

1. **Stateless processes** — any NanoClaw can serve any user; no sticky routing required
2. **Object storage as source of truth** — GCS scales infinitely; no DB migration needed
3. **Redis as coordination layer** — PUB/SUB naturally distributes; queue naturally load-balances
4. **No service-to-service sync** — services communicate via Redis, not direct HTTP calls
5. **Per-user data isolation** — no shared tables, no lock contention, no query bottlenecks
6. **Linear scaling** — 2× users ≈ 2× NanoClaw processes; no superlinear cost growth

---

## 11. Migration Path (Current → Card Template Protocol + NanoClaw Core)

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

### Phase E: NanoClaw Process Pool

1. Refactor NanoClaw from single-user (`USER_ID` env var) to pool-aware multi-user
2. Implement Redis competing consumer for `vi:queue` task queue
3. Implement LRU user data cache with GCS pull/push
4. Implement Redis SETNX distributed lock for cron job coordination
5. Remove session/memory/skill CRUD from api-server (NanoClaw reads files directly)
6. Migrate user data from PostgreSQL tables to per-user GCS volumes

### Phase F: Per-User Data Volume Migration

1. Export existing PostgreSQL memory/session data to `/users/{uid}/` GCS structure
2. Add `groups/` and `cloud_settings/` to user volume schema
3. NanoClaw reads all user state from volume (zero DB queries for user data)
4. PostgreSQL reduced to auth + user-volume-index tables only

### Phase G: Multi-Platform Output

1. Deploy Platform Adapter service (Telegram first)
2. Platform Adapter subscribes to `vi:stream:{uid}`, translates card ops to Telegram messages
3. Add WhatsApp and 飞书 adapters
4. User `integrations.json` controls which platforms receive streams

---

## 12. Complete Tool & API Catalog — "The Capability Palette"

> **Purpose:** This is the comprehensive registry of ALL external APIs, models, and connectors available to NanoClaw for building Experience Packages (Skills). Each entry represents a capability that skill builders can compose into end-to-end user experiences.
>
> **Usage:** Growth team references this catalog when designing new Experience Packages. API keys are provisioned incrementally — the catalog is the planning document; actual integration follows demand.
>
> **Convention:** Each entry shows `[REST]` for HTTP REST API, `[SDK]` for SDK-based access, `[WS]` for WebSocket, `[gRPC]` for gRPC. Entries marked `★` are primary/preferred providers for that capability.

---

### 12.1 Large Language Models (LLM) — The Brain Layer

NanoClaw's primary cognitive engine. Different models for different cost/quality trade-offs.

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **Anthropic** ★ | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | General reasoning, coding, analysis, vision. 200K context | `[REST]` `[SDK]` | Primary brain. $5/$25 per 1M tokens (Opus). Sonnet for daily, Haiku for speed/cost |
| **OpenAI** | GPT-5.2, GPT-5.2 Pro, GPT-5.2-Codex, o3, o3-mini | General reasoning, coding, reasoning chains. 128K+ context | `[REST]` `[SDK]` | $1.75/$14 per 1M tokens (GPT-5.2). o3 for math/logic reasoning |
| **Google** | Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3 Ultra | Multimodal (text+image+video+audio). 1M context | `[REST]` `[SDK]` | $2/$12 (Pro), $0.50/$3 (Flash). Native multimodal. Spokesperson (voice) |
| **xAI** | Grok 4.1, Grok 4.1 Fast | General reasoning. **2M context** (largest) | `[REST]` | $0.20/$0.50 per 1M tokens. Most cost-efficient. Open-weight 314B |
| **DeepSeek** | DeepSeek V3.2, DeepSeek R1 | Reasoning, math, coding. MIT license | `[REST]` | 95% cheaper than o1. R1 matches o1 on math. Trained for $294K |
| **Alibaba** | Qwen 3 (up to 110B), Qwen 2.5 series | Multilingual (119 languages), math (92.3% AIME25) | `[REST]` `[SDK]` | Apache 2.0. Best multilingual |
| **Mistral AI** | Mistral Large 3 (675B MoE/41B active), Small 3 (24B) | European LLM, GDPR-compliant | `[REST]` `[SDK]` | Apache 2.0. EU data sovereignty |
| **Meta** | Llama 4, Llama 3.3 (up to 405B) | Open-weight, self-hostable | `[REST]` via providers | Via Together AI, Fireworks, Groq, Replicate |
| **Cohere** | Command R+, Command R | RAG-optimized, enterprise search | `[REST]` `[SDK]` | Best for retrieval-augmented generation |
| **Together AI** | Hosts: Llama, Mistral, Qwen, DeepSeek, etc. | Inference hosting for open models | `[REST]` | One API for many open-source models |
| **Fireworks AI** | Hosts: Llama, Mistral, etc. | Ultra-fast inference, function calling | `[REST]` | Optimized for low latency |
| **Groq** | Hosts: Llama, Mistral, Gemma | Hardware-accelerated (LPU) inference | `[REST]` | Fastest open-model inference |
| **OpenRouter** | Routes to 100+ models | Unified router with fallback | `[REST]` | Single endpoint, model routing |

**Routing Strategy:** NanoClaw selects model per-task based on complexity, cost, and latency requirements. Skill manifests can specify preferred model.

---

### 12.2 Vision & Image Understanding

| Provider | API/Model | Capability | API Type | Notes |
|---|---|---|---|---|
| **Claude Vision** ★ | Built into Claude models | Image understanding, analysis, OCR | `[REST]` | Primary vision. Part of LLM call |
| **GPT-4V / GPT-5.2 Vision** | Built into GPT models | Image understanding, analysis | `[REST]` | Alternative vision |
| **Gemini Vision** | Built into Gemini models | Image + video understanding | `[REST]` | Can process video natively |
| **Google Cloud Vision** | Cloud Vision API | Object detection, OCR, face detection, labels, logos, landmarks, explicit content | `[REST]` | Production OCR and detection |
| **AWS Rekognition** | Rekognition API | Face analysis, celebrity recognition, object detection | `[REST]` `[SDK]` | AWS ecosystem |
| **Azure Computer Vision** | Azure AI Vision | OCR, image analysis, spatial analysis | `[REST]` `[SDK]` | Azure ecosystem |
| **Twelve Labs** | Understand API | Video understanding, semantic search in video | `[REST]` | Search within video content |
| **Roboflow** | Inference API | Custom object detection models | `[REST]` | Train & deploy custom detection |
| **Clarifai** | Predict API | Visual recognition, moderation, face detection | `[REST]` `[SDK]` | Multi-model visual AI |

---

### 12.3 Image Generation

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **OpenAI** ★ | GPT Image 1.5 / gpt-image-1 | Text-to-image, editing. Best text rendering (Elo 1,264) | `[REST]` | $0.04/image. Integrated with GPT for iterative editing |
| **Stability AI** | Stable Diffusion 3.5, SDXL, SD3 Turbo | Text-to-image, img2img, inpainting, outpainting | `[REST]` | Most customizable. ControlNet support. Open-weight |
| **Black Forest Labs** | Flux 2 Pro, Flux Dev, Flux Schnell | Text-to-image, photorealism leader | `[REST]` | $0.055 (Pro), $0.025 (Dev), $0.015 (Schnell). Via FAL/Replicate |
| **Midjourney** | Midjourney v7 | Text-to-image, aesthetic quality leader | ❌ No API | Discord-only. Best artistic quality |
| **Ideogram** | Ideogram 3.0 | Text-to-image, 90% text rendering accuracy | `[REST]` | $0.03/image. Best for typography/design |
| **Google** | Imagen 4 (Fast/Standard/Ultra) | Text-to-image, first-class text rendering | `[REST]` | $0.02-0.06/image. Via Vertex AI |
| **Leonardo.AI** | Leonardo models | Text-to-image, game assets, textures | `[REST]` | Game/design focused |
| **Recraft** | Recraft V3 | Vector art, brand-consistent design | `[REST]` | SVG/vector output |
| **Adobe Firefly** | Firefly Image 3 | Commercially-safe image gen (trained on licensed data) | `[REST]` | GDPR-compliant enterprise |
| **ByteDance** | Seedream 4.5 | Competitive quality at lower cost | `[REST]` (limited) | Emerging competitor |
| **FAL.ai** ★ | Hosts: Flux, SDXL, SD3.5, Ideogram, etc. | Unified API for image models | `[REST]` | Fast inference, single billing |
| **Replicate** | Hosts: 1000+ models | Run any ML model via API | `[REST]` | Broadest model selection |
| **Clipdrop (Stability)** | Background removal, upscale, etc. | Image editing utilities | `[REST]` | Practical image tools |

---

### 12.4 Video Generation & Processing

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **OpenAI** | Sora 2 | Text/image-to-video, up to 35s. Native audio/SFX gen | `[REST]` | High quality cinematic. Limited access |
| **Google** | Veo 3 / Veo 3.1 | Text-to-video, native audio gen. Elo 1,226 | `[REST]` | Via Vertex AI. State-of-art quality |
| **Runway** ★ | Gen-4 / Gen-4.5 Turbo | Text-to-video, image-to-video. Elo 1,247 (benchmark leader) | `[REST]` | Most mature API. Python & Node SDKs |
| **Kling** | Kling 2.0 / 2.6 | Text-to-video, up to 120s. Native audio-visual sync (v2.6) | `[REST]` | Kuaishou. Strong motion quality |
| **Luma AI** | Dream Machine, Ray 2 | Text-to-video, 3D-aware with depth understanding | `[REST]` | Good for realistic motion |
| **Pika Labs** | Pika 2.0 | Text-to-video, ~$0.03/gen | `[REST]` | Quick stylized video |
| **Vidu** | Vidu 2.0 | Text-to-video, ~$0.0375/sec (55% cheaper than avg) | `[REST]` | 生数科技. MaaS launched Feb 2025 |
| **Minimax** | Hailuo | Text-to-video | `[REST]` | Chinese provider |
| **HeyGen** ★ | Avatar API | Avatar video, lip-sync, dubbing (175+ languages) | `[REST]` | Best for avatar/spokesperson |
| **Synthesia** | Studio API | AI avatar video from text | `[REST]` | Enterprise avatar video |
| **D-ID** | Live Portrait, Creative Reality | Talking head, photo animation | `[REST]` | Photo-to-talking-video |
| **Tavus** | Phoenix Model | Personalized video at scale, conversational video AI | `[REST]` | Video personalization |
| **Mux** | Video API | Video hosting, streaming, analytics | `[REST]` | Video infrastructure |
| **Cloudinary** | Video API | Video transcoding, editing, delivery | `[REST]` | Video processing pipeline |
| **FFmpeg** | CLI/library | Video transcoding, editing | `[CLI]` | Local processing |

---

### 12.5 3D Generation & Processing

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **Meshy** ★ | Meshy-4 | Text-to-3D, image-to-3D, texturing | `[REST]` | Most accessible 3D gen API |
| **Tripo3D** | TripoSR, Tripo 2.5 | Image-to-3D, fast reconstruction | `[REST]` | Fast single-image 3D |
| **CSM.ai** | World Model API | Image-to-3D, text-to-3D | `[REST]` | Common Sense Machines |
| **Rodin** | Rodin Gen-2 | Text-to-3D, image-to-3D | `[REST]` | Deemos. High quality |
| **Luma AI** | Genie 2 | Text-to-3D | `[REST]` | Part of Luma ecosystem |
| **Sloyd** | Sloyd API | Text-to-3D (game assets) | `[REST]` | Game-ready assets |
| **Hyper3D** | Hyper Human, Rodin | 3D human/object generation | `[REST]` | Specialized 3D gen |
| **Polycam** | LiDAR scan API | 3D scanning from photos/LiDAR | `[SDK]` (iOS) | Mobile 3D capture |
| **Sketchfab** | Model API | 3D model hosting, viewing, marketplace | `[REST]` | 3D model distribution |
| **three.js** | Library | 3D rendering in browser | `[SDK]` (JS) | Frontend 3D rendering |
| **model-viewer** | Web component | 3D model display in web | `[SDK]` (JS) | Google's 3D viewer |

---

### 12.6 Speech & Voice

#### Text-to-Speech (TTS)

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **ElevenLabs** ★ | Turbo v3, Multilingual v2 | High-quality TTS, voice cloning, sound effects | `[REST]` `[WS]` | Best quality. Voice cloning |
| **OpenAI** | TTS-1, TTS-1-HD | Text-to-speech, 6 voices | `[REST]` | Simple, good quality |
| **Google Cloud TTS** | WaveNet, Neural2 | Multi-language TTS (220+ voices) | `[REST]` `[gRPC]` | Widest language coverage |
| **Azure TTS** | Neural TTS | Multi-language, SSML support | `[REST]` | Enterprise. SSML control |
| **Cartesia** | Sonic 3 | Ultra-low latency TTS (40-90ms TTFA) | `[REST]` `[WS]` | Fastest for real-time voice agents |
| **Hume AI** | Octave | Emotion-aware TTS | `[REST]` `[WS]` | Understands emotional context |
| **Fish Audio** | Fish Speech | Multi-language TTS, voice cloning | `[REST]` | Open-source friendly |
| **MiniMax** | Speech-02 | Chinese + English TTS | `[REST]` | Strong Chinese voice quality |
| **PlayHT** | PlayHT 2.0 | TTS, voice cloning | `[REST]` | Real-time streaming |
| **LMNT** | LMNT voices | Low-latency TTS | `[REST]` `[WS]` | Indie-friendly pricing |
| **Kokoro** | Kokoro-82M | Ultra-cheap TTS (Apache 2.0) | `[SDK]` | $0.70/1M chars. Self-hostable |
| **Resemble AI** | Resemble v3 | Voice cloning, custom voices | `[REST]` | Enterprise voice cloning |

#### Speech-to-Text (STT)

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **OpenAI** ★ | gpt-4o-transcribe, Whisper large-v3-turbo | Transcription, translation. gpt-4o-transcribe lower WER than Whisper | `[REST]` | Best accuracy-cost ratio |
| **Deepgram** ★ | Nova-3, Flux | Nova-3: 5.26% WER (batch leader). Flux: first conversational STT with turn detection | `[REST]` `[WS]` | Best for real-time. Speaker ID |
| **AssemblyAI** | Universal-2, Slam-1 | Slam-1: speech-language model. 90ms first-word latency. $0.37/hr | `[REST]` `[WS]` | Rich post-processing. 43% price cut |
| **Google Cloud STT** | Chirp 2 | Multi-language, streaming | `[REST]` `[gRPC]` | 125+ languages |
| **Azure STT** | Fast Transcription | Real-time, batch, custom models | `[REST]` `[WS]` | Enterprise. Custom models |
| **Speechmatics** | Ursa v2 | Multi-language, diarization | `[REST]` `[WS]` | Strong accuracy |
| **Rev AI** | Rev API | Transcription, async/streaming | `[REST]` `[WS]` | Human-level accuracy |

#### Voice Conversation (Real-time)

| Provider | Capability | API Type | Notes |
|---|---|---|---|
| **LiveKit** ★ | Real-time voice/video rooms, AI agent framework | `[WS]` `[SDK]` | Our real-time infrastructure |
| **OpenAI Realtime** | Speech-to-speech with GPT | `[WS]` | Direct voice conversation with GPT |
| **Google Gemini Live** | Speech-to-speech with Gemini | `[WS]` | Multimodal voice conversation |
| **Daily.co** | Voice/video rooms | `[REST]` `[WS]` | Alternative real-time |
| **Agora** | Voice/video SDK | `[SDK]` | Global edge network |
| **Twilio** | Voice API, phone integration | `[REST]` | Phone/PSTN integration |
| **Vapi** | Voice agent platform | `[REST]` | Managed voice agent hosting |

---

### 12.7 Music & Audio Generation

| Provider | Model(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **Suno** ★ | Suno V5 | Full-song gen (verse/chorus/outro), Elo 1,293. Top vocal realism | ⚠️ No official API | Unofficial wrappers exist (suno-api.org). ToS risk |
| **Udio** | Udio v2 | Text-to-music, 48kHz stereo, approaches studio quality | ⚠️ No official API | Unofficial via udioapi.pro |
| **Stability AI** | Stable Audio 2.0 | Text-to-audio, audio-to-audio. Trained on licensed AudioSparx | `[REST]` | Official API. Instrumental + sound effects |
| **Meta** | MusicGen, AudioCraft | Music generation (open-source) | `[SDK]` | Via FAL.ai, Replicate. Self-hostable |
| **AIVA** | AIVA Composer | AI music composition | `[REST]` | Royalty-free compositions |
| **ElevenLabs** | Sound Effects API | Text-to-sound-effects | `[REST]` | Sound design for content |
| **AIML API** | Aggregator | Unified access to Suno V4, Udio, Stable Audio, MusicGen | `[REST]` | Third-party aggregation |
| **Splash Pro** | Splash API | Music generation for apps | `[REST]` `[SDK]` | SDK for in-app music |

---

### 12.8 Search & Knowledge

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Google** | Custom Search JSON API | Web search, image search | `[REST]` | Most comprehensive index |
| **Brave** ★ | Brave Search API | Independent web search (30B+ pages) | `[REST]` | Privacy-first. Free tier 1K/mo |
| **Tavily** ★ | Tavily Search | AI-optimized search for RAG | `[REST]` | Built for LLM agents. LangChain native |
| **Exa** | Exa Search | Semantic/neural search | `[REST]` | Understands meaning, not just keywords |
| **Perplexity** | Perplexity API | AI-powered search with citations | `[REST]` | Returns sourced answers |
| **SerpAPI** | SERP scraping | Structured Google/Bing/Yahoo results | `[REST]` | 25+ search engines |
| **Serper** | Serper API | Fast Google SERP data | `[REST]` | Low-cost alternative to SerpAPI |
| **You.com** | You.com API | AI search with RAG snippets | `[REST]` | Developer-friendly |
| **Wikipedia** | MediaWiki API | Encyclopedia access | `[REST]` | Free. Structured knowledge |
| **Wolfram Alpha** | Wolfram API | Computational knowledge | `[REST]` | Math, science, data |
| **PubMed** | E-Utilities API | Medical/scientific literature | `[REST]` | Free. NIH database |
| **arXiv** | arXiv API | Academic papers | `[REST]` | Free. Research papers |
| **Google Knowledge Graph** | Knowledge Graph API | Entity data | `[REST]` | Structured entity info |
| **Wikidata** | SPARQL/REST | Structured knowledge base | `[REST]` | Free. Linked data |

**Note:** Bing Search API was retired August 11, 2025 by Microsoft as part of their shift toward AI-mediated search.

**Search + Scraping combo:** Firecrawl and Jina Reader convert any URL to LLM-ready markdown. Combine with search APIs for full "search → extract → understand" pipelines.

---

### 12.9 Maps, Location & Geospatial

| Provider | API(s) | Capability | API Type | Notes |
|---|---|---|---|---|
| **Google Maps** ★ | Places, Directions, Geocoding, Street View, Elevation | Full maps platform | `[REST]` `[SDK]` | Most comprehensive. Higher cost |
| **Mapbox** | Maps, Geocoding, Directions, Navigation | Customizable maps | `[REST]` `[SDK]` | Best for custom styling. Generous free tier |
| **HERE** | Maps, Routing, Geocoding, Traffic | Enterprise maps | `[REST]` `[SDK]` | Strong freemium. Automotive focus |
| **Foursquare** | Places API | Venue/POI data (150M+ places) | `[REST]` | Rich POI metadata |
| **Apple** | MapKit JS | Maps for web | `[REST]` `[SDK]` | Native iOS maps integration |
| **OpenStreetMap** | Nominatim, Overpass | Open map data, geocoding | `[REST]` | Free. Community-maintained |
| **Radar** | Geofencing, geocoding, routing | Location infrastructure | `[REST]` `[SDK]` | Modern alternative to Google Maps |
| **Yelp** | Fusion API | Business search, reviews | `[REST]` | Restaurant/business discovery |
| **TripAdvisor** | Content API | Reviews, photos, POI data | `[REST]` | Travel POI data |

---

### 12.10 Weather & Environment

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **OpenWeatherMap** ★ | Current, Forecast, Historical | Weather data, 5-day forecast | `[REST]` | Free tier. 60 calls/min |
| **Tomorrow.io** | Weather API | Hyperlocal weather, air quality | `[REST]` | Real-time + forecasts |
| **WeatherAPI** | Current + Forecast | Weather, astronomy, time zone | `[REST]` | Simple, generous free tier |
| **AccuWeather** | AccuWeather API | Weather forecasts, indices | `[REST]` | Enterprise quality |
| **AirVisual (IQAir)** | Air Quality API | Air quality index, pollutants | `[REST]` | AQI data worldwide |
| **EPA AirNow** | AQI API | US air quality data | `[REST]` | Free. US government |

---

### 12.11 Translation & Language

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **DeepL** ★ | DeepL API | High-quality translation (33 languages) | `[REST]` | Best quality for European languages |
| **Google Cloud Translation** | Translation API (v3) | 130+ languages, document translation | `[REST]` | Widest language coverage |
| **Azure Translator** | Translator API | 100+ languages, custom models | `[REST]` | Enterprise. Custom terminology |
| **Papago (Naver)** | Papago API | Korean-focused translation | `[REST]` | Best for Korean |
| **LibreTranslate** | Open API | Open-source translation | `[REST]` | Self-hostable. Free |

---

### 12.12 Document & OCR Processing

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Google Document AI** ★ | Document AI | Document parsing, form extraction, OCR | `[REST]` | Best for structured documents |
| **Azure Document Intelligence** | Form Recognizer | Receipt, invoice, ID parsing | `[REST]` | Pre-built models for common docs |
| **AWS Textract** | Textract API | OCR, table extraction, form parsing | `[REST]` | AWS ecosystem |
| **Mathpix** | Mathpix API | Math OCR, LaTeX extraction | `[REST]` | Specialized math/science OCR |
| **Nanonets** | Nanonets API | Custom document extraction | `[REST]` | Train custom extractors |

---

### 12.13 Code Execution & Development Tools

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **E2B** ★ | Code Interpreter SDK | Sandboxed code execution (Python, JS, etc.) | `[REST]` `[SDK]` | Safe code execution for AI agents |
| **Modal** | Modal API | Serverless GPU/CPU compute | `[REST]` `[SDK]` | Run custom ML models |
| **Replit** | Repl API | Online IDE, code execution | `[REST]` | Collaborative coding |
| **Judge0** | Execution API | Multi-language code execution | `[REST]` | 60+ languages. Self-hostable |
| **GitHub** | GitHub API, Copilot API | Repo management, code intelligence | `[REST]` | Code context & collaboration |
| **GitLab** | GitLab API | Repo management, CI/CD | `[REST]` | Self-hostable alternative |

---

### 12.14 Web Scraping & Browser Automation

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Firecrawl** ★ | Firecrawl API | Web scraping, crawling, LLM-ready markdown | `[REST]` | Purpose-built for AI agents |
| **Jina AI** | Reader API | URL-to-markdown, web content extraction | `[REST]` | Simple, fast |
| **Spider** | Spider API | Fast web crawling | `[REST]` | High throughput |
| **ScrapingBee** | ScrapingBee API | Web scraping with JS rendering | `[REST]` | Handles anti-bot |
| **Browserbase** | Browser API | Headless browser as API | `[REST]` | Full browser for agents |
| **Playwright** | Library | Browser automation | `[SDK]` | Local browser control |

---

### 12.15 Embedding & Vector Search

| Provider | Model/API | Capability | API Type | Notes |
|---|---|---|---|---|
| **OpenAI** ★ | text-embedding-3-large/small | Text embeddings | `[REST]` | High quality, reasonable cost |
| **Cohere** | Embed v3 | Text embeddings, multilingual | `[REST]` | Best multilingual embeddings |
| **Voyage AI** | voyage-3 | Code & text embeddings | `[REST]` | Best for code |
| **Jina AI** | jina-embeddings-v3 | Text embeddings | `[REST]` | Open-source options |
| **Google** | Vertex AI Embeddings | Text embeddings | `[REST]` | GCP ecosystem |
| **Pinecone** | Pinecone DB | Vector database, similarity search | `[REST]` `[SDK]` | Managed vector DB |
| **Weaviate** | Weaviate API | Vector DB with built-in vectorizers | `[REST]` `[gRPC]` | Self-hostable |
| **Qdrant** | Qdrant API | Vector similarity search | `[REST]` `[gRPC]` | Open-source. Fast |
| **ChromaDB** | Chroma API | Lightweight embedding store | `[SDK]` | Simple, local-first |

---

### 12.16 Food, Nutrition & Health

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **USDA FoodData Central** ★ | FDC API | Nutritional data for 300K+ foods | `[REST]` | Free. US government |
| **Nutritionix** | Nutritionix API | NLP food parsing, nutrition lookup | `[REST]` | "2 eggs and toast" → macro data |
| **Edamam** | Nutrition, Recipe, Food DB | Nutrition analysis, recipe search | `[REST]` | Recipe + nutrition |
| **Spoonacular** | Food API | Recipes, meal plans, nutrition | `[REST]` | Full food platform |
| **CalorieNinja** | CalorieNinja API | Quick calorie lookup | `[REST]` | Simple, fast |
| **Open Food Facts** | Open API | Product barcode → nutrition | `[REST]` | Free. Community |
| **PubChem** | PUG REST | Chemical/compound data | `[REST]` | Free. NIH |

---

### 12.17 E-commerce & Shopping

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Google Shopping** | Shopping Content API | Product search, price comparison | `[REST]` | Google product index |
| **Amazon** | Product Advertising API | Product search, details, reviews | `[REST]` | Affiliate integration |
| **eBay** | Browse API | Product search, listings | `[REST]` | Auction + buy-now |
| **Shopify** | Storefront API | Store products, cart, checkout | `[REST]` `[gRPC]` | E-commerce platform |
| **淘宝/天猫** | 开放平台 API | Product search, details | `[REST]` | Chinese e-commerce |
| **京东** | 京东开放平台 | Product search, details | `[REST]` | Chinese e-commerce |
| **拼多多** | 多多开放平台 | Product search, deals | `[REST]` | Chinese e-commerce |
| **Rakuten** | RapidAPI | Product search (Japan) | `[REST]` | Japanese e-commerce |

---

### 12.18 Travel & Booking

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Amadeus** ★ | Flight, Hotel, POI APIs | Flight search, hotel booking, travel data | `[REST]` | Most comprehensive travel API |
| **Skyscanner** | Partners API | Flight/hotel search & comparison | `[REST]` | Price comparison |
| **Booking.com** | Affiliate API | Hotel search, booking | `[REST]` | Largest hotel inventory |
| **Google Flights** | (via SerpAPI) | Flight search | `[REST]` | Via scraping APIs |
| **TripAdvisor** | Content API | Reviews, POI, restaurants | `[REST]` | Travel content & reviews |
| **Airbnb** | (via unofficial APIs) | Accommodation search | `[REST]` | Limited official API |
| **去哪儿/携程** | 开放平台 | Chinese travel booking | `[REST]` | Chinese travel market |
| **Rome2Rio** | API | Multi-modal transport routing | `[REST]` | How to get from A to B |

---

### 12.19 Finance & Payments

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Alpha Vantage** | Stock API | Stock prices, forex, crypto, fundamentals | `[REST]` | Free tier. Real-time data |
| **Yahoo Finance** | (via yfinance) | Stock data, financial statements | `[REST]` | Unofficial but widely used |
| **CoinGecko** | Coin API | Cryptocurrency prices, market data | `[REST]` | Free. Comprehensive crypto |
| **CoinMarketCap** | CMC API | Crypto market data | `[REST]` | Crypto market leader |
| **Stripe** | Payments API | Payment processing | `[REST]` `[SDK]` | Payment infrastructure |
| **Plaid** | Banking API | Bank account linking, transactions | `[REST]` | Financial data aggregation |
| **Wise (TransferWise)** | Exchange Rate API | Currency exchange rates | `[REST]` | Real-time forex |
| **Open Exchange Rates** | Rates API | 170+ currency exchange rates | `[REST]` | Simple currency conversion |

---

### 12.20 Calendar, Productivity & Messaging Connectors

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Google Calendar** | Calendar API | Event CRUD, scheduling, availability | `[REST]` | OAuth. Primary calendar |
| **Microsoft Graph** | Outlook Calendar, Mail, OneDrive | Calendar, email, files | `[REST]` | Microsoft 365 ecosystem |
| **Apple** | EventKit, Reminders | iOS calendar, reminders | `[SDK]` (native) | Native iOS integration |
| **Notion** ★ | Notion API | Pages, databases, blocks | `[REST]` | Knowledge management |
| **Todoist** | Todoist API | Task management | `[REST]` | Todo lists & projects |
| **Linear** | Linear API (GraphQL) | Issue tracking | `[GraphQL]` | Dev team task tracking |
| **Trello** | Trello API | Kanban boards | `[REST]` | Visual task management |
| **Asana** | Asana API | Project management | `[REST]` | Enterprise PM |
| **Airtable** | Airtable API | Spreadsheet-database hybrid | `[REST]` | Structured data management |

---

### 12.21 Social & Messaging Platform Connectors

| Platform | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Telegram** ★ | Bot API | Send/receive messages, inline bots, payments | `[REST]` | Primary messaging channel |
| **WhatsApp** | Business API (Cloud) | Send/receive messages, media, templates | `[REST]` | Via Meta Business Platform |
| **飞书 (Lark)** | Open API | Messages, cards, bots, calendar, docs | `[REST]` | Chinese enterprise messaging |
| **WeChat** | Official Account API | Messages, mini-programs, payments | `[REST]` | Chinese social ecosystem |
| **Slack** | Web API, Events API | Messages, channels, workflows | `[REST]` `[WS]` | Enterprise messaging |
| **Discord** | Bot API | Messages, voice, channels | `[REST]` `[WS]` | Community messaging |
| **LINE** | Messaging API | Messages, rich menus, LIFF apps | `[REST]` | Japan/SEA messaging |
| **Instagram** | Graph API | Post management, messaging | `[REST]` | Social media |
| **Twitter/X** | X API v2 | Tweets, DMs, spaces | `[REST]` | Social media |
| **Reddit** | Reddit API | Posts, comments, communities | `[REST]` | Forum/community |

---

### 12.22 Email

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Gmail** | Gmail API | Email CRUD, labels, threads | `[REST]` | Via Google OAuth |
| **Microsoft Graph** | Outlook Mail | Email CRUD | `[REST]` | Microsoft 365 |
| **SendGrid** ★ | Mail Send API | Transactional email | `[REST]` | Outbound notifications |
| **Resend** | Resend API | Developer-first email | `[REST]` | Modern. React Email |
| **Mailgun** | Mailgun API | Email sending, receiving | `[REST]` | Email infrastructure |
| **Postmark** | Postmark API | Transactional email | `[REST]` | High deliverability |

---

### 12.23 Cloud Storage & File Management

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Google Cloud Storage** ★ | GCS API | Object storage (our primary) | `[REST]` `[SDK]` | Primary storage |
| **AWS S3** | S3 API | Object storage | `[REST]` `[SDK]` | Alternative storage |
| **Google Drive** | Drive API | User file management | `[REST]` | User's personal files |
| **Dropbox** | Dropbox API | File sync, sharing | `[REST]` | Cross-platform files |
| **OneDrive** | Microsoft Graph | File storage | `[REST]` | Microsoft ecosystem |
| **Box** | Box API | Enterprise file management | `[REST]` | Enterprise focus |
| **iCloud** | CloudKit | Apple ecosystem files | `[SDK]` (native) | iOS native |

---

### 12.24 Smart Home & IoT

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **HomeKit** | HomeKit API | Apple smart home control | `[SDK]` (native) | iOS native |
| **Google Home** | Smart Home API | Google ecosystem control | `[REST]` | Nest devices |
| **Alexa** | Smart Home Skill API | Alexa ecosystem control | `[REST]` | Amazon devices |
| **SmartThings** | SmartThings API | Samsung IoT platform | `[REST]` | Multi-brand hub |
| **IFTTT** | IFTTT API | Cross-platform automation | `[REST]` | "If this then that" glue |
| **Home Assistant** | HA API | Open-source home automation | `[REST]` `[WS]` | Self-hosted. Broadest device support |
| **Tuya** | Tuya IoT Platform | IoT device control | `[REST]` | Chinese IoT ecosystem |
| **MQTT** | Protocol | IoT messaging protocol | `[MQTT]` | Low-level IoT communication |

---

### 12.25 News & Media

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **NewsAPI** ★ | News API | 80K+ sources, headlines, search | `[REST]` | Best news aggregation API |
| **Google News** | (via SerpAPI/RSS) | News search | `[REST]` | Via scraping |
| **The Guardian** | Open Platform | Guardian articles | `[REST]` | Free. Quality journalism |
| **New York Times** | NYT API | Articles, books, movies | `[REST]` | Premium content |
| **Reddit** | Reddit API | Community discussions | `[REST]` | Real-time sentiment |
| **Hacker News** | HN API (Firebase) | Tech news | `[REST]` | Free. Tech community |

---

### 12.26 Education & Reference

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Wolfram Alpha** | Full Results API | Computational knowledge | `[REST]` | Math, science, data |
| **Wikipedia** | MediaWiki API | Encyclopedia | `[REST]` | Free |
| **Dictionary** | Free Dictionary API | Word definitions, pronunciation | `[REST]` | Free |
| **Oxford Dictionaries** | OED API | Premium dictionary | `[REST]` | Premium |
| **Google Books** | Books API | Book search, metadata | `[REST]` | Book discovery |
| **Open Library** | Open Library API | Book data, covers | `[REST]` | Free. Internet Archive |
| **Stack Exchange** | SE API | Programming Q&A | `[REST]` | StackOverflow data |

---

### 12.27 Image & Media Utilities

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Remove.bg** | Background Removal API | Remove image background | `[REST]` | One-purpose, excellent |
| **TinyPNG** | Compression API | Image optimization | `[REST]` | Lossy compression |
| **imgix** | Image CDN & Processing | Real-time image transformation | `[REST]` | URL-based image processing |
| **Cloudinary** | Media API | Image/video upload, transform, deliver | `[REST]` `[SDK]` | Full media pipeline |
| **Unsplash** | Unsplash API | Free stock photos | `[REST]` | High quality free images |
| **Pexels** | Pexels API | Free stock photos & videos | `[REST]` | Free stock media |
| **Giphy** | Giphy API | GIF search & creation | `[REST]` | GIF library |
| **QR Code** | Various | QR code generation | `[REST]` | Multiple free providers |

---

### 12.28 Authentication & Identity

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **Firebase Auth** ★ | Auth API | User authentication, social login | `[REST]` `[SDK]` | Our primary auth |
| **Auth0** | Auth0 API | Enterprise auth, SSO | `[REST]` `[SDK]` | Enterprise alternative |
| **Clerk** | Clerk API | Developer-first auth | `[REST]` `[SDK]` | Modern auth UX |
| **Supabase Auth** | GoTrue API | Open-source auth | `[REST]` | Self-hostable |
| **Apple Sign In** | Sign In with Apple | Apple ID auth | `[SDK]` | Required for iOS apps |
| **Google Sign In** | Google Identity | Google account auth | `[REST]` `[SDK]` | Google OAuth |

---

### 12.29 Monitoring, Analytics & Observability

| Provider | API | Capability | API Type | Notes |
|---|---|---|---|---|
| **LangSmith** | Tracing API | LLM call tracing, evaluation | `[REST]` `[SDK]` | LLM observability |
| **Helicone** | Proxy API | LLM request logging, analytics | `[REST]` | LLM cost tracking |
| **Braintrust** | Eval API | LLM evaluation, experiments | `[REST]` `[SDK]` | Quality testing |
| **PostHog** | Analytics API | Product analytics, feature flags | `[REST]` `[SDK]` | Open-source analytics |
| **Sentry** | Error Tracking | Error monitoring, performance | `[REST]` `[SDK]` | Error tracking |
| **Mixpanel** | Analytics API | User behavior analytics | `[REST]` `[SDK]` | Event analytics |

---

### 12.30 API Provisioning Strategy

APIs are provisioned in priority waves based on Experience Package demand:

```
Wave 0 (Core — already integrated):
├── Anthropic Claude (primary brain)
├── Google Gemini (Spokesperson + multimodal)
├── LiveKit (real-time voice/video)
├── Firebase Auth (authentication)
└── GCS (storage)

Wave 1 (V1 Experience Packages):
├── Google Cloud Vision (image analysis)
├── USDA FoodData / Nutritionix (nutrition)
├── OpenAI TTS/STT (voice fallback)
├── Brave / Tavily (web search)
├── Google Maps (location)
└── OpenWeatherMap (weather)

Wave 2 (V1.x — Platform Expansion):
├── Telegram Bot API
├── WhatsApp Business API
├── 飞书 Open API
├── ElevenLabs (premium TTS)
├── Deepgram (real-time STT)
└── DeepL (translation)

Wave 3 (V2 — Creative Suite):
├── DALL-E 3 / Flux (image gen)
├── Runway / Kling (video gen)
├── Suno (music gen)
├── Meshy (3D gen)
├── E2B (code execution)
└── Stability AI (image tools)

Wave 4 (V3 — Full Ecosystem):
├── All e-commerce connectors
├── All productivity connectors (Notion, Calendar, etc.)
├── Smart home integrations
├── Finance APIs
├── Travel APIs
└── Remaining specialized APIs
```

**Cost Estimation per User (at scale):**

| API Category | Estimated $/user/month | Usage Assumption |
|---|---|---|
| LLM (Claude primary) | $2.00-4.00 | ~50 sessions/month, Sonnet default |
| Vision + Image | $0.10-0.30 | Built into LLM calls mostly |
| Search | $0.05-0.15 | ~20 searches/month |
| TTS/STT | $0.20-0.50 | ~30 min voice/month |
| Maps/Location | $0.05-0.10 | ~10 map queries/month |
| Creative (image/video/3D) | $0.50-2.00 | On-demand, variable |
| **Total** | **$3.00-7.00** | Fits within $3-5 target at Sonnet pricing |

---

*VI Agent System v5 — Card Template Architecture + NanoClaw Core | 2026-03-04*
*NanoClaw is the heart. Cards are the language. Streams flow everywhere. Tools are the hands.*
