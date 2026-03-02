# VI-Agent Frontend — Product Documentation

> **Last Updated:** March 2026

---

## 1. Product Vision

**Personal Intelligence in Your Camera** — a visual AI agent that lives in your camera, understands what you see, predicts what you need, and delivers structured artifacts in seconds.

### Core Axiom

```
Max Aggregated Effective Token Across the Whole System
```

Three growth levers:

1. **Max Effective Token Per Day Per User** — maximize the boundary of intelligence
2. **Max Daily Active User** — capture the largest entry point (the camera)
3. **Max System Run Time** — ensure User Value > Agent Salary > Agent Cost

### The Loop

```
Input [Visual + Intention] → Agent → Output [Artifact] → Grow [Memory, Skill]
```

Every interaction follows this loop. The camera is both input device and intelligence interface.

---

## 2. The Talking Camera

The central product innovation is the **Talking Camera** — a camera that sees, listens, and predicts simultaneously.

> **IMPORTANT:** The camera is not a shutter. It is a multi-modal input interface that combines **Vision + Voice + Gesture** into a single continuous interaction.

### Why It Matters

The bottleneck in visual AI is the **Intention Phase** — the only moment requiring the user to actively think and choose. The Talking Camera eliminates this by:

| Problem | Talking Camera Solution |
|---|---|
| Scene switching (scan → choose) breaks flow | Intention is collected **during** viewing via on-camera card |
| Open-ended "what do you want?" causes paralysis | System **predicts** intention; user only **confirms** |
| Voice/text input requires cognitive translation | Voice is captured naturally while viewing |

### Predictive Coding Model

Inspired by Karl Friston's Free Energy Principle:

```
P(Output) = P(Output | Visual) × P(Intention | Visual)
```

In most scenarios, `I(Output; Intention | Visual)` approaches zero — the visual input alone carries enough signal to predict the right action. The system only needs to collect the **residual** intention.

### Intention Hierarchy

```
L0: Domain       "food"
L1: Task type    "nutritional analysis"
L2: Specific     "calculate calories and macros"     ← System predicts to here
L3: Parameters   "compare to my daily target"
L4: Presentation "table format, dark background"
```

L0–L1 are inferred from visual affordances. **L2 is the prediction target** — specific enough to execute, not so specific as to over-constrain.

---

## 3. Design Principles

### Principle 1: Predict, Don't Ask

The system always makes a concrete prediction. It never asks "what do you want to do?"

```diff
- "What would you like to do with this photo?"
+ "Analyze nutritional content and calories →"
```

### Principle 2: Confirm, Don't Choose

Users face "is this right?" (confirmation), never "which is better?" (selection).

### Principle 3: Value Over Probability

When the visual signal is ambiguous, the system predicts the **highest-value** action, not the most probable one.

```
P(user wants) × V(action result) → maximize expected value
```

A low-probability but life-changing action (medication interaction check) beats a high-probability but low-value one (recognize brand name).

### Principle 4: Camera Time = Thinking Time

The camera viewing duration is not waiting time — it's the AI's processing time, converted into a natural moment for the user to frame their shot.

### Principle 5: Output is the Best Question

The first Artifact is the most efficient way to collect refined intent. Don't over-collect at input.

```
Input phase:  Collect L2 (basic-level intention)
Output phase: Use Artifact to probe L3/L4
```

### Principle 6: Context is Free Signal

Time, location, past sessions, and visual context are all free signals that reduce the need for explicit user input.

---

## 4. User Journey

The user journey flows through four views:

```
Camera View → Session View → History
                               ↓
                           Memory View
```

---

### 4.1 Camera View — The Talking Camera

**Component:** `LiveCameraView.jsx`

The primary interface. The user points the camera at something and the AI immediately begins analyzing via LiveKit.

#### Layout (top to bottom)

| Element | Description |
|---|---|
| **Back Arrow** | Navigate to History |
| **Signal Indicator** | Real connection states: Connecting / Connected / Weak / Disconnected |
| **Flash Toggle** | OFF / ON flashlight control |
| **Viewfinder** | Full-bleed real camera feed via LiveKit |
| **AI Status** | "AI VIEWING..." label with eye icon |
| **Observation Card** | Floating text showing the AI's real-time prediction |
| **Mic Button** | Left of shutter — real audio capture with purple accent |
| **Shutter Button** | Center — tap for photo |
| **Done Button** | Right of shutter — green checkmark (appears after capture) |

#### The Observation Card

The floating card is the core innovation. It displays:

- **What the AI sees**: "Looks like a stack of receipts."
- **What the AI suggests**: "Should I tally them up, categorize them for your taxes, or sync them to QuickBooks?"
- **Keyword highlighting**: Key action words are bolded for scanability

#### Capture Flow

```
User points camera → AI VIEWING... (observation card appears)
  → User taps shutter (photo captured, added to media stack)
  → User taps Done (✓)
  → Navigate to Session View with photos + intention
```

#### Media Stack

