# Skill: Founder's Pitch

**Skill ID:** `founders-pitch`
**Version:** 0.1.0
**Owner:** lauralin-lab
**Domain:** global (realtime + gateway + frontend)

---

## What This Skill Does

The user scans their own face and a physical product. The agent generates a high-end 30-second demo video featuring the founder's AI avatar pitching the product — voice, likeness, script, and visuals all generated end-to-end.

```
Input:  Founder photo (face) + Product photo(s)
Output: 30s MP4 demo video — AI avatar of the founder pitching the product
```

---

## Intention Detection (Realtime Agent)

**Trigger signals:**
- Visual: human face + physical object in same frame or back-to-back captures
- Voice: "pitch", "demo video", "investor", "product video", "show my product"
- Context: multiple captures within one session (face + object)

**Observation card text:**
> "I see you and your product. Want me to create your 30s pitch video?"

**Intention card:**
```
🎬 Founder's Pitch
Create your 30s demo video
~ 60s  |  confidence: {pct}%
```

---

## Skill Execution Prompt (Gateway / NanoClaw)

```
You are an expert pitch video producer and AI avatar director.

The user has provided:
1. A photo of themselves (the founder)
2. One or more photos of their physical product

Your job is to produce a 30-second demo video where the founder's AI avatar pitches the product. Follow these steps:

### Step 1 — Analyze Inputs
- Identify the founder's appearance from the photo
- Identify the product: name (if visible), category, key visual features
- Infer the product's core value proposition from its appearance

### Step 2 — Write the Pitch Script (30 seconds = ~75 words)
Structure:
- 0-5s:  Hook — one bold claim about the problem
- 5-15s: Product reveal — what it is, what it does
- 15-25s: Proof / differentiator — why it's different
- 25-30s: CTA — "Try it. [Product name]. Link in bio."

Tone: confident, warm, authentic — the founder's voice, not a salesperson.

### Step 3 — Generate Avatar Video
Call the video generation tool with:
- avatar_source: founder photo
- script: the pitch script
- voice_style: "founder" (natural, conversational)
- product_visuals: product photos (B-roll overlay at 5-15s mark)
- duration: 30
- format: mp4
- aspect_ratio: 9:16 (vertical, mobile-first)

### Step 4 — Return Result
Stream progress updates at each step. Return the final video as an artifact.

Output format:
{
  "type": "video_artifact",
  "title": "{Product Name} — Founder's Pitch",
  "script": "...",
  "video_url": "...",
  "duration_seconds": 30,
  "thumbnail_url": "..."
}
```

---

## Memory Updates (Post-Execution)

Store in user memory after successful execution:
- `founder_profile`: { photo_ref, name (if provided) }
- `product_{id}`: { name, category, description, photo_ref }
- `pitch_script_{id}`: the generated script (reusable for future iterations)

---

## Pipeline

```
Camera View
  └── Capture: founder face photo + product photo(s)
        └── Realtime Agent (Gemini)
              └── Detects "Founder's Pitch" intent
                    └── Sends intention card to frontend
                          └── User taps card
                                └── Gateway Executor: founders-pitch
                                      ├── Script generation (Claude Sonnet)
                                      ├── Avatar video generation (HeyGen / D-ID API)
                                      └── Streams progress → final MP4
                                            └── Session View: video artifact
                                                  └── History: saved with thumbnail
                                                        └── Memory: founder + product stored
```

---

## Cost Estimate

| Step | Model / API | Est. Cost |
|------|-------------|-----------|
| Script generation | Claude Sonnet 4.6 | ~$0.02 |
| Avatar video (30s) | HeyGen / D-ID | ~$0.30–0.50 |
| Intention prediction | Claude Haiku | ~$0.01 |
| **Total per execution** | | **~$0.33–0.53** |

---

## Related Files

- `gateway/plugin/` — executor adapter (to be implemented: `founders-pitch-executor.ts`)
- `frontend/src/components/IntentionCards.jsx` — intention card display
- `frontend/src/components/OutputZone.jsx` — video artifact rendering
- `realtime/` — intention detection logic
- `docs/product.md` §6 — Skill system spec

---

## Issue

Closes #78
