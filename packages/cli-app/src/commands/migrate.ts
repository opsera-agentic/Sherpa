import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository } from '@sherpa/core-memory';
import { MigrationService, type AgentSource } from '@sherpa/core-migration';
import { withTelemetry } from '../telemetry.js';

export interface MigrateCommandOptions extends LoggerOptions {
  projectRoot: string;
  from: AgentSource;
  dryRun?: boolean;
}

export async function runMigrate(opts: MigrateCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'migrate', async () => {
    return await _runMigrate(opts);
  });
}

async function _runMigrate(opts: MigrateCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('migrate', opts);
  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = pathFromRoot(opts.projectRoot, config.memory.databasePath);
  const memory = new MemoryRepository(dbPath);
  try {
    const service = new MigrationService(memory);
    const report = service.migrate({
      projectRoot: opts.projectRoot,
      from: opts.from,
      dryRun: opts.dryRun,
    });

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else {
      process.stdout.write(
        `Migrated ${report.entriesCreated} entries from ${report.sourceFile} (checksumVerified=${report.checksumVerified})\n`,
      );
      if (report.errors.length) {
        report.errors.forEach((err) => logger.error('migrate.error', err));
      }
    }
    return { source: opts.from, entriesCreated: report.entriesCreated, dryRun: Boolean(opts.dryRun) };
  } finally {
    memory.close();
  }
}

function pathFromRoot(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}
