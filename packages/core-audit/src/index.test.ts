import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initDatabase } from '@sherpa/infra-sqlite';

import { AuditService, jsonlRotationKey } from './index.js';

let tmp: string | undefined;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  tmp = undefined;
});

describe('core-audit', () => {
  it('chains checksums across sequential writes', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-audit-'));
    const dbPath = path.join(tmp, 'db.sqlite');
    const db = initDatabase(dbPath);
    const audit = new AuditService(db, tmp);

    audit.log({
      operation: 'create',
      resource_type: 'memory.entry',
      resource_id: 'a',
      details: { hello: 'world' },
    });
    audit.log({
      operation: 'update',
      resource_type: 'memory.entry',
      resource_id: 'a',
      details: { field: 2 },
    });

    const verify = audit.verify();
    expect(verify.valid).toBe(true);

    const month = new Date().toISOString().slice(0, 7);
    const jsonl = path.join(tmp, '.sherpa', 'audit', `${month}.jsonl`);
    expect(fs.existsSync(jsonl)).toBe(true);
    const lines = fs.readFileSync(jsonl, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);

    db.close();
  });

  it('chains checksums when timestamps collide (insertion order)', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-audit-ts-collision-'));
    const dbPath = path.join(tmp, 'db.sqlite');
    const db = initDatabase(dbPath);
    const audit = new AuditService(db, tmp);
    const frozen = 42_000;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(frozen);
    try {
      audit.log({ operation: 'a', resource_type: 'r', resource_id: '1', details: { x: 1 } });
      audit.log({ operation: 'b', resource_type: 'r', resource_id: '2', details: { x: 2 } });
      audit.log({ operation: 'c', resource_type: 'r', resource_id: '3', details: { x: 3 } });
    } finally {
      spy.mockRestore();
    }

    const verify = audit.verify();
    expect(verify.valid).toBe(true);

    db.close();
  });

  it('jsonlRotationKey maps each policy to the right filename stem', () => {
    const ts = Date.parse('2026-03-09T12:34:56.000Z');
    expect(jsonlRotationKey(ts, 'monthly')).toBe('2026-03');
    expect(jsonlRotationKey(ts, 'daily')).toBe('2026-03-09');
    expect(jsonlRotationKey(ts, 'none')).toBe('audit');
  });

  it('honors the jsonlRotation policy when writing the JSONL mirror', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-audit-rotation-'));
    const db = initDatabase(path.join(tmp, 'db.sqlite'));

    const frozen = Date.parse('2026-03-09T12:00:00.000Z');
    const spy = vi.spyOn(Date, 'now').mockReturnValue(frozen);
    try {
      // daily
      const daily = new AuditService(db, tmp, 'daily');
      daily.log({ operation: 'x', resource_type: 't', resource_id: '1', details: {} });
      // none
      const none = new AuditService(db, tmp, 'none');
      none.log({ operation: 'y', resource_type: 't', resource_id: '2', details: {} });
    } finally {
      spy.mockRestore();
    }

    const auditDir = path.join(tmp, '.sherpa', 'audit');
    expect(fs.existsSync(path.join(auditDir, '2026-03-09.jsonl'))).toBe(true); // daily
    expect(fs.existsSync(path.join(auditDir, 'audit.jsonl'))).toBe(true); // none
    expect(fs.existsSync(path.join(auditDir, '2026-03.jsonl'))).toBe(false); // not monthly

    db.close();
  });

  it('detects tampering via verify()', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-audit-tamper-'));
    const dbPath = path.join(tmp, 'db.sqlite');
    const db = initDatabase(dbPath);
    const audit = new AuditService(db, tmp);
    audit.log({ operation: 'x', resource_type: 't', resource_id: '1', details: {} });

    db.prepare(`UPDATE AUDIT_EVENTS SET operation = 'y' WHERE resource_id = '1'`).run();

    const verify = audit.verify();
    expect(verify.valid).toBe(false);
    expect(verify.errors.length).toBeGreaterThan(0);

    db.close();
  });
});
