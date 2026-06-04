import path from 'node:path';
import fs from 'node:fs';

import { loadSherpaConfig } from '@sherpa/core-config';
import { TelemetryService, showFirstRunTelemetryNotice } from '@sherpa/core-telemetry';
import { initDatabase } from '@sherpa/infra-sqlite';
import type { SqliteDatabase } from '@sherpa/infra-sqlite';

/**
 * Whether telemetry is permitted to record/send anything.
 *
 * Two switches must both agree, so neither can silently contradict the other:
 *  - telemetry.enabled    — the operational toggle (`sherpa telemetry enable`)
 *  - privacy.allowTelemetry — the privacy master kill-switch
 *
 * Both default to false, so a fresh install is opt-in: nothing is collected
 * until the user explicitly enables it.
 */
export function isTelemetryAllowed(config: {
  telemetry: { enabled: boolean };
  privacy: { allowTelemetry: boolean };
}): boolean {
  return config.telemetry.enabled && config.privacy.allowTelemetry;
}

/**
 * A telemetry service plus the database connection backing it.
 *
 * The connection is owned by the caller and MUST be closed via close()
 * once the command is done recording — see withTelemetry.
 */
export interface TelemetryHandle {
  readonly telemetry: TelemetryService;
  /** The underlying SQLite connection opened for this handle. */
  readonly db: SqliteDatabase;
  /** Close the underlying connection. Idempotent and never throws. */
  close(): void;
}

/**
 * Create a telemetry handle for the given project root.
 *
 * Returns null if telemetry is not allowed, .sherpa doesn't exist, or the
 * database can't be opened. Callers should always null-check and, when a
 * handle is returned, call close() to release the connection.
 */
export function createTelemetry(projectRoot: string): TelemetryHandle | null {
  try {
    const sherpaDir = path.join(projectRoot, '.sherpa');
    if (!fs.existsSync(sherpaDir)) return null;

    // Show the first-run telemetry notice (only once per project)
    showFirstRunTelemetryNotice(projectRoot);

    const config = loadSherpaConfig(projectRoot);
    if (!isTelemetryAllowed(config)) return null;

    const dbPath = path.isAbsolute(config.memory.databasePath)
      ? config.memory.databasePath
      : path.join(projectRoot, config.memory.databasePath);

    const db = initDatabase(dbPath);
    return {
      telemetry: new TelemetryService(db, config.telemetry),
      db,
      close() {
        try {
          if (db.open) db.close();
        } catch {
          // Already closed / never opened — nothing to do.
        }
      },
    };
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
    const handle = createTelemetry(projectRoot);
    if (handle) {
      try {
        handle.telemetry.recordCommand(command, success, duration, metadata);
      } catch {
        // Silent — telemetry must never interfere with the CLI
      } finally {
        // Always release the connection we opened. Previously this handle
        // was discarded, leaking a second SQLite connection (and re-running
        // migrations) on every single CLI invocation.
        handle.close();
      }
    }
  }
}
