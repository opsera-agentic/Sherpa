import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository, scanForSecrets } from '@sherpa/core-memory';
import { createDefaultAdapterRegistry, type AdapterContext } from '@sherpa/core-adapters';
import { loadSkills } from '@sherpa/core-skills';
import { AuditService } from '@sherpa/core-audit';
import { parseFile } from '@sherpa/infra-parser';
import { createEmbeddingProvider, type EmbeddingProvider } from '@sherpa/infra-embedding';
import { withTelemetry } from '../telemetry.js';

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
  await withTelemetry(opts.projectRoot, 'sync', async () => {
    return await _runSync(opts);
  });
}

async function _runSync(opts: SyncCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('sync', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);
  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = pathFromRoot(opts.projectRoot, config.memory.databasePath);
  const memory = new MemoryRepository(dbPath);

  // Wire audit.integrityChecksOnStartup — verify hash chain before syncing
  if (config.audit.enabled && config.audit.integrityChecksOnStartup) {
    const audit = new AuditService(memory.getDatabase(), opts.projectRoot, config.audit.jsonlRotation);
    const verification = audit.verify();
    if (!verification.valid) {
      logger.warn('sync.audit', `Audit integrity check failed: ${verification.errors.length} error(s)`);
      for (const err of verification.errors.slice(0, 5)) {
        logger.warn('sync.audit', err);
      }
    }
  }

  // NOTE: config.security.requireTlsForRemoteProviders / config.security.allowedHosts — No HTTP client in CLI; reserved for future remote embedding provider support.

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

  // Index common project config files for search discoverability
  const projectConfigs: Array<{ file: string; tags: string[] }> = [
    { file: 'package.json', tags: ['npm', 'dependencies'] },
    { file: 'tsconfig.json', tags: ['typescript', 'compiler'] },
    { file: 'Dockerfile', tags: ['docker', 'container'] },
    { file: 'pyproject.toml', tags: ['python', 'build'] },
    { file: 'build.gradle', tags: ['gradle', 'java'] },
  ];
  for (const { file, tags } of projectConfigs) {
    const cfgPath = path.join(opts.projectRoot, file);
    if (fs.existsSync(cfgPath)) {
      const body = fs.readFileSync(cfgPath, 'utf8').trim();
      if (body) {
        memory.upsertEntry({
          workspace_id: 'default',
          title: file,
          body,
          type: 'project-config',
          tags: ['project-config', ...tags],
          classification: 'public',
        });
        entriesUpdated += 1;
      }
    }
  }

  // Index GitHub Actions workflows
  const workflowsDir = path.join(opts.projectRoot, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    for (const f of fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
      const body = fs.readFileSync(path.join(workflowsDir, f), 'utf8').trim();
      if (body) {
        memory.upsertEntry({
          workspace_id: 'default',
          title: `.github/workflows/${f}`,
          body,
          type: 'project-config',
          tags: ['project-config', 'github-actions', 'ci'],
          classification: 'public',
        });
        entriesUpdated += 1;
      }
    }
  }

  // Opt-in: index JS/TS source files via infra-parser
  if (config.sync.indexSourceFiles) {
    const sourceFiles = discoverSourceFiles(opts.projectRoot);
    for (const relPath of sourceFiles.slice(0, 50)) {
      const absPath = path.join(opts.projectRoot, relPath);
      const content = fs.readFileSync(absPath, 'utf8');
      const lang = relPath.endsWith('.ts') ? 'typescript' : 'javascript';
      try {
        const chunks = parseFile(relPath, content, lang);
        for (const chunk of chunks) {
          memory.upsertEntry({
            workspace_id: 'default',
            title: `${path.basename(relPath)}:${chunk.metadata.node_type}@L${chunk.metadata.start_line}`,
            body: chunk.content,
            type: 'source-chunk',
            tags: ['source', lang, chunk.metadata.node_type],
            classification: 'internal',
          });
          entriesUpdated += 1;
        }
      } catch {
        logger.warn('sync.source', `Skipped ${relPath}: parse error`);
      }
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
  const disabledAdapters = new Set(config.adapters.disabled);
  let adaptersRegenerated = 0;
  const adapterRoot = path.join(sherpaDir, 'adapters');
  fs.mkdirSync(adapterRoot, { recursive: true });
  for (const name of registry.names()) {
    if (disabledAdapters.has(name)) continue;
    const adapter = registry.get(name)!;
    const output = adapter.generate(context);
    const target = path.join(adapterRoot, output.filePath.replace(/\//g, '__'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output.content, 'utf8');
    adaptersRegenerated += 1;
  }

  // Compute and persist chunk embeddings only when the search provider
  // actually uses vectors. For the default bm25 provider this stays a pure
  // keyword index (no wasted embedding work, no surprise network calls).
  const wantsVectors = config.search.provider === 'hybrid' || config.search.provider === 'vector';
  let embedder: EmbeddingProvider | undefined;
  if (wantsVectors) {
    try {
      embedder = createEmbeddingProvider({
        provider: config.embedding.provider as 'tfidf' | 'openai' | 'ollama',
        dimensions: config.embedding.dimensions,
        openai: config.embedding.openai,
        ollama: config.embedding.ollama,
      });
    } catch (err) {
      logger.warn(
        'sync.embedding',
        `Vector search is configured but the embedding provider is unavailable (${String(err)}); indexing without embeddings`,
      );
    }
  }

  let indexStats: { entries: number; chunks: number };
  try {
    indexStats = await memory.reindexAll(embedder);
  } catch (err) {
    if (embedder) {
      logger.warn('sync.embedding', `Embedding failed (${String(err)}); reindexing without vectors`);
      indexStats = await memory.reindexAll();
    } else {
      throw err;
    }
  }

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

  // Collect which adapters were generated (e.g. ["claude-code", "cursor", "copilot"])
  const activeAdapters = registry.names().filter((n) => !disabledAdapters.has(n));

  return {
    entriesUpdated,
    adaptersRegenerated,
    activeAdapters,
    disabledAdapters: [...disabledAdapters],
    chunksIndexed: indexStats.chunks,
    sourceIndexingEnabled: config.sync.indexSourceFiles,
  };
}

function discoverSourceFiles(root: string): string[] {
  const dirs = ['src', 'lib'];
  const exts = ['.js', '.ts'];
  const ignore = new Set(['node_modules', 'dist', '.sherpa', '.git', 'coverage', 'build', '__tests__']);
  const results: string[] = [];

  function walk(dir: string, rel: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (exts.some((ext) => entry.name.endsWith(ext)) && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.js')) {
        results.push(relPath);
      }
    }
  }

  for (const d of dirs) {
    walk(path.join(root, d), d);
  }
  return results;
}

function pathFromRoot(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}
