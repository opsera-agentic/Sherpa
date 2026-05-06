import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir } from '@sherpa/core-config';
import { createDefaultAdapterRegistry, type AdapterContext } from '@sherpa/core-adapters';
import { loadSkills } from '@sherpa/core-skills';


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
  const logger = createLogger('adapt', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);
  const registry = createDefaultAdapterRegistry();
  const names = opts.agent ? [opts.agent] : registry.names();

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
}
