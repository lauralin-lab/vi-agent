import type { SkillManifest } from '../channels/types.js';

/** A fully loaded skill ready for execution */
export interface LoadedSkill {
  manifest: SkillManifest;
  /** The skill.md prompt content */
  promptContent: string;
  /** Resolved path where the skill was found */
  resolvedPath: string;
  /** Whether this is a user-customized skill */
  isUserSkill: boolean;
}
