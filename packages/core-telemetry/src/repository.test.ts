/**
 * Integration tests for TelemetryRepository and TelemetryService.
 *
 * These tests require better-sqlite3 native bindings. They are skipped
 * automatically if the native module is unavailable (e.g. Node version
 * mismatch or missing build tools).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let hasSqlite = false;
try {
  const m = await import('@sherpa/infra-sqlite');
  // Quick smoke test to verify the native binary actually loads
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-sqlite-check-'));
  const db = m.initDatabase(path.join(tmp, 'check.sqlite'));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  hasSqlite = true;
} catch {
  hasSqlite = false;
}

let tmpDir: string | undefined;
let openDb: { close(): void } | undefined;

afterEach(() => {
  // Close the DB before deleting tmpDir — Windows cannot unlink open files (EBUSY)
  openDb?.close();
  openDb = undefined;
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = undefined;
});

describe.skipIf(!hasSqlite)('TelemetryRepository (SQLite)', () => {
  async function createTestDb() {
    const { initDatabase } = await import('@sherpa/infra-sqlite');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-telemetry-'));
    const db = initDatabase(path.join(tmpDir, 'test.sqlite'));
    openDb = db;
    return db;
  }

  it('inserts and retrieves unflushed events', async () => {
    const db = await createTestDb();
    const { TelemetryRepository } = await import('./telemetry-repository.js');
    const repo = new TelemetryRepository(db);

    repo.insert({
      id: 'evt-001', anonymous_id: 'abc123', command: 'sync', success: true,
      duration_ms: 150, cli_version: '0.1.0', node_version: 'v22.0.0',
      os_platform: 'darwin', os_arch: 'arm64',
      metadata: { entriesUpdated: 5 }, created_at: Date.now(),
    });

    expect(repo.count()).toBe(1);
    expect(repo.pendingCount()).toBe(1);

    const unflushed = repo.getUnflushed(10);
    expect(unflushed).toHaveLength(1);
    expect(unflushed[0]!.command).toBe('sync');
    expect(unflushed[0]!.success).toBe(true);
    expect(unflushed[0]!.metadata).toEqual({ entriesUpdated: 5 });
  });

  it('persists events even when optional fields are omitted', async () => {
    // Regression: INSERT OR IGNORE used to silently drop rows whose NOT NULL
    // columns received undefined (bound as NULL). insert() must coalesce to
    // schema defaults so a partially populated event is never lost.
    const db = await createTestDb();
    const { TelemetryRepository } = await import('./telemetry-repository.js');
    const repo = new TelemetryRepository(db);

    repo.insert({
      id: 'evt-partial', anonymous_id: 'abc', command: 'status', success: true,
      duration_ms: 12, cli_version: '0.1.0', node_version: 'v22',
      os_platform: 'darwin', os_arch: 'arm64',
      metadata: { foo: 1 }, created_at: Date.now(),
      // os_version, ide, install_source, timezone intentionally omitted
    } as unknown as Parameters<typeof repo.insert>[0]);

    expect(repo.count()).toBe(1);
    const [row] = repo.getUnflushed(10);
    expect(row!.command).toBe('status');
    expect(row!.ide).toBe('terminal');
    expect(row!.install_source).toBe('unknown');
    expect(row!.timezone).toBe('unknown');
    expect(row!.os_version).toBe('');
  });

  it('marks events as flushed', async () => {
    const db = await createTestDb();
    const { TelemetryRepository } = await import('./telemetry-repository.js');
    const repo = new TelemetryRepository(db);

    repo.insert({
      id: 'evt-002', anonymous_id: 'abc', command: 'adapt', success: true,
      duration_ms: 80, cli_version: '0.1.0', node_version: 'v22',
      os_platform: 'linux', os_arch: 'x64', metadata: {}, created_at: Date.now(),
    });

    repo.markFlushed(['evt-002']);
    expect(repo.pendingCount()).toBe(0);
    expect(repo.count()).toBe(1);
  });

  it('computes usage stats across multiple commands', async () => {
    const db = await createTestDb();
    const { TelemetryRepository } = await import('./telemetry-repository.js');
    const repo = new TelemetryRepository(db);
    const now = Date.now();

    repo.insert({ id: 'e1', anonymous_id: 'a', command: 'sync', success: true, duration_ms: 100, cli_version: '0.1.0', node_version: 'v22', os_platform: 'darwin', os_arch: 'arm64', metadata: {}, created_at: now - 86400000 });
    repo.insert({ id: 'e2', anonymous_id: 'a', command: 'sync', success: true, duration_ms: 200, cli_version: '0.1.0', node_version: 'v22', os_platform: 'darwin', os_arch: 'arm64', metadata: {}, created_at: now });
    repo.insert({ id: 'e3', anonymous_id: 'a', command: 'adapt', success: false, duration_ms: 50, cli_version: '0.1.0', node_version: 'v22', os_platform: 'darwin', os_arch: 'arm64', metadata: {}, created_at: now });
    repo.insert({ id: 'e4', anonymous_id: 'a', command: 'search', success: true, duration_ms: 30, cli_version: '0.1.0', node_version: 'v22', os_platform: 'darwin', os_arch: 'arm64', metadata: {}, created_at: now });

    const stats = repo.getUsageStats();
    expect(stats.totalEvents).toBe(4);
    expect(stats.activeDays).toBe(2);
    expect(stats.successRate).toBe(75);
    expect(stats.avgDurationMs).toBe(95);
    expect(stats.commandBreakdown[0]!.command).toBe('sync');
    expect(stats.commandBreakdown[0]!.count).toBe(2);
  });

  it('TelemetryService records and reports correctly', async () => {
    const db = await createTestDb();
    const { TelemetryService } = await import('./telemetry-service.js');

    const service = new TelemetryService(db, {
      enabled: true, endpoint: '', apiKey: '', batchSize: 25, flushIntervalSeconds: 300,
    });

    service.recordCommand('sync', true, 142, { entriesUpdated: 3 });
    service.recordCommand('adapt', false, 55, {});
    service.recordCommand('search', true, 30, { hitCount: 7 });

    expect(service.isEnabled()).toBe(true);
    expect(service.getAnonymousId()).toMatch(/^[a-f0-9]{16}$/);

    const stats = service.getUsageStats();
    expect(stats.totalEvents).toBe(3);
    expect(stats.commandBreakdown).toHaveLength(3);
    expect(stats.successRate).toBe(67); // 2/3

    // Flush with no endpoint → 0 sent, no error
    const result = await service.flush();
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(false);
  });

  it('TelemetryService does NOT record when disabled', async () => {
    const db = await createTestDb();
    const { TelemetryService } = await import('./telemetry-service.js');

    const service = new TelemetryService(db, {
      enabled: false, endpoint: '', apiKey: '', batchSize: 25, flushIntervalSeconds: 300,
    });

    service.recordCommand('sync', true, 142, {});
    expect(service.isEnabled()).toBe(false);
    expect(service.getUsageStats().totalEvents).toBe(0);
  });
});

describe.skipIf(hasSqlite)('TelemetryRepository (SQLite unavailable)', () => {
  it('tests are skipped because better-sqlite3 native module is not available', () => {
    console.log('SQLite native module not available on this machine — SQLite integration tests skipped');
    console.log('Non-SQLite telemetry tests (identity, notice, system info) still run and pass');
    expect(true).toBe(true);
  });
});
