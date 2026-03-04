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

const SYSTEM_PROMPT = `You are an intention predictor for a personal AI assistant. Given the user's current context, visual scene, and available skills, predict 3-5 likely user intentions that map to available skills.

Respond with a JSON array of intentions. Each intention must have:
- id: unique string (e.g., "intent-1")
- skill_slug: slug of the matching skill
- title: short action title (e.g., "Analyze this recipe")
- description: one-sentence description of what would happen
- confidence: 0.0 to 1.0
- icon: single emoji representing the action
- params: any pre-filled parameters from context

Only suggest intentions for skills that are actually available. Order by confidence descending.
Respond with ONLY the JSON array, no markdown fences.`;

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
  if (availableSkills.length === 0) {
    return [];
  }

  // If snapshot is null, return cached predictions (scene unchanged, no new actions)
  if (contextSnapshot === null) {
    return lastIntentions;
  }

  const skillList = availableSkills
    .map((s) => `- ${s.slug}: ${s.name} — ${s.description} (category: ${s.category})`)
    .join('\n');

  const textParts = [
    `## Current Context\n${contextSnapshot}`,
    `## Available Skills\n${skillList}`,
    `\nPredict 3-5 likely user intentions as a JSON array.`,
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
