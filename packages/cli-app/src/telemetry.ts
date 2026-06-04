import path from 'node:path';
import fs from 'node:fs';

import { loadSherpaConfig } from '@sherpa/core-config';
import { TelemetryService, showFirstRunTelemetryNotice } from '@sherpa/core-telemetry';
import { initDatabase } from '@sherpa/infra-sqlite';

/**
 * Create a TelemetryService for the given project root.
 *
 * Returns null if telemetry is disabled, .sherpa doesn't exist, or the
 * database can't be opened. Callers should always null-check.
 */
export function createTelemetry(projectRoot: string): TelemetryService | null {
  try {
    const sherpaDir = path.join(projectRoot, '.sherpa');
    if (!fs.existsSync(sherpaDir)) return null;

    // Show the first-run telemetry notice (only once per project)
    showFirstRunTelemetryNotice(projectRoot);

    const config = loadSherpaConfig(projectRoot);
    if (!config.telemetry.enabled) return null;

    const dbPath = path.isAbsolute(config.memory.databasePath)
      ? config.memory.databasePath
      : path.join(projectRoot, config.memory.databasePath);

    const db = initDatabase(dbPath);
    return new TelemetryService(db, config.telemetry);
  } catch {
    // Telemetry must never break the CLI
    return null;
  }
}

/**
 * Wrap a command handler with telemetry instrumentation.
 *
 * Measures wall-clock duration, captures success/failure, and records
 * the event. The inner function can return metadata to attach to the event
 * (e.g. { entriesUpdated: 5, adaptersGenerated: 6 }).
 *
 * Telemetry failures are silently swallowed — the CLI always works
 * regardless of telemetry state.
 */
export async function withTelemetry(
  projectRoot: string,
  command: string,
  fn: () => Promise<Record<string, unknown> | void>,
): Promise<void> {
  const start = performance.now();
  let success = true;
  let metadata: Record<string, unknown> = {};

  try {
    const result = await fn();
    if (result) metadata = result;
  } catch (err) {
    success = false;
    throw err;
  } finally {
    const duration = performance.now() - start;
    try {
      const telemetry = createTelemetry(projectRoot);
      telemetry?.recordCommand(command, success, duration, metadata);
    } catch {
      // Silent — telemetry must never interfere with the CLI
    }
  }
}
