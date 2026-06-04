import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { createDefaultAdapterRegistry, type AdapterContext } from '@sherpa/core-adapters';
import { loadSkills } from '@sherpa/core-skills';
import { withTelemetry } from '../telemetry.js';


export interface AdaptCommandOptions extends LoggerOptions {
  projectRoot: string;
  agent?: string;
}

function readDecisions(decisionsDir: string): string[] {
  if (!fs.existsSync(decisionsDir)) return [];
  return fs
    .readdirSync(decisionsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(decisionsDir, f), 'utf8').trim())
    .filter(Boolean);
}

export async function runAdapt(opts: AdaptCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'adapt', async () => {
    return await _runAdapt(opts);
  });
}

async function _runAdapt(opts: AdaptCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('adapt', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);
  const config = loadSherpaConfig(opts.projectRoot);
  const registry = createDefaultAdapterRegistry();

  // Honor config.adapters.disabled, matching `sherpa sync`. A bulk `adapt`
  // skips disabled adapters; an explicit `--agent X` is an explicit override
  // (generate it, but warn so the contradiction is visible).
  const disabled = new Set(config.adapters.disabled);
  let names: string[];
  if (opts.agent) {
    names = [opts.agent];
    if (disabled.has(opts.agent)) {
      logger.warn(
        'adapt.disabled',
        `Adapter ${opts.agent} is disabled in config but was explicitly requested — generating anyway`,
      );
    }
  } else {
    names = registry.names().filter((n) => !disabled.has(n));
  }

  const conventionsPath = path.join(sherpaDir, 'conventions.md');
  const decisions = readDecisions(path.join(sherpaDir, 'decisions'));
  const skills = loadSkills(sherpaDir).map((s) => ({
    name: s.name,
    description: s.description,
    tags: s.tags,
  }));

  const pkgPath = path.join(opts.projectRoot, 'package.json');
  let projectName = path.basename(opts.projectRoot);
  let projectDescription = '';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; description?: string };
      projectName = pkg.name ?? projectName;
      projectDescription = pkg.description ?? '';
    } catch {
      /* ignore */
    }
  }

  const context: AdapterContext = {
    conventions: fs.existsSync(conventionsPath) ? fs.readFileSync(conventionsPath, 'utf8') : '',
    preferences: {},
    skills,
    decisions,
    projectName,
    projectDescription,
  };

  const report: Array<{ agent: string; filePath: string; valid: boolean; warnings: string[] }> = [];

  for (const name of names) {
    const adapter = registry.get(name);
    if (!adapter) {
      logger.error('adapt.missing', `Unknown adapter ${name}`);
      continue;
    }
    const output = adapter.generate(context);
    const validation = adapter.validate(output);
    const target = path.join(opts.projectRoot, output.filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output.content, 'utf8');
    report.push({ agent: name, filePath: output.filePath, valid: validation.valid, warnings: validation.warnings });
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ results: report })}\n`);
  } else {
    logger.info('adapt.summary', `Generated ${report.length} adapter targets`);
    for (const row of report) {
      process.stdout.write(`${row.agent} -> ${row.filePath} (valid=${row.valid})\n`);
    }
  }

  return {
    adaptersGenerated: report.length,
    agents: names,
    disabledAdapters: [...disabled],
    validCount: report.filter((r) => r.valid).length,
    warningCount: report.reduce((sum, r) => sum + r.warnings.length, 0),
  };
}
