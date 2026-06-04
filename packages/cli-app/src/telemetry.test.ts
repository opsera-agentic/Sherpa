import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createTelemetry, isTelemetryAllowed, withTelemetry } from './telemetry.js';

describe('isTelemetryAllowed', () => {
  const cfg = (enabled: boolean, allowTelemetry: boolean) => ({
    telemetry: { enabled },
    privacy: { allowTelemetry },
  });

  it('requires both the operational toggle and the privacy switch', () => {
    expect(isTelemetryAllowed(cfg(true, true))).toBe(true);
    expect(isTelemetryAllowed(cfg(true, false))).toBe(false);
    expect(isTelemetryAllowed(cfg(false, true))).toBe(false);
    expect(isTelemetryAllowed(cfg(false, false))).toBe(false);
  });

  it('a privacy-conscious user who clears allowTelemetry is never tracked', () => {
    // Even if telemetry.enabled is somehow true, allowTelemetry=false wins.
    expect(isTelemetryAllowed(cfg(true, false))).toBe(false);
  });
});

describe('createTelemetry handle lifecycle', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function makeProject(yaml: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-tel-'));
    fs.mkdirSync(path.join(dir, '.sherpa'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.sherpa', 'sherpa.config.yaml'), yaml, 'utf8');
    return dir;
  }

  it('opens a connection, records, and close() releases it (idempotently)', () => {
    root = makeProject('telemetry:\n  enabled: true\nprivacy:\n  allowTelemetry: true\n');

    const handle = createTelemetry(root);
    expect(handle).not.toBeNull();
    expect(handle!.db.open).toBe(true);

    handle!.telemetry.recordCommand('unit-test', true, 5, {});
    expect(handle!.telemetry.getUsageStats().totalEvents).toBe(1);

    handle!.close();
    expect(handle!.db.open).toBe(false);
    // Idempotent — a second close must not throw.
    expect(() => handle!.close()).not.toThrow();
  });

  it('returns null (and opens nothing) when telemetry is not allowed', () => {
    // enabled but allowTelemetry left at its default false → not allowed.
    root = makeProject('telemetry:\n  enabled: true\n');
    expect(createTelemetry(root)).toBeNull();
  });

  it('returns null when .sherpa is absent', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-tel-bare-'));
    expect(createTelemetry(root)).toBeNull();
  });

  it('withTelemetry records the command without leaving the connection open', async () => {
    root = makeProject('telemetry:\n  enabled: true\nprivacy:\n  allowTelemetry: true\n');

    await withTelemetry(root, 'sync', async () => ({ entriesUpdated: 2 }));

    // A fresh handle should see exactly the event withTelemetry recorded,
    // proving the prior connection was closed and the write landed.
    const verify = createTelemetry(root);
    expect(verify).not.toBeNull();
    const stats = verify!.telemetry.getUsageStats();
    expect(stats.totalEvents).toBe(1);
    expect(stats.commandBreakdown[0]!.command).toBe('sync');
    verify!.close();
  });
});
