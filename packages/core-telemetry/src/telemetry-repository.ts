import type { SqliteDatabase } from '@sherpa/infra-sqlite';
import type { TelemetryEvent, UsageStats, CommandStats } from './types.js';

/**
 * SQLite-backed storage for telemetry events.
 *
 * Events are stored locally first, then optionally flushed to a remote
 * endpoint. This ensures telemetry works offline and respects the user's
 * network conditions.
 *
 * Schema is auto-created on first use via ensureSchema().
 */
export class TelemetryRepository {
  constructor(private readonly db: SqliteDatabase) {
    this.ensureSchema();
  }

  /** Create the telemetry_events table if it does not exist. */
  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id TEXT PRIMARY KEY,
        anonymous_id TEXT NOT NULL,
        command TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        cli_version TEXT NOT NULL DEFAULT '0.0.0',
        node_version TEXT NOT NULL DEFAULT '',
        os_platform TEXT NOT NULL DEFAULT '',
        os_arch TEXT NOT NULL DEFAULT '',
        os_version TEXT NOT NULL DEFAULT '',
        ide TEXT NOT NULL DEFAULT 'terminal',
        install_source TEXT NOT NULL DEFAULT 'unknown',
        timezone TEXT NOT NULL DEFAULT 'unknown',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        flushed INTEGER NOT NULL DEFAULT 0
      );

      -- Index for stats queries: command breakdown and time-range filtering
      CREATE INDEX IF NOT EXISTS idx_telemetry_command ON telemetry_events(command);
      CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at);
      -- Index for batch flush: find un-flushed events efficiently
      CREATE INDEX IF NOT EXISTS idx_telemetry_flushed ON telemetry_events(flushed) WHERE flushed = 0;
      -- Index for IDE and install source breakdown queries
      CREATE INDEX IF NOT EXISTS idx_telemetry_ide ON telemetry_events(ide);
      CREATE INDEX IF NOT EXISTS idx_telemetry_install ON telemetry_events(install_source);
    `);
  }

  /** Insert a single telemetry event into local storage. */
  insert(event: TelemetryEvent): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO telemetry_events
        (id, anonymous_id, command, success, duration_ms, cli_version, node_version, os_platform, os_arch, os_version, ide, install_source, timezone, metadata, created_at, flushed)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    stmt.run(
      event.id,
      event.anonymous_id,
      event.command,
      event.success ? 1 : 0,
      event.duration_ms,
      event.cli_version,
      event.node_version,
      event.os_platform,
      event.os_arch,
      event.os_version,
      event.ide,
      event.install_source,
      event.timezone,
      JSON.stringify(event.metadata),
      event.created_at,
    );
  }

  /** Retrieve un-flushed events up to the given limit, ordered oldest-first. */
  getUnflushed(limit: number): TelemetryEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM telemetry_events WHERE flushed = 0 ORDER BY created_at ASC LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToEvent(row));
  }

  /** Mark events as successfully flushed to the remote endpoint. */
  markFlushed(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`UPDATE telemetry_events SET flushed = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  /** Total number of locally stored events. */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM telemetry_events').get() as { cnt: number };
    return row.cnt;
  }

  /** Number of events pending flush. */
  pendingCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM telemetry_events WHERE flushed = 0').get() as { cnt: number };
    return row.cnt;
  }

  /**
   * Compute aggregated usage statistics from local telemetry data.
   *
   * This powers the `sherpa stats` command — all data stays local,
   * giving users insight into their own usage patterns.
   */
  getUsageStats(): UsageStats {
    const totalRow = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT date(created_at / 1000, 'unixepoch')) AS active_days,
        MIN(created_at) AS first_at,
        MAX(created_at) AS last_at,
        AVG(duration_ms) AS avg_duration,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / MAX(COUNT(*), 1) AS success_rate
      FROM telemetry_events
    `).get() as {
      total: number;
      active_days: number;
      first_at: number | null;
      last_at: number | null;
      avg_duration: number | null;
      success_rate: number | null;
    };

    const commandRows = this.db.prepare(`
      SELECT
        command,
        COUNT(*) AS count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failure_count,
        AVG(duration_ms) AS avg_duration,
        MAX(created_at) AS last_used
      FROM telemetry_events
      GROUP BY command
      ORDER BY count DESC
    `).all() as Array<{
      command: string;
      count: number;
      success_count: number;
      failure_count: number;
      avg_duration: number;
      last_used: number;
    }>;

    const commandBreakdown: CommandStats[] = commandRows.map((row) => ({
      command: row.command,
      count: row.count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      avgDurationMs: Math.round(row.avg_duration),
      lastUsedAt: row.last_used,
    }));

    return {
      totalEvents: totalRow.total,
      commandBreakdown,
      activeDays: totalRow.active_days,
      firstEventAt: totalRow.first_at,
      lastEventAt: totalRow.last_at,
      successRate: Math.round(totalRow.success_rate ?? 0),
      avgDurationMs: Math.round(totalRow.avg_duration ?? 0),
    };
  }

  /**
   * Purge events older than the given timestamp.
   * Useful for GDPR compliance and keeping the local DB small.
   */
  purgeOlderThan(timestampMs: number): number {
    const info = this.db.prepare('DELETE FROM telemetry_events WHERE created_at < ?').run(timestampMs);
    return (info as { changes: number }).changes;
  }

  private rowToEvent(row: Record<string, unknown>): TelemetryEvent {
    return {
      id: row.id as string,
      anonymous_id: row.anonymous_id as string,
      command: row.command as string,
      success: (row.success as number) === 1,
      duration_ms: row.duration_ms as number,
      cli_version: row.cli_version as string,
      node_version: row.node_version as string,
      os_platform: row.os_platform as string,
      os_arch: row.os_arch as string,
      os_version: (row.os_version as string) ?? '',
      ide: (row.ide as string) ?? 'terminal',
      install_source: (row.install_source as string) ?? 'unknown',
      timezone: (row.timezone as string) ?? 'unknown',
      metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
      created_at: row.created_at as number,
    };
  }
}