- Captured photos stack as thumbnails above the shutter
- Show count badge ("1 items", "3 items")
- Supports gallery view with delete/clear-all

#### Camera Controls

- Zoom (pinch or slider)
- Front/back camera switch
- Flash toggle

---

### 4.2 Session View — Canvas-First Artifact Display

**Component:** `LiveSessionView.jsx`

The session view uses a **canvas-first** design where agent-generated artifacts are the hero content, not conversation.

#### Canvas Zone (scrollable, hero content)

The main content area renders a stack of artifact blocks:

- **CanvasCard** components: collapsed/expanded wrappers for each block
- **HtmlBlock**: `ActiveHtmlBlock` (streaming via `PersistentHtmlRenderer`) or `StaticHtmlBlock`
- **ModuleRenderer**: native React components for structured data (8 types)
- **ImageBlock**: displayed images
- Multiple blocks per session — each gateway task produces one block
- Only the latest block is expanded by default

#### Conversation Pill (floating, transient)

- Floating pill showing the latest agent message
- Expandable to show last 5 messages
- Can be dismissed — conversation is secondary to artifacts

#### Action Bar (bottom)

- Agent-driven action options (clickable suggestions)
- Chat input with photo attachment and send
- Voice input capability

#### Session Caching

- Up to 10 session entries cached
- Preserves state across navigation (back to camera and return)

---

### 4.3 History View

**Component:** `HistoryView.jsx`

The home screen showing all past sessions as a visual gallery.

#### Layout

| Element | Description |
|---|---|
| **"History" Header** | Large typography with profile icon (top-right) |
| **Search Bar** | "Search memories..." with magnifying glass |
| **Session Grid** | 2-column card layout with thumbnails |
| **Camera FAB** | Floating camera button (bottom-right) |

#### Session Cards

Each card shows:

- **Thumbnail**: The original captured image
- **Title**: "Input → Output" format (e.g., "Board → Action Items")
- **Summary**: One-line description of what was done
- **Timestamp**: Relative time ("Today", "3 days ago", "Last week")

Tapping a card opens the full Session View with expanded artifact.

---

### 4.4 Memory View

**Component:** `MemoryView.jsx`

Memory management interface for viewing, editing, and deleting memories organized by layer:

- **Identity**: Who the user is (preferences, profile)
- **Semantic**: Facts and knowledge accumulated over time
- **Episodic**: Specific past interactions and events

---

## 5. Architecture

### Technology Stack

| Layer | Technology |
|---|---|
| Framework | Vite + React |
| Styling | Vanilla CSS + Glassmorphism Design System |
| Animation | Framer Motion |
| Real-time | LiveKit Client SDK |
| Icons | Lucide React |
| Audio | Custom SoundLibrary.js |

### Component Map

```
App.jsx (Router + State + Auth + Notifications)
├── LiveCameraView.jsx (LiveKit camera + capture + observation)
├── LiveSessionView.jsx (Canvas-first artifact display)
│   ├── PersistentHtmlRenderer.jsx (Streaming HTML iframe)
│   └── modules/
│       ├── ModuleRenderer.jsx (Dispatcher)
│       ├── shared.jsx (Glassmorphism primitives)
│       ├── PlaceCardModule.jsx
│       ├── WeatherModule.jsx
│       ├── ChecklistModule.jsx
│       ├── ComparisonModule.jsx
│       ├── RecipeModule.jsx
│       ├── StepsGuideModule.jsx
│       ├── InfoCardModule.jsx
│       └── ImageGalleryModule.jsx
├── HistoryView.jsx (Session grid + search)
├── MemoryView.jsx (Memory management)
└── hooks/
    └── useAgentProtocol.js (LiveKit RPC + DataChannel protocol)
```

### Routing

```javascript
'camera'         → LiveCameraView
'live-session'   → LiveSessionView
'home'/'history' → HistoryView
'memory'         → MemoryView
```

---

## 6. Artifact System

The agent generates rich content through two rendering paths:

### 6.1 HTML Artifacts — PersistentHtmlRenderer

Streaming HTML rendered inside a managed iframe:

- **Single pre-warmed iframe** per session — never recreated during a session
- **Tailwind CDN** loaded once at iframe creation
- **postMessage bridge** for O(1) HTML appending (no DOM re-parse on each chunk)
- **ResizeObserver** for dynamic height adjustment (iframe grows to fit content)
- **iframeDesignSystem.js** injects shared CSS tokens into the iframe

This path handles freeform, visually rich content that the agent generates as HTML/Tailwind markup.

### 6.2 Native Modules — ModuleRenderer

Eight structured data types rendered as native React components:

| Module | Purpose | Key Features |
|---|---|---|
| `place_card` | Restaurants / places | Rating, price, map link, hours, action buttons |
| `weather` | Weather + forecast | Current conditions, multi-day forecast |
| `checklist` | Interactive todos | Checkboxes with local state management |
| `comparison` | Side-by-side compare | Feature matrix across multiple items |
| `recipe` | Cooking instructions | Ingredients list, steps, cook time |
| `steps_guide` | Step-by-step guides | Ordered instructions with progress |
| `info_card` | Information cards | Icons, structured key-value data |
| `image_gallery` | Image collections | Lazy loading, responsive grid layout |

