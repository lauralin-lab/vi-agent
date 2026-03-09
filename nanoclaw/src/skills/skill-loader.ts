import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import type { SkillManifest } from '../channels/types.js';
import type { LoadedSkill } from './types.js';

/**
 * Load a skill by slug.
 * Priority: user skills (/workspace/skills/{slug}/) → shared skills (/skills/{slug}/)
 */
export async function loadSkill(slug: string): Promise<LoadedSkill | null> {
  // Try user skill first
  const userPath = join(config.userDataDir, 'skills', slug);
  const userSkill = await tryLoadFromPath(userPath, slug, true);
  if (userSkill) return userSkill;

  // Fall back to shared skill
  const sharedPath = join(config.sharedSkillsDir, slug);
  const sharedSkill = await tryLoadFromPath(sharedPath, slug, false);
  if (sharedSkill) return sharedSkill;

  // Fall back to experience packages (V5)
  const packagePath = join(config.packagesDir, slug);
  const packageSkill = await tryLoadFromPath(packagePath, slug, false);
  if (packageSkill) return packageSkill;

  console.warn(`[skill-loader] skill not found: ${slug}`);
  return null;
}

/**
 * Get all available skill manifests (user skills + shared skills only).
 * Experience packages are loaded separately via package-loader.ts.
 */
export async function getAllManifests(): Promise<SkillManifest[]> {
  const manifests: SkillManifest[] = [];
  const seen = new Set<string>();

  // User skills first (higher priority)
  const userSkillsDir = join(config.userDataDir, 'skills');
  await collectManifests(userSkillsDir, manifests, seen);

  // Shared skills
  await collectManifests(config.sharedSkillsDir, manifests, seen);

  return manifests;
}

async function tryLoadFromPath(
  dirPath: string,
  slug: string,
  isUserSkill: boolean,
): Promise<LoadedSkill | null> {
  try {
    await access(dirPath);
  } catch {
    return null;
  }

  try {
    const manifestPath = join(dirPath, 'manifest.json');
    const instructionMdPath = join(dirPath, 'instruction.md');
    const skillMdPath = join(dirPath, 'skill.md');

    // Prefer instruction.md, fall back to legacy skill.md
    let promptContent: string;
    try {
      promptContent = await readFile(instructionMdPath, 'utf-8');
    } catch {
      promptContent = await readFile(skillMdPath, 'utf-8');
    }

    const [manifestRaw] = await Promise.all([
      readFile(manifestPath, 'utf-8'),
    ]);

    const manifest: SkillManifest = JSON.parse(manifestRaw);

    // Validate OAuth requirements
    if (manifest.requirements?.oauth?.length) {
      const missingProviders = await checkOAuthRequirements(manifest.requirements.oauth);
      if (missingProviders.length > 0) {
        console.warn(
          `[skill-loader] skill ${slug} requires OAuth for: ${missingProviders.join(', ')}`,
        );
        // Still load the skill — executor can handle missing tokens gracefully
      }
    }

    return {
      manifest,
      promptContent,
      resolvedPath: dirPath,
      isUserSkill,
    };
  } catch (err) {
    console.warn(`[skill-loader] failed to load skill at ${dirPath}:`, err);
    return null;
  }
}

/** Check which OAuth providers are missing tokens */
async function checkOAuthRequirements(providers: string[]): Promise<string[]> {
  const missing: string[] = [];
  const tokensDir = join(config.userDataDir, 'tokens');

  for (const provider of providers) {
    try {
      await access(join(tokensDir, `${provider}.json`));
    } catch {
      missing.push(provider);
    }
  }

  return missing;
}

async function collectManifests(
  dir: string,
  out: SkillManifest[],
  seen: Set<string>,
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || seen.has(entry.name)) continue;
      try {
        const raw = await readFile(join(dir, entry.name, 'manifest.json'), 'utf-8');
        const manifest: SkillManifest = JSON.parse(raw);
        const key = manifest.slug || (manifest as unknown as Record<string, unknown>).id as string || entry.name;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!manifest.slug) manifest.slug = key;
        out.push(manifest);
      } catch {
        // skip dirs without valid manifest
      }
    }
  } catch {
    // dir doesn't exist yet
  }
}
