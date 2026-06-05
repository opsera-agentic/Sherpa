import fs from 'node:fs';
import path from 'node:path';

import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { createDefaultAdapterRegistry, type AdapterContext } from '@sherpa/core-adapters';
import { loadSkills } from '@sherpa/core-skills';

export interface PlannedAdapterOutput {
  agent: string;
  filePath: string;
  content: string;
  valid: boolean;
  warnings: string[];
}

export interface PlanAdapterResult {
  planned: PlannedAdapterOutput[];
  agents: string[];
  disabledAdapters: string[];
}

export function readDecisions(decisionsDir: string): string[] {
  if (!fs.existsSync(decisionsDir)) return [];
  return fs
    .readdirSync(decisionsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(decisionsDir, f), 'utf8').trim())
    .filter(Boolean);
}

export function buildAdapterContext(projectRoot: string, sherpaDir: string): AdapterContext {
  const conventionsPath = path.join(sherpaDir, 'conventions.md');
  const decisions = readDecisions(path.join(sherpaDir, 'decisions'));
  const skills = loadSkills(sherpaDir).map((s) => ({
    name: s.name,
    description: s.description,
    tags: s.tags,
  }));

  const pkgPath = path.join(projectRoot, 'package.json');
  let projectName = path.basename(projectRoot);
  let projectDescription = '';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; description?: string };
      projectName = pkg.name ?? projectName;
      projectDescription = pkg.description ?? '';
    } catch {
      /* ignore malformed package.json */
    }
  }

  return {
    conventions: fs.existsSync(conventionsPath) ? fs.readFileSync(conventionsPath, 'utf8') : '',
    preferences: {},
    skills,
    decisions,
    projectName,
    projectDescription,
  };
}

function resolveAdapterNames(
  projectRoot: string,
  agentFilter?: string,
  onDisabledOverride?: (agent: string) => void,
): { names: string[]; disabledAdapters: string[] } {
  const config = loadSherpaConfig(projectRoot);
  const registry = createDefaultAdapterRegistry();
  const disabled = new Set(config.adapters.disabled);

  if (agentFilter) {
    if (disabled.has(agentFilter)) {
      onDisabledOverride?.(agentFilter);
    }
    return { names: [agentFilter], disabledAdapters: [...disabled] };
  }

  return {
    names: registry.names().filter((n) => !disabled.has(n)),
    disabledAdapters: [...disabled],
  };
}

/** Generate adapter outputs in memory without writing to disk. */
export function planAdapterOutputs(
  projectRoot: string,
  agentFilter?: string,
  onDisabledOverride?: (agent: string) => void,
): PlanAdapterResult {
  const sherpaDir = getSherpaDir(projectRoot);
  const registry = createDefaultAdapterRegistry();
  const { names, disabledAdapters } = resolveAdapterNames(projectRoot, agentFilter, onDisabledOverride);
  const context = buildAdapterContext(projectRoot, sherpaDir);
  const planned: PlannedAdapterOutput[] = [];

  for (const name of names) {
    const adapter = registry.get(name);
    if (!adapter) {
      throw new Error(`Unknown adapter "${name}".`);
    }
    const output = adapter.generate(context);
    const validation = adapter.validate(output);
    planned.push({
      agent: name,
      filePath: output.filePath,
      content: output.content,
      valid: validation.valid,
      warnings: [...output.warnings, ...validation.warnings],
    });
  }

  return { planned, agents: names, disabledAdapters };
}
