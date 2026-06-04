import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { TelemetryService } from '@sherpa/core-telemetry';
import { initDatabase } from '@sherpa/infra-sqlite';

export interface StatsCommandOptions extends LoggerOptions {
  projectRoot: string;
}

/**
 * Display local usage statistics from telemetry data.
 *
 * This command reads only local data — nothing is sent to any remote
 * service. It provides insight into how the user uses Sherpa: which
 * commands are run most, success rates, and average durations.
 *
 * Requires telemetry to have been enabled at some point to have data.
 */
export async function runStats(opts: StatsCommandOptions): Promise<void> {
  const logger = createLogger('stats', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);

  if (!fs.existsSync(sherpaDir)) {
    logger.error('stats', 'Sherpa not initialized — run `sherpa init` first');
    throw new Error('not initialized');
  }

  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = path.isAbsolute(config.memory.databasePath)
    ? config.memory.databasePath
    : path.join(opts.projectRoot, config.memory.databasePath);

  const db = initDatabase(dbPath);

  // Create telemetry service with a minimal config just to read stats
  const telemetry = new TelemetryService(db, {
    enabled: true,
    endpoint: '',
    apiKey: '',
    batchSize: 25,
    flushIntervalSeconds: 300,
  });

  const stats = telemetry.getUsageStats();

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(stats)}\n`);
    return;
  }

  if (stats.totalEvents === 0) {
    process.stdout.write('\n  No telemetry data yet.\n');
    if (!config.telemetry.enabled) {
      process.stdout.write('  Enable telemetry to start collecting: sherpa telemetry enable\n');
    } else {
      process.stdout.write('  Run some commands and check back!\n');
    }
    process.stdout.write('\n');
    return;
  }

  // Header
  process.stdout.write('\n');
  process.stdout.write('  Sherpa Usage Statistics\n');
  process.stdout.write('  ══════════════════════\n\n');

  // Overview
  process.stdout.write(`  Total commands run:  ${stats.totalEvents}\n`);
  process.stdout.write(`  Active days:         ${stats.activeDays}\n`);
  process.stdout.write(`  Success rate:        ${stats.successRate}%\n`);
  process.stdout.write(`  Avg duration:        ${stats.avgDurationMs}ms\n`);

  if (stats.firstEventAt) {
    process.stdout.write(`  First used:          ${new Date(stats.firstEventAt).toLocaleDateString()}\n`);
  }
  if (stats.lastEventAt) {
    process.stdout.write(`  Last used:           ${new Date(stats.lastEventAt).toLocaleDateString()}\n`);
  }

  // Command breakdown table
  if (stats.commandBreakdown.length > 0) {
    process.stdout.write('\n  Command Breakdown\n');
    process.stdout.write('  ─────────────────\n');

    const maxNameLen = Math.max(7, ...stats.commandBreakdown.map((c) => c.command.length));
    const header = `  ${pad('Command', maxNameLen)}  Count   Success  Failed   Avg(ms)`;
    process.stdout.write(`${header}\n`);

    for (const cmd of stats.commandBreakdown) {
      const line = `  ${pad(cmd.command, maxNameLen)}  ${pad(String(cmd.count), 6)}  ${pad(String(cmd.successCount), 7)}  ${pad(String(cmd.failureCount), 7)}  ${cmd.avgDurationMs}`;
      process.stdout.write(`${line}\n`);
    }
  }

  process.stdout.write('\n');
}

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}
