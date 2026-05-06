import type { Skill } from '@sherpa/core-skills';

export type StarterTemplateId = 'web-app' | 'library' | 'cli-tool' | 'monorepo';

/** Payload merged into defaults via `mergeWithDefaults` before serializing `sherpa.config.yaml`. */
export interface StarterTemplateData {
  conventions: string;
  config: Record<string, unknown>;
  skills: Skill[];
}
