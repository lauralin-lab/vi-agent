import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  TemplateDefinition,
  TemplateRegistry,
  TemplateRegistryEntry,
  TemplateSlot,
  CardCategory,
  RendererType,
} from '../channels/types.js';

// ---------------------------------------------------------------------------
// Template Registry — discovers and indexes all card template JSON schemas
//
// Templates live in two locations:
//   packages/_shared/*.json       — shared templates (cross-package)
//   packages/*/templates/*.json   — bundled per-package templates
//
// At startup, loadTemplateRegistry() scans both paths and builds an indexed
// registry. At runtime, getAllTemplates() returns template definitions for
// system prompt injection.
// ---------------------------------------------------------------------------

/** Full template definitions, keyed by $id */
const templateDefs = new Map<string, TemplateDefinition>();

/** Compiled registry (lightweight entries for prompt/API) */
let registry: TemplateRegistry | null = null;

// ---------------------------------------------------------------------------
// Freeform HTML fallback template
// ---------------------------------------------------------------------------

const FREEFORM_HTML_TEMPLATE: TemplateDefinition = {
  $id: 'freeform-html',
  category: 'present',
  renderer: 'html',
  mutable: false,
  streamable: true,
  description: 'Freeform HTML card — escape hatch for content that no structured template covers',
  source: 'builtin',
  slots: {
    html: {
      type: 'string',
      required: true,
      streamable: true,
    },
  },
  streamable_slots: ['html'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan packages directory and build the template registry.
 *
 * @param packagesDir - Absolute path to the packages/ directory
 * @returns The compiled TemplateRegistry
 */
export async function loadTemplateRegistry(
  packagesDir: string,
): Promise<TemplateRegistry> {
  templateDefs.clear();

  // Always register the freeform-html fallback
  templateDefs.set(FREEFORM_HTML_TEMPLATE.$id, FREEFORM_HTML_TEMPLATE);

  // 1. Load shared templates: packages/_shared/*.json
  const sharedDir = join(packagesDir, '_shared');
  await loadTemplatesFromDir(sharedDir, 'shared');

  // 2. Load bundled templates: packages/*/templates/*.json
  try {
    const entries = await readdir(packagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

      const templatesDir = join(packagesDir, entry.name, 'templates');
      await loadTemplatesFromDir(templatesDir, `package:${entry.name}`);
    }
  } catch {
    // packages directory may not exist
  }

  // 3. Build the lightweight registry
  registry = buildRegistry();

  console.log(
    `[template-registry] loaded ${templateDefs.size} templates (${registry ? Object.keys(registry.templates).length : 0} entries)`,
  );

  return registry;
}

/**
 * Get all loaded template definitions.
 */
export function getAllTemplates(): TemplateDefinition[] {
  return Array.from(templateDefs.values());
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function loadTemplatesFromDir(dir: string, source: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    return; // directory does not exist
  }

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const raw = await readFile(join(dir, file), 'utf-8');
        const parsed = JSON.parse(raw);

        // Validate minimum required fields
        if (!parsed.$id || !parsed.slots) {
          console.warn(`[template-registry] skipping ${file}: missing $id or slots`);
          continue;
        }

        const def = parseTemplateDefinition(parsed, source);

        // Don't overwrite shared templates with bundled duplicates
        // (shared templates take priority since they're the canonical versions)
        if (!templateDefs.has(def.$id)) {
          templateDefs.set(def.$id, def);
        }
      } catch (err) {
        console.warn(`[template-registry] failed to parse ${join(dir, file)}:`, err);
      }
    }
  } catch (err) {
    console.warn(`[template-registry] failed to read dir ${dir}:`, err);
  }
}

function parseTemplateDefinition(
  raw: Record<string, unknown>,
  source: string,
): TemplateDefinition {
  const slots = raw.slots as Record<string, TemplateSlot>;

  // Derive streamable_slots and mutable_slots from slot definitions if not provided
  const streamableSlots: string[] = [];
  const mutableSlots: string[] = [];

  if (slots) {
    for (const [name, slot] of Object.entries(slots)) {
      if (slot.streamable) streamableSlots.push(name);
      if (slot.mutable) mutableSlots.push(name);
    }
  }

  return {
    $id: raw.$id as string,
    category: (raw.category as CardCategory) ?? 'present',
    renderer: (raw.renderer as RendererType) ?? 'html',
    component: raw.component as string | undefined,
    mutable: (raw.mutable as boolean) ?? false,
    streamable: (raw.streamable as boolean) ?? false,
    description: (raw.description as string) ?? '',
    source,
    slots: slots ?? {},
    mutable_slots:
      (raw.mutable_slots as string[]) ??
      (mutableSlots.length > 0 ? mutableSlots : undefined),
    streamable_slots:
      (raw.streamable_slots as string[]) ??
      (streamableSlots.length > 0 ? streamableSlots : undefined),
  };
}

function defToEntry(def: TemplateDefinition): TemplateRegistryEntry {
  return {
    category: def.category,
    renderer: def.renderer,
    component: def.component,
    source: def.source ?? 'unknown',
    mutable: def.mutable,
    streamable: def.streamable,
    description: def.description ?? '',
  };
}

function buildRegistry(): TemplateRegistry {
  const templates: Record<string, TemplateRegistryEntry> = {};
  for (const [id, def] of templateDefs) {
    templates[id] = defToEntry(def);
  }
  return {
    version: '1.0.0',
    templates,
  };
}
