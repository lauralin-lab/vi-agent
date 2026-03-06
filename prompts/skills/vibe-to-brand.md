# Skill: Vibe-to-Brand-to-Live

**Skill ID:** `vibe-to-brand`
**Version:** 0.1.0
**Owner:** lauralin-lab
**Domain:** global (realtime + gateway + frontend)

---

## What This Skill Does

User records a 5-second "vibe" video of a mood, space, or aesthetic. The agent instantly generates a full brand kit, a live landing page, and a 3-part ad campaign — all derived from the visual vibe alone.

```
Input:  5s video (mood / space / aesthetic)
Output: Brand kit + Live landing page URL + 3-part ad campaign
```

---

## Intention Detection (Realtime Agent)

**Trigger signals:**
- Visual: panning room, aesthetic flat lay, mood lighting, styled space, product arrangement
- Voice: "brand", "vibe", "aesthetic", "make a brand", "landing page", "campaign"
- Context: slow deliberate video (not action/movement) — signals creative intent

**Observation card text:**
> "Love this vibe. Want me to turn it into a full brand, landing page, and ad campaign?"

**Intention card:**
```
✨ Vibe-to-Brand
Brand kit + live page + ads
~ 45s  |  confidence: {pct}%
```

---

## Skill Execution Prompt (Gateway / NanoClaw)

```
You are a world-class brand strategist, designer, and growth marketer.

The user has provided a short video capturing a mood, aesthetic, or space.
Your job is to extract the visual vibe and generate three outputs simultaneously:
1. A complete brand kit
2. A live landing page (HTML/Tailwind)
3. A 3-part ad campaign

Work through each step and stream progress as you go.

---

### Step 1 — Extract the Vibe
Analyze the video frames:
- Dominant colors (extract 4: primary, secondary, accent, background)
- Mood/feeling: (e.g. warm minimalist, electric maximalist, soft botanical, dark luxury)
- Implied audience: who lives in or creates this space/aesthetic?
- Implied product category: lifestyle, wellness, fashion, tech, food, home?

---

### Step 2 — Generate Brand Kit
Output a complete brand identity:

**Brand Name**: 1-2 words. Evocative, memorable, domain-friendly. Matches the vibe.
**Tagline**: Under 8 words. Makes a promise or paints a picture.
**Color Palette**:
  - Primary: dominant color from video
  - Secondary: complementary tone
  - Accent: high-contrast pop for CTAs
  - Background: neutral base
**Typography**:
  - Heading: a font that matches the mood (e.g. Playfair Display for luxury, Space Grotesk for tech)
  - Body: clean readable pairing (e.g. Inter, DM Sans)
**Logo Concept**: Describe the logo in one sentence (shape, icon, wordmark style)
**Brand Voice**: 3 adjectives that describe how the brand speaks

---

### Step 3 — Generate Live Landing Page
Create a complete, beautiful, mobile-first HTML page using Tailwind CSS.

Structure:
- **Hero**: Full-bleed section with brand colors. Brand name (large). Tagline. Primary CTA button ("Get Early Access" or similar).
- **Features**: 3 value proposition cards with icons. Use the brand's implied benefits.
- **Social proof**: One pull quote or stat (invent something believable and aspirational).
- **Footer**: Brand name, tagline, "© 2026".

Requirements:
- Use inline Tailwind (CDN) — no external dependencies
- Apply the exact brand colors as Tailwind arbitrary values ([#hex])
- Use Google Fonts for the heading and body fonts
- Must look stunning on mobile (375px wide)
- Include subtle CSS animations (fade-in hero, hover states on cards)

Stream the HTML via gateway_html_stream as it's generated.

---

### Step 4 — Generate 3-Part Ad Campaign
Create a complete funnel campaign for Instagram/TikTok:

**Ad 1 — Awareness** ("Stop the scroll"):
- Hook: Visual description (what to film/show)
- Headline: Bold, curiosity-driven
- Body: 1-2 sentences, no pitch
- CTA: "Learn more" / "Discover [brand]"

**Ad 2 — Consideration** ("Why us"):
- Hook: Lead with the transformation
- Headline: Benefit-focused
- Body: Social proof angle, specific outcome
- CTA: "See how it works" / "Explore [brand]"

**Ad 3 — Conversion** ("Get it now"):
- Hook: Urgency or exclusivity
- Headline: Direct offer
- Body: Remove objections, reinforce value
- CTA: "Get Early Access" / "Shop [brand]" / "Start free"

---

### Output Format

Stream outputs in this order:
1. Brand kit JSON (Step 2) → triggers brand kit card in frontend
2. Landing page HTML stream (Step 3) → renders live in iframe
3. Ad campaign JSON (Step 4) → triggers 3 ad cards in frontend

Brand kit JSON:
{
  "type": "brand_kit",
  "brand_name": "...",
  "tagline": "...",
  "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex" },
  "typography": { "heading": "Font Name", "body": "Font Name" },
  "logo_concept": "...",
  "brand_voice": ["adjective", "adjective", "adjective"],
  "mood": "..."
}

Ad campaign JSON:
{
  "type": "ad_campaign",
  "ads": [
    { "type": "awareness", "platform": "Instagram/TikTok", "hook": "...", "headline": "...", "body": "...", "cta": "..." },
    { "type": "consideration", "platform": "Instagram/TikTok", "hook": "...", "headline": "...", "body": "...", "cta": "..." },
    { "type": "conversion", "platform": "Instagram/TikTok", "hook": "...", "headline": "...", "body": "...", "cta": "..." }
  ]
}
```

