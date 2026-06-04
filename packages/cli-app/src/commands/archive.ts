import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository } from '@sherpa/core-memory';
import { withTelemetry } from '../telemetry.js';

export interface ArchiveCommandOptions extends LoggerOptions {
  projectRoot: string;
  olderThan: string;
}

export async function runArchive(opts: ArchiveCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'archive', async () => {
    return await _runArchive(opts);
  });
}

async function _runArchive(opts: ArchiveCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('archive', opts);
  const cutoff = parseDuration(opts.olderThan);
  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = pathFromRoot(opts.projectRoot, config.memory.databasePath);
  const memory = new MemoryRepository(dbPath);
  try {
    const removed = memory.archiveOlderThan(cutoff.toISOString());
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ removed })}\n`);
    } else {
      logger.info('archive.complete', `Archived ${removed} stale entries`);
    }
    return { archivedEntries: removed };
  } finally {
    memory.close();
  }
}

function pathFromRoot(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}

/** Parses compact durations like 30d / 12h / 60m into an ISO cutoff timestamp. */
function parseDuration(spec: string): Date {
  const match = /^(\d+)(d|h|m|w)$/i.exec(spec.trim());
  if (!match) {
    throw new Error('Invalid duration — use forms like 30d, 12h, 45m, or 2w');
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const now = Date.now();
  const millis =
    unit === 'd'
      ? amount * 86400_000
      : unit === 'h'
        ? amount * 3600_000
        : unit === 'm'
          ? amount * 60_000
          : amount * 7 * 86400_000;
  return new Date(now - millis);
}
