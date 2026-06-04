import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { runPull, type AgentSourceId } from './pull.js';
import { runAdapt } from './adapt.js';
import { withTelemetry } from '../telemetry.js';

const AGENT_FILES: Array<{ agentId: AgentSourceId; file: string }> = [
  { agentId: 'claude-code', file: 'CLAUDE.md' },
  { agentId: 'cursor', file: '.cursorrules' },
  { agentId: 'codex-cli', file: 'AGENTS.md' },
  { agentId: 'gemini-cli', file: 'GEMINI.md' },
  { agentId: 'copilot', file: path.join('.github', 'copilot-instructions.md') },
  { agentId: 'windsurf', file: '.windsurfrules' },
];

export interface WatchCommandOptions extends LoggerOptions {
  projectRoot: string;
}

export async function runWatch(opts: WatchCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'watch', async () => {
    return await _runWatch(opts);
  });
}

async function _runWatch(opts: WatchCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('watch', opts);

  const watchable = AGENT_FILES.filter(({ file }) =>
    fs.existsSync(path.join(opts.projectRoot, file)),
  );

  if (!watchable.length) {
    logger.warn('watch.nothing', 'No agent files found to watch. Run sherpa adapt first to create them.');
    return { watchedFiles: 0 };
  }

  process.stdout.write(`Watching ${watchable.length} agent file(s) for changes. Press Ctrl+C to stop.\n`);
  for (const { file } of watchable) {
    process.stdout.write(`  ${file}\n`);
  }

  // Debounce map: agentId → timer, prevents rapid successive writes from firing multiple times
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  for (const { agentId, file } of watchable) {
    const filePath = path.join(opts.projectRoot, file);

    fs.watch(filePath, { persistent: true }, (eventType) => {
      if (eventType !== 'change') return;

      const existing = debounceTimers.get(agentId);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        agentId,
        setTimeout(async () => {
          debounceTimers.delete(agentId);
          process.stdout.write(`\n[watch] ${file} changed — pulling into conventions.md...\n`);

          try {
            await runPull({
              projectRoot: opts.projectRoot,
              from: agentId,
              verbose: opts.verbose,
              json: false,
            });

            process.stdout.write(`[watch] Re-running adapt...\n`);
            await runAdapt({
              projectRoot: opts.projectRoot,
              verbose: opts.verbose,
              json: false,
            });

            process.stdout.write(`[watch] Done. conventions.md and all adapter files are up to date.\n`);
          } catch (err) {
            logger.error('watch.error', `Failed to sync ${file}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }, 300),
      );
    });
  }

  // Keep the process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      process.stdout.write('\n[watch] Stopped.\n');
      resolve();
    });
    process.on('SIGTERM', resolve);
  });

  return { watchedFiles: watchable.length };
}
