import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository } from '@sherpa/core-memory';

export interface StatusCommandOptions extends LoggerOptions {
  projectRoot: string;
}

export async function runStatus(opts: StatusCommandOptions): Promise<void> {
  const logger = createLogger('status', opts);
  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = pathFromRoot(opts.projectRoot, config.memory.databasePath);
  const memory = new MemoryRepository(dbPath);
  try {
    const entries = memory.countEntries();
    const bytes = memory.dbFileSizeBytes(dbPath);
    const payload = { entries, databaseBytes: bytes };
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    } else {
      logger.info('status.summary', `Entries ${entries}, database ${bytes} bytes`);
    }
  } finally {
    memory.close();
  }
}

function pathFromRoot(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}
