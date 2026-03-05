import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackageManifest, TemplateDefinition } from '../channels/types.js';

// ---------------------------------------------------------------------------
// Package Loader — discovers and loads Experience Packages
//
// Each package lives in packages/{package-id}/ and contains:
//   manifest.json           — PackageManifest definition
//   skill.md                — Skill prompt content
//   templates/*.json        — Bundled template schemas
//   tools/tools.json        — Custom tool definitions (optional)
//
// At startup, loadPackages() scans the directory and loads all valid
// packages. At runtime, getPackage() and listPackages() provide access.
// ---------------------------------------------------------------------------

/** A fully loaded experience package */
export interface LoadedPackage {
  manifest: PackageManifest;
  /** Skill prompt content (from skill.md) */
  skillPrompt: string;
  /** Bundled template definitions */
  templates: TemplateDefinition[];
  /** Custom tool definitions (from tools/tools.json) */
  toolDefinitions: ToolDefinition[];
  /** Absolute path where the package was loaded from */
  resolvedPath: string;
}

/** Tool definition from a package's tools.json */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Loaded packages, keyed by package ID */
const packages = new Map<string, LoadedPackage>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a directory for experience packages and load them all.
 *
 * @param packagesDir - Absolute path to the packages/ directory
 * @returns Array of loaded packages
 */
export async function loadPackages(packagesDir: string): Promise<LoadedPackage[]> {
  packages.clear();

  try {
    await access(packagesDir);
  } catch {
    console.warn(`[package-loader] packages directory not found: ${packagesDir}`);
    return [];
  }

  const entries = await readdir(packagesDir, { withFileTypes: true });
  const loaded: LoadedPackage[] = [];

  for (const entry of entries) {
    // Skip non-directories and special directories (e.g. _shared)
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) {
      continue;
    }

    const pkgDir = join(packagesDir, entry.name);
    const pkg = await tryLoadPackage(pkgDir, entry.name);

    if (pkg) {
      packages.set(pkg.manifest.id, pkg);
      loaded.push(pkg);
    }
  }

  console.log(
    `[package-loader] loaded ${loaded.length} packages: ${loaded.map((p) => p.manifest.id).join(', ')}`,
  );

  return loaded;
}

/**
 * Get a loaded package by ID.
 */
export function getPackage(packageId: string): LoadedPackage | undefined {
  return packages.get(packageId);
}

/**
 * List all loaded packages (manifests only, for lightweight enumeration).
 */
export function listPackages(): PackageManifest[] {
  return Array.from(packages.values()).map((p) => p.manifest);
}

/**
 * Get all loaded packages (full objects).
 */
export function getAllPackages(): LoadedPackage[] {
  return Array.from(packages.values());
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function tryLoadPackage(
  pkgDir: string,
  dirName: string,
): Promise<LoadedPackage | null> {
  // 1. Load manifest.json (required)
  const manifestPath = join(pkgDir, 'manifest.json');
  let manifest: PackageManifest;
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as PackageManifest;

    if (!manifest.id || !manifest.name) {
      console.warn(`[package-loader] skipping ${dirName}: manifest missing id or name`);
      return null;
    }
  } catch {
    // No manifest.json or invalid JSON — not a package
    return null;
  }

  // 2. Load skill prompt (from manifest.skill.prompt or default skill.md)
  const skillPromptFile = manifest.skill?.prompt ?? 'skill.md';
  let skillPrompt = '';
  try {
    skillPrompt = await readFile(join(pkgDir, skillPromptFile), 'utf-8');
  } catch {
    console.warn(
      `[package-loader] ${manifest.id}: skill prompt "${skillPromptFile}" not found, using empty prompt`,
    );
  }

  // 3. Load bundled templates
  const templates = await loadBundledTemplates(pkgDir);

  // 4. Load tool definitions
  const toolDefinitions = await loadToolDefinitions(pkgDir);

  return {
    manifest,
    skillPrompt,
    templates,
    toolDefinitions,
    resolvedPath: pkgDir,
  };
}

async function loadBundledTemplates(pkgDir: string): Promise<TemplateDefinition[]> {
  const templatesDir = join(pkgDir, 'templates');
  const defs: TemplateDefinition[] = [];

  try {
    await access(templatesDir);
  } catch {
    return defs;
  }

  try {
    const files = await readdir(templatesDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(templatesDir, file), 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.$id && parsed.slots) {
          defs.push(parsed as TemplateDefinition);
        }
      } catch (err) {
        console.warn(`[package-loader] failed to parse template ${file}:`, err);
      }
    }
  } catch {
    // templates dir read failed
  }

  return defs;
}

async function loadToolDefinitions(pkgDir: string): Promise<ToolDefinition[]> {
  const toolsPath = join(pkgDir, 'tools', 'tools.json');

  try {
    const raw = await readFile(toolsPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // tools.json can be an array of tool definitions or an object with a "tools" array
    if (Array.isArray(parsed)) {
      return parsed as ToolDefinition[];
    }
    if (parsed.tools && Array.isArray(parsed.tools)) {
      return parsed.tools as ToolDefinition[];
    }

    return [];
  } catch {
    // No tools file — that's fine
    return [];
  }
}
