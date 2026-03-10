import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { PredictedIntention, SkillManifest } from '../channels/types.js';

let client: Anthropic | null = null;
let lastSceneHash: string | null = null;
let lastIntentions: PredictedIntention[] = [];

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `You are an intention predictor for a personal AI assistant. Given the user's current context and visual scene, predict 3-5 creative, specific actions the user would likely want to do RIGHT NOW.

Your suggestions should be driven by WHAT YOU SEE in the image and the user's context — not limited to a fixed list of skills. Think creatively about what would be genuinely useful.

Respond with a JSON array. Each intention must have:
- id: unique string (e.g., "intent-1")
- skill_slug: slug of a matching skill if one fits, OR null if no skill matches (the system handles both)
- title: short, specific action title based on what you see (e.g., "Count calories in this pasta", NOT generic "Analyze food")
- description: one-sentence description of the specific result the user would get
- confidence: 0.0 to 1.0
- icon: single emoji representing the action
- params: any pre-filled parameters from context

Rules:
- Be SPECIFIC to what you see. "Identify this plant species" > "Analyze photo". "Find matching shoes for this outfit" > "Style advice".
- If available skills match, use their skill_slug. Otherwise set skill_slug to null — freeform intentions are fully supported.
- At least 2 suggestions should be creative/unexpected — things the user might not think to ask but would find delightful.
- Order by relevance to the visual scene, then confidence descending.
- Respond with ONLY the JSON array, no markdown fences.`;

/**
 * Predict user intentions based on context snapshot and available skills.
 * Calls Claude Haiku for fast, cheap predictions (~$0.002/call).
 * Skips if scene hasn't changed and no new actions detected.
 */
export async function predictIntentions(
  contextSnapshot: string | null,
  latestFrameUrl: string | undefined,
  availableSkills: SkillManifest[],
): Promise<PredictedIntention[]> {
  // If snapshot is null, return cached predictions (scene unchanged, no new actions)
  if (contextSnapshot === null) {
    return lastIntentions;
  }

  const skillNote = availableSkills.length
    ? `\n(Note: these specialized skills exist: ${availableSkills.map((s) => s.slug).join(', ')}. Use their slug when relevant, otherwise set skill_slug to null.)`
    : '';

  const textParts = [
    `## Current Context\n${contextSnapshot}`,
    `\nPredict 3-5 creative, specific intentions as a JSON array. Focus on what you SEE, not on pre-built skills.${skillNote}`,
  ].join('\n\n');

  const content: Anthropic.MessageCreateParams['messages'][0]['content'] =
    latestFrameUrl
      ? [
          { type: 'image' as const, source: { type: 'url' as const, url: latestFrameUrl } },
          { type: 'text' as const, text: textParts },
        ]
      : textParts;

  try {
    const response = await getClient().messages.create({
      model: config.intentionModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    let text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    let intentions: PredictedIntention[];
    try {
      intentions = JSON.parse(text);
    } catch (parseErr) {
      console.warn('[intention-predictor] failed to parse response as JSON:', parseErr);
      return lastIntentions;
    }
    lastIntentions = intentions;
    return intentions;
  } catch (err) {
    console.error('[intention-predictor] prediction failed:', err);
    return lastIntentions; // return stale predictions on failure
  }
}

/** Update the scene hash tracker (used for dedup optimization) */
export function updateSceneHash(hash: string): boolean {
  const changed = hash !== lastSceneHash;
  lastSceneHash = hash;
  return changed;
}