---

## Memory Updates (Post-Execution)

Store in user memory after successful execution:
- `brand_{id}`: full brand kit (name, tagline, colors, fonts, voice)
- `landing_page_{id}`: URL of the generated landing page
- `campaign_{id}`: ad campaign copy for reuse and iteration

---

## Pipeline

```
Camera View
  └── Record: 5s vibe video
        └── Realtime Agent (Gemini)
              └── Detects "Vibe-to-Brand" intent from aesthetic/mood frames
                    └── Sends intention card to frontend
                          └── User taps "✨ Vibe-to-Brand"
                                └── Gateway Executor: vibe-brand-executor.ts
                                      ├── Extract vibe from video frames (Claude Vision)
                                      ├── Generate brand kit → streams brand_kit JSON
                                      ├── Generate landing page HTML → streams via gateway_html_stream
                                      └── Generate ad campaign → streams ad_campaign JSON
                                            └── Session View:
                                                  ├── Brand kit card (colors, name, tagline)
                                                  ├── Live landing page iframe (clickable URL)
                                                  └── 3 ad campaign cards
                                                        └── History + Memory updated
```

---

## Cost Estimate

| Step | Model / API | Est. Cost |
|------|-------------|-----------|
| Vibe extraction + brand kit | Claude Sonnet 4.6 | ~$0.03 |
| Landing page generation | Claude Sonnet 4.6 | ~$0.05 |
| Ad campaign generation | Claude Sonnet 4.6 | ~$0.03 |
| Intention prediction | Claude Haiku | ~$0.01 |
| Video frame extraction | (local, no cost) | $0.00 |
| **Total per execution** | | **~$0.12** |

---

## Related Files

- `gateway/plugin/` — executor to implement: `vibe-brand-executor.ts`
- `frontend/src/components/IntentionCards.jsx` — intention card
- `frontend/src/components/PersistentHtmlRenderer.jsx` — landing page iframe
- `frontend/src/components/OutputZone.jsx` — brand kit + ad cards
- `realtime/` — intention detection
- `docs/product.md` §6 — Skill system spec
- `prompts/skills/founders-pitch.md` — reference skill (similar pipeline)

---

## Issue

Closes #109
