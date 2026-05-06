import type { AdapterContext, SkillSummary } from './types.js';

/**
 * Canonical structured representation of an adapter file. Every adapter must be
 * able to round-trip a `SectionDoc` through `generate()` and `parse()` such that
 * regenerating from the parsed result is byte-identical to the original output.
 */
export interface SectionDoc {
  readonly version: 1;
  projectName: string;
  projectDescription: string;
  conventions: string;
  decisions: string[];
  skills: SkillSummary[];
  preferences: Record<string, string>;
  /** Adapter-specific fields preserved verbatim across round-trips. */
  extras: Record<string, string>;
}

export function emptySectionDoc(): SectionDoc {
  return {
    version: 1,
    projectName: '',
    projectDescription: '',
    conventions: '',
    decisions: [],
    skills: [],
    preferences: {},
    extras: {},
  };
}

export function sectionDocFromContext(ctx: AdapterContext): SectionDoc {
  return {
    version: 1,
    projectName: ctx.projectName,
    projectDescription: ctx.projectDescription,
    conventions: ctx.conventions,
    decisions: [...ctx.decisions],
    skills: ctx.skills.map((s) => ({ ...s, tags: [...s.tags] })),
    preferences: { ...ctx.preferences },
    extras: {},
  };
}

export function contextFromSectionDoc(doc: SectionDoc): AdapterContext {
  return {
    projectName: doc.projectName,
    projectDescription: doc.projectDescription,
    conventions: doc.conventions,
    decisions: [...doc.decisions],
    skills: doc.skills.map((s) => ({ ...s, tags: [...s.tags] })),
    preferences: { ...doc.preferences },
  };
}