The agent chooses between HTML artifacts and native modules based on the task. Structured, interactive data (places, recipes, checklists) uses native modules. Freeform analysis, reports, and custom layouts use HTML artifacts.

### 6.3 Glassmorphism Design System

A shared visual language across both rendering paths:

**Design Tokens:**
- Glass effects: frosted backgrounds (`rgba(255,255,255,0.04)`), `blur(20px)`
- Purple accent: `#a855f7` with glow effects
- Responsive typography: `clamp()`-based sizing

**React Primitives** (`shared.jsx`):
- `GlassCard`, `GlassSection`, `GlassChip`, `GlassButton`, `GlassDivider`

**CSS Utility Classes** (`iframeDesignSystem.js`) for LLM-generated HTML:
- `.vi-card`, `.vi-section`, `.vi-chip`, `.vi-btn`
- Ensures HTML artifacts match native module styling

---

## 7. Agent Protocol

Communication between the frontend and agent runs over LiveKit, implemented in `useAgentProtocol.js`.

### RPC Methods (agent → frontend)

The agent can invoke frontend actions via LiveKit RPC:

- Photo/video capture and upload
- Chat text manipulation
- Action card display (clickable options for the user)
- Rich result display (modules and HTML)
- Page navigation between views
- Camera hardware control (zoom, switch lens)

### DataChannel Topics

Real-time data flows over named DataChannel topics:

| Topic | Format | Purpose |
|---|---|---|
| `vi-agent` | JSON | Intention prediction, session plan, action suggestions |
| `vi-gateway` | JSON | Task lifecycle: started, progress, result, error |
| `gateway_html_stream` | Chunks | Streaming HTML artifact content |
| `gateway_text_stream` | Chunks | Streaming text content |
| `task_progress` | JSON | Progress updates with stage and message |
| `task_events` | JSON | Task state history |
| `session_header` | JSON | Session metadata (title, summary) |
| `memory_updated` | Signal | Notification that memories changed |

---

## 8. Sound Design

The app uses a custom `SoundLibrary.js` (`frontend/src/sounds/`) with contextual audio feedback:

| Event | When |
|---|---|
| Signal | Connection state changes |
| Flashlight | Flash toggle on/off |
| Flip | Camera flip front/back |
| Delete | Media stack item removed |
| Shutter | Photo captured |
| Recording start/stop | Video recording states |

---

## 9. Authentication

Dual authentication modes:

- **JWT Token**: Email/password signup and login flow, embedded in the main app
- **Device-based Anonymous**: Automatic via `X-Device-Id` header — no signup required

The `useAuth` hook manages the token lifecycle. Expired tokens trigger auto-refresh on 401 responses.

---

## 10. Notifications

Toast notifications provide feedback across the app:

| Type | Color | Trigger |
|---|---|---|
| `session_complete` | Green | Session finished successfully |
| `session_failed` | Red | Session encountered an error |
| `memory_update` | Purple | Memory was created or updated |
| `agent_message` | Blue | Agent sent a message outside session |

All toasts auto-dismiss with a progress bar after 3 seconds.

---

## 11. Agent Economics

| Item | Detail |
|---|---|
| **Monthly Salary** | $20 base |
| **Bonus** | Pay for token credit, no upper limit |
| **Cost per Loop** | ~$0.02–0.08 |
| **Monthly (10 loops/day)** | ~$6–24 |
| **Models** | Gemini Live 2.5 Flash (real-time), Gemini 2.5 Flash (fast execution), Claude Sonnet 4.6 (thorough execution) |

---

## 12. Key Source Files

| File | Purpose |
|---|---|
| `frontend/src/App.jsx` | Main router, auth, view transitions, notifications |
| `frontend/src/components/LiveCameraView.jsx` | Live camera via LiveKit, observation, capture |
| `frontend/src/components/LiveSessionView.jsx` | Canvas-first session: artifacts + conversation + actions |
| `frontend/src/components/PersistentHtmlRenderer.jsx` | Streaming HTML iframe renderer |
| `frontend/src/components/iframeDesignSystem.js` | Glassmorphism CSS tokens for iframes |
| `frontend/src/components/modules/ModuleRenderer.jsx` | Native module type dispatcher |
| `frontend/src/components/modules/shared.jsx` | Glassmorphism design primitives |
| `frontend/src/components/modules/*.jsx` | 8 specialized module components |
| `frontend/src/components/HistoryView.jsx` | Session grid, search, navigation |
| `frontend/src/components/MemoryView.jsx` | Memory management UI |
| `frontend/src/hooks/useAgentProtocol.js` | LiveKit RPC + DataChannel protocol |
| `frontend/src/services/api.js` | API client, auth, S3 upload |
| `frontend/src/sounds/` | Sound effects (SoundLibrary.js) |
