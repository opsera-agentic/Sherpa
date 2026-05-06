import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository, scanForSecrets } from '@sherpa/core-memory';
import { createDefaultAdapterRegistry, type AdapterContext } from '@sherpa/core-adapters';
import { loadSkills } from '@sherpa/core-skills';

export interface SyncCommandOptions extends LoggerOptions {
  projectRoot: string;
}

function readDecisions(decisionsDir: string): string[] {
  if (!fs.existsSync(decisionsDir)) return [];
  return fs
    .readdirSync(decisionsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(decisionsDir, f), 'utf8').trim())
    .filter(Boolean);
}

export async function runSync(opts: SyncCommandOptions): Promise<void> {
  const logger = createLogger('sync', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);
  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = pathFromRoot(opts.projectRoot, config.memory.databasePath);
  const memory = new MemoryRepository(dbPath);

  let entriesUpdated = 0;

  const conventionsPath = path.join(sherpaDir, 'conventions.md');
  if (fs.existsSync(conventionsPath)) {
    const body = fs.readFileSync(conventionsPath, 'utf8');
    if (config.privacy.redactSecrets) {
      const scan = scanForSecrets(body);
      if (scan.found) {
        const rules = [...new Set(scan.matches.map((m) => m.ruleId))].join(', ');
        logger.warn(
          'sync.secrets',
          `conventions.md contains ${scan.matches.length} potential secret(s) (rules: ${rules}). Review and remove before committing.`,
        );
      }
    }
    memory.upsertEntry({
      workspace_id: 'default',
      title: 'conventions',
      body,
      type: 'conventions',
      tags: [],
      classification: 'internal',
    });
    entriesUpdated += 1;
  }

  const decisions = readDecisions(path.join(sherpaDir, 'decisions'));
  decisions.forEach((content, idx) => {
    if (config.privacy.redactSecrets) {
      const scan = scanForSecrets(content);
      if (scan.found) {
        const rules = [...new Set(scan.matches.map((m) => m.ruleId))].join(', ');
        logger.warn(
          'sync.secrets',
          `decision-${idx + 1} contains ${scan.matches.length} potential secret(s) (rules: ${rules}).`,
        );
      }
    }
    memory.upsertEntry({
      workspace_id: 'default',
      title: `decision-${idx + 1}`,
      body: content,
      type: 'decision',
      tags: [],
      classification: 'internal',
    });
    entriesUpdated += 1;
  });

  // Index README.md as a reference entry for search discoverability
  const readmePath = path.join(opts.projectRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readmeBody = fs.readFileSync(readmePath, 'utf8').trim();
    if (readmeBody) {
      memory.upsertEntry({
        workspace_id: 'default',
        title: 'README',
        body: readmeBody,
        type: 'reference',
        tags: ['readme', 'overview'],
        classification: 'public',
      });
      entriesUpdated += 1;
    }
  }

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
      /* ignore malformed package.json */
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

  const registry = createDefaultAdapterRegistry();
  let adaptersRegenerated = 0;
  const adapterRoot = path.join(sherpaDir, 'adapters');
  fs.mkdirSync(adapterRoot, { recursive: true });
  for (const name of registry.names()) {
    const adapter = registry.get(name)!;
    const output = adapter.generate(context);
    const target = path.join(adapterRoot, output.filePath.replace(/\//g, '__'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output.content, 'utf8');
    adaptersRegenerated += 1;
  }

  const indexStats = memory.reindexAll();

  logger.info('sync.summary', 'Sherpa workspace synchronized', {
    entriesUpdated,
    adaptersRegenerated,
    chunksIndexed: indexStats.chunks,
  });

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({
        entriesUpdated,
        adaptersRegenerated,
        chunksIndexed: indexStats.chunks,
      })}\n`,
    );
  } else {
    process.stdout.write(
      `Sync complete — entries upserted: ${entriesUpdated}, adapters regenerated: ${adaptersRegenerated}, chunks indexed: ${indexStats.chunks}\n`,
    );
  }

  memory.close();
}

function pathFromRoot(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}
