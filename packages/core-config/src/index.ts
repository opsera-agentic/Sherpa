import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

import {
  mergeWithDefaults,
  validateConfig,
  validatePartialStructure,
  type SherpaConfig,
} from './schema.js';

export type {
  AdapterToggle,
  AdaptersConfig,
  AuditConfigSection,
  EmbeddingConfigSection,
  EmbeddingOllamaSection,
  EmbeddingOpenAiSection,
  MemoryConfigSection,
  McpConfigSection,
  PrivacyConfigSection,
  SearchConfigSection,
  SecurityConfigSection,
  SherpaConfig,
  SkillsConfigSection,
  ValidationIssue,
  ValidationResult,
} from './schema.js';
export { mergeWithDefaults, validateConfig, validatePartialStructure } from './schema.js';
export { getDefaultConfig } from './defaults.js';

const CONFIG_FILENAME = 'sherpa.config.yaml';

export function getSherpaDir(projectRoot: string): string {
  return path.join(projectRoot, '.sherpa');
}

export function getSherpaConfigPath(projectRoot: string): string {
  return path.join(getSherpaDir(projectRoot), CONFIG_FILENAME);
}

export function getSherpaSkillsDir(projectRoot: string): string {
  return path.join(getSherpaDir(projectRoot), 'skills');
}

/** Loads `.sherpa/sherpa.config.yaml`, validates it, and merges defaults. */
export function loadConfig(projectRoot: string): SherpaConfig {
  const cfgPath = getSherpaConfigPath(projectRoot);
  if (!fs.existsSync(cfgPath)) {
    return mergeWithDefaults({});
  }

  const rawYaml = fs.readFileSync(cfgPath, 'utf8');
  const parsed: unknown = yaml.load(rawYaml);
  const partial = validatePartialStructure(parsed);
  if (!partial.ok) {
    const details = partial.issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid Sherpa configuration: ${details}`);
  }

  const merged = mergeWithDefaults(parsed);
  const result = validateConfig(merged);
  if (!result.ok) {
    const details = result.issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid Sherpa configuration: ${details}`);
  }

  return merged;
}

/** Back-compat alias for integrations expecting the older name. */
export const loadSherpaConfig = loadConfig;

export function serializeSherpaConfig(config: SherpaConfig): string {
  return yaml.dump(config, { lineWidth: 120, noRefs: true });
}
