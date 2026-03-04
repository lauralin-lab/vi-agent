# VI-Agent Frontend — Product Documentation

> **Last Updated:** March 2026

---

## 1. Product Vision

**Video Call with Your Claude Code** — a personal AI that sees what you see, knows your memories and preferences, and proactively suggests what to do next. The camera is your always-on video call with your own Claude Code instance.

### The Master-Spokesperson Model

The product has a split-brain architecture that the user never sees:

```
┌──────────────────────────────────────────────────────────┐
│ What the user experiences:                                │
│   "I'm talking to a smart AI that sees what I see"        │
│                                                           │
│ What's actually happening:                                │
│   🧠 Claude Code (Master) — thinks, remembers, executes  │
│   🎤 Gemini (Spokesperson) — talks, listens, sees         │
│                                                           │
│ User value comes from: Claude Code + Skills               │
│ User interacts with: the Spokesperson (natural voice)     │
└──────────────────────────────────────────────────────────┘
```

The user never knows there are two AIs. They experience a single, seamless intelligence: one that can chat naturally in real-time (Gemini) AND execute complex tasks with tools and memory (Claude Code). The Spokesperson is the face; the Master is the brain.

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
See [Spokesperson's eyes] → Predict [Master's brain] → Execute [Master's skills] → Speak [Spokesperson's voice] → Grow [Master's memory]
```

Every interaction follows this loop. The Spokesperson captures multimodal input and delivers output through natural voice. The Master does all the thinking, remembering, predicting, and executing.

### Four Pillars

| Pillar | What | Why |
|--------|------|-----|
| **Master-Spokesperson** | Claude Code drives strategy; Gemini delivers the experience | Value creation and value delivery are separated — best of both models |
| **Multimodal Input** | Photos, video clips, live keyframes, voice | The richer the Spokesperson's perception, the smarter the Master's prediction |
| **Pluggable Skills** | Each skill = a use case, pre-installed or user-created | Every skill is a product feature; the Master executes, the Spokesperson presents |
| **Intention Prediction** | Master predicts what you need; Spokesperson suggests it naturally | "Video call with your Claude Code" — it suggests before you ask |

---

## 2. The Talking Camera

The central product innovation is the **Talking Camera** — a camera that sees, listens, and predicts simultaneously. It's your video call interface with your personal Claude Code.

> **IMPORTANT:** The camera is not a shutter. It is a multi-modal input interface that combines **Vision + Voice + Video + Gesture** into a single continuous interaction. The Spokesperson (Gemini) handles the real-time dialogue and visual sensing. The Master (Claude Code) receives the visual stream, predicts intentions, and tells the Spokesperson what to suggest — all invisible to the user.

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
  (photo/video     (summary →        ↓
   + AI viewing)    intentions →   Profile View
                    output)        (Skills + Memory)
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
User points camera → AI VIEWING... (observation card appears with intention predictions)
  → User taps shutter (photo captured, added to media stack)
  → User long-press shutter (video recording, max 30s, red ring indicator)
  → User taps Done (✓)
  → Navigate to Session View with photos/videos + predicted intentions
```

#### Media Stack

- Captured photos and video clips stack as thumbnails above the shutter
- Show count badge ("1 items", "3 items") with media type indicator
- Video thumbnails show duration overlay
- Supports gallery view with delete/clear-all

#### Camera Controls

- Zoom (pinch or slider)
- Front/back camera switch
- Flash toggle
- **Long-press shutter**: Start/stop video recording (max 30s)
- **Observation card**: Now shows predicted Intention Cards based on what AI sees

---

### 4.2 Session View — Summary → Intentions → Output

**Component:** `LiveSessionView.jsx`

The session view is redesigned around a three-zone layout: **Summary → Intention Cards → Output**. This replaces the previous canvas-first approach with a prediction-driven workflow.

#### Zone 1: Session Summary (top)

A compact header showing session context:
- What was captured: "3 photos, 1 video clip"
- Current state: "Analyzing nutrition..." or "Ready for next action"
- Active time: "2 min"

#### Zone 2: Intention Cards (horizontal scroll)

Predicted actions the user can execute with a single tap:

- **Each card** = one predicted intention mapped to a Skill
- Shows: icon, skill name, confidence %, estimated time
- **Tap to execute**: directly dispatches the Skill to NanoClaw
- Cards auto-update every 30s as context changes (new keyframes, actions)
- Replaces the previous `action_card` DataChannel mechanism

```
┌────────┐ ┌────────┐ ┌────────┐
│ 📊     │ │ 📕     │ │ 🎬     │
│Nutrition│ │XiaoHong│ │ Video  │
│Analysis │ │  Shu   │ │ Create │
│ 85%    │ │ 60%    │ │ 40%    │
│ ~10s   │ │ ~30s   │ │ ~60s   │
└────────┘ └────────┘ └────────┘
```

#### Zone 3: Output + Intermediate Results (scrollable, hero content)

Results from Skill execution stream into this zone:

- **Progress blocks**: step-by-step execution progress with percentage bar
- **Intermediate blocks**: partial results shown as they arrive (e.g., OCR text, detected objects)
- **Final result blocks**: `ModuleRenderer` components or `PersistentHtmlRenderer` HTML artifacts
- Multiple blocks per session — each Skill execution produces a stream of blocks
- Completed Intention Card shows mini-preview of its result

#### Conversation & Input (bottom)

- Chat input with photo/video attachment and send
- Voice input capability
- Floating conversation pill (minimized, expandable)

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

### 4.4 Profile View — Skills + Memory

**Component:** `ProfileView.jsx` (evolves from `MemoryView.jsx`)

The Profile View is the user's personal AI configuration page, organized into two tabs:

#### Skills Tab

Manages the user's installed and available Skills:

- **My Skills**: Installed skills with usage stats, enable/disable toggle, configure button
- **Available Skills**: Pre-installed skills ready to activate, with OAuth requirement badges
- **Create Custom Skill**: Guided wizard or raw .md editor for power users

```
┌──────────────────────────────────────┐
│ 📎 Skills                    🧠 Memory│
├──────────────────────────────────────┤
│ My Skills                            │
│ ┌──────────┐ ┌──────────┐           │
│ │ 📊       │ │ 📕       │           │
│ │ Nutrition │ │ XiaoHong │           │
│ │ Analyzer  │ │ Shu      │           │
│ │ Used 12x  │ │ Used 5x  │           │
│ │ [Config]  │ │ [Config]  │           │
│ └──────────┘ └──────────┘           │
│                                      │
│ Available Skills                     │
│ ┌──────────┐ ┌──────────┐           │
│ │ 🎬       │ │ 👗       │           │
│ │ Remotion  │ │ Style    │           │
│ │ Video     │ │ Advisor  │           │
│ │ [Install] │ │ [Install] │           │
│ └──────────┘ └──────────┘           │
│                                      │
│ [+ Create Custom Skill]             │
└──────────────────────────────────────┘
```

#### Memory Tab

Existing memory management, organized by layer:

- **Identity**: Who the user is (preferences, profile)
- **Semantic**: Facts and knowledge accumulated over time
- **Episodic**: Specific past interactions and events

#### Connections (sub-section)

OAuth connection management (Google, Notion, Slack, etc.) — required by certain Skills.

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
├── LiveCameraView.jsx (LiveKit camera + photo/video capture + observation)
│   └── IntentionOverlay.jsx (Observation card with predicted intentions)
├── LiveSessionView.jsx (Summary → Intention Cards → Output)
│   ├── SessionSummary.jsx (Session context header)
│   ├── IntentionCards.jsx (Horizontal scrollable prediction cards)
│   ├── OutputZone.jsx (Streaming results + intermediate blocks)
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
├── ProfileView.jsx (Skills + Memory management)
│   ├── SkillsTab.jsx (Installed + available skills)
│   ├── MemoryTab.jsx (Memory layers: identity/semantic/episodic)
│   └── ConnectionsTab.jsx (OAuth provider management)
└── hooks/
    ├── useAgentProtocol.js (LiveKit RPC + DataChannel protocol)
    ├── useIntentionCards.js (Intention prediction subscription)
    └── useNanoClawResults.js (Skill execution result streaming)
```

### Routing

```javascript
'camera'         → LiveCameraView
'live-session'   → LiveSessionView
'home'/'history' → HistoryView
'profile'        → ProfileView (Skills + Memory + Connections)
```

---

## 6. Skill System — Productized Use Cases

### 6.1 What is a Skill?

A Skill is a **productized use case** — a specific, well-designed scenario that a user can execute with one tap. Each Skill is independently deployable as a feature and directly marketable.

```
Skill = What the AI can do for you in a specific scenario
     = Claude Code System Prompt + Tools + Examples
     = One tap from Intention Card → Full execution → Artifact
```

### 6.2 Pre-installed Skills (Phase 1)

| Skill | User Sees | What Happens |
|-------|-----------|--------------|
| **Nutrition Analyzer** 📊 | "Tap to analyze calories" | Photo → Claude Vision → nutrition breakdown module |
| **Xiaohongshu Publisher** 📕 | "Tap to create a post" | Photo → AI caption + hashtags → preview → publish |
| **Remotion Video** 🎬 | "Tap to create a video" | Photos/clips → Remotion template → MP4 export |
| **Document Scanner** 📄 | "Tap to scan and extract" | Photo → OCR → structured text/table |
| **Travel Planner** ✈️ | "Tap to plan your trip" | Photo of landmark → travel guide + itinerary |
| **Style Advisor** 👗 | "Tap for outfit advice" | Photo of clothes → styling suggestions |

### 6.3 Skill Lifecycle (User Perspective)

```
1. User opens Profile → Skills Tab
2. Sees installed skills + available skills
3. Installs a skill (one-tap, may require OAuth setup)
4. Next time on camera: AI predicts when this skill is relevant
5. Intention Card appears → User taps → Skill executes
6. Result appears in Session View → Memory updated
```

### 6.4 Custom Skills

Power users can create their own Skills:

- **Guided wizard**: Choose inputs → describe the task → set output format
- **Raw .md editor**: Write Claude Code-compatible system prompt directly
- Custom skills appear alongside pre-installed ones in Intention predictions

---

## 7. Intention Prediction — The Core Differentiator

### 7.1 The "Video Call" Mental Model

> You are on a video call with your personal Claude Code.
> The Spokesperson (Gemini) is the face you talk to — natural, real-time, human-like.
> The Master (Claude Code) is the brain behind the face — it sees through the Spokesperson's eyes,
> thinks with your memories and preferences, and tells the Spokesperson what to suggest.
> You experience one seamless AI. In reality, the Master is pulling all the strings.

This is the key difference between VI Agent and a regular camera app or chatbot. The AI is **proactive**, not reactive — because the Master is continuously analyzing and predicting, and the Spokesperson is continuously delivering those predictions as natural conversation.

### 7.2 How Intention Prediction Works (User Perspective)

```
1. User points camera at a plate of pasta
2. AI continuously analyzes the scene (every 5 seconds)
3. AI checks: What skills are available? What does the user usually do?
4. Observation card updates: "I see Italian pasta. Want me to..."
5. Session View shows Intention Cards:
   📊 Nutrition Analysis (85%) | 📕 Share on XiaoHongShu (60%) | 🎬 Make Video (40%)
6. User taps one → Skill executes immediately
```

### 7.3 Prediction Signals

The AI combines multiple signals to predict intentions:

| Signal | Source | Example |
|--------|--------|---------|
| **Visual context** | LiveKit keyframe | "I see food on a plate" |
| **User memory** | Stored preferences | "User tracks calories daily" |
| **Recent actions** | Session history | "User just took 3 food photos" |
| **Available skills** | Installed skills | "Nutrition Analyzer is installed" |
| **Time & context** | System clock + location | "Lunchtime, at a restaurant" |

### 7.4 Intention Cards

The primary interaction element in Session View:

- **Appearance**: Horizontal scrollable cards below the summary
- **Content**: Icon + Skill name + Confidence % + Estimated time
- **Interaction**: Single tap = dispatch skill execution immediately
- **Updates**: Re-ranked every 30 seconds as context changes
- **Post-execution**: Shows "Complete" with mini result preview

### 7.5 Voice Integration — The Spokesperson Delivers

The Spokesperson (Gemini) receives intention predictions from the Master (Claude Code) via context injection and naturally incorporates them into conversation — the user hears a suggestion, not a command:

- High confidence (>80%): Spokesperson says "I see pasta — want me to analyze the nutrition?" (Master's prediction, Spokesperson's words)
- Medium confidence: Spokesperson mentions capabilities naturally without pushing
- Low confidence: Spokesperson stays silent, cards only appear in Session View

The user never knows the suggestion came from the Master. It feels like a natural observation from the AI they're talking to.

---

## 8. Artifact System

The agent generates rich content through two rendering paths:

### 8.1 HTML Artifacts — PersistentHtmlRenderer

Streaming HTML rendered inside a managed iframe:

- **Single pre-warmed iframe** per session — never recreated during a session
- **Tailwind CDN** loaded once at iframe creation
- **postMessage bridge** for O(1) HTML appending (no DOM re-parse on each chunk)
- **ResizeObserver** for dynamic height adjustment (iframe grows to fit content)
- **iframeDesignSystem.js** injects shared CSS tokens into the iframe

This path handles freeform, visually rich content that the agent generates as HTML/Tailwind markup.

### 8.2 Native Modules — ModuleRenderer

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

### 8.3 Glassmorphism Design System

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

## 9. Agent Protocol

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
| `vi-agent` | JSON | Intention prediction cards, session plan, action suggestions |
| `vi-gateway` | JSON | Task/Skill lifecycle: started, progress, intermediate, result, error |
| `gateway_html_stream` | Chunks | Streaming HTML artifact content |
| `gateway_text_stream` | Chunks | Streaming text content |
| `task_progress` | JSON | Progress updates with stage and message |
| `task_events` | JSON | Task state history |
| `session_header` | JSON | Session metadata (title, summary) |
| `intention_update` | JSON | Updated intention cards from prediction system (NEW) |
| `skill_status` | JSON | Skill execution status updates (NEW) |
| `memory_updated` | Signal | Notification that memories changed |

---

## 10. Sound Design

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

## 11. Authentication

Dual authentication modes:

- **JWT Token**: Email/password signup and login flow, embedded in the main app
- **Device-based Anonymous**: Automatic via `X-Device-Id` header — no signup required

The `useAuth` hook manages the token lifecycle. Expired tokens trigger auto-refresh on 401 responses.

---

## 12. Notifications

Toast notifications provide feedback across the app:

| Type | Color | Trigger |
|---|---|---|
| `session_complete` | Green | Session finished successfully |
| `session_failed` | Red | Session encountered an error |
| `memory_update` | Purple | Memory was created or updated |
| `agent_message` | Blue | Agent sent a message outside session |

All toasts auto-dismiss with a progress bar after 3 seconds.

---

## 13. Agent Economics

| Item | Detail |
|---|---|
| **Monthly Salary** | $20 base |
| **Bonus** | Pay for token credit, no upper limit |
| **Cost per Skill Execution** | ~$0.02–0.10 (varies by skill complexity) |
| **Intention Prediction** | ~$0.50/user/day (optimized, Claude Haiku) |
| **Keyframe Sampling** | ~$0.05/user/day (S3 storage, minimal) |
| **Monthly (10 loops/day)** | ~$6–24 (execution) + ~$15 (prediction) |
| **Models** | Gemini Live 2.5 Flash (real-time), Claude Haiku (intention prediction), Claude Sonnet 4.6 (skill execution) |

---

## 14. Key Source Files

| File | Purpose |
|---|---|
| `frontend/src/App.jsx` | Main router, auth, view transitions, notifications |
| `frontend/src/components/LiveCameraView.jsx` | Live camera via LiveKit, photo/video capture, observation |
| `frontend/src/components/LiveSessionView.jsx` | Summary → Intention Cards → Output session view |
| `frontend/src/components/IntentionCards.jsx` | Horizontal scrollable prediction cards (NEW) |
| `frontend/src/components/SessionSummary.jsx` | Session context header (NEW) |
| `frontend/src/components/OutputZone.jsx` | Streaming results + intermediate blocks (NEW) |
| `frontend/src/components/PersistentHtmlRenderer.jsx` | Streaming HTML iframe renderer |
| `frontend/src/components/iframeDesignSystem.js` | Glassmorphism CSS tokens for iframes |
| `frontend/src/components/modules/ModuleRenderer.jsx` | Native module type dispatcher |
| `frontend/src/components/modules/shared.jsx` | Glassmorphism design primitives |
| `frontend/src/components/modules/*.jsx` | 8 specialized module components |
| `frontend/src/components/HistoryView.jsx` | Session grid, search, navigation |
| `frontend/src/components/ProfileView.jsx` | Skills + Memory + Connections (NEW, evolves MemoryView) |
| `frontend/src/components/SkillsTab.jsx` | Skill management UI (NEW) |
| `frontend/src/hooks/useAgentProtocol.js` | LiveKit RPC + DataChannel protocol |
| `frontend/src/hooks/useIntentionCards.js` | Intention prediction subscription (NEW) |
| `frontend/src/hooks/useNanoClawResults.js` | Skill execution result streaming (NEW) |
| `frontend/src/services/api.js` | API client, auth, S3 upload, skill management |
| `frontend/src/sounds/` | Sound effects (SoundLibrary.js) |
