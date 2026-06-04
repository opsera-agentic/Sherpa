import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AuditService } from '@sherpa/core-audit';
import { MemoryRepository } from '@sherpa/core-memory';

import { SherpaMcpServer } from './index.js';
import { handleMemoryRead, handleMemorySearch, handleMemoryWrite, type ToolContext } from './tools.js';

let tmp: string | undefined;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  tmp = undefined;
});

describe('mcp-server tools', () => {
  it('rejects writes without allow-write flag emulate', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-mcp-'));
    const sherpaDir = path.join(tmp, '.sherpa');
    fs.mkdirSync(sherpaDir, { recursive: true });
    const memory = new MemoryRepository(path.join(sherpaDir, 'memory.db'));
    const audit = new AuditService(memory.getDatabase(), tmp);
    const token = 'tok';
    const ctx: ToolContext = {
      memory,
      audit,
      sessionToken: token,
      allowWrite: false,
    };

    await expect(
      handleMemoryWrite({ sessionToken: token, title: 'x', content: 'y' }, ctx),
    ).rejects.toThrow(/allow-write/);

    memory.close();
  });

  it('does not audit unauthenticated or denied calls', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-mcp-audit-'));
    const sherpaDir = path.join(tmp, '.sherpa');
    fs.mkdirSync(sherpaDir, { recursive: true });
    const memory = new MemoryRepository(path.join(sherpaDir, 'memory.db'));
    const audit = new AuditService(memory.getDatabase(), tmp);
    const db = memory.getDatabase();
    const auditCount = () =>
      (db.prepare('SELECT COUNT(*) AS c FROM AUDIT_EVENTS').get() as { c: number }).c;

    const ctx: ToolContext = { memory, audit, sessionToken: 'good', allowWrite: true };

    // Bad token on every tool → reject, and crucially write nothing to the
    // integrity-checked audit chain.
    await expect(handleMemoryRead({ sessionToken: 'bad', id: 'x' }, ctx)).rejects.toThrow(/session token/);
    await expect(handleMemorySearch({ sessionToken: 'bad', query: 'q' }, ctx)).rejects.toThrow(/session token/);
    await expect(
      handleMemoryWrite({ sessionToken: 'bad', title: 'evil', content: 'c' }, ctx),
    ).rejects.toThrow(/session token/);
    expect(auditCount()).toBe(0);

    // Authenticated but write disabled → reject, still no audit row.
    const roCtx: ToolContext = { memory, audit, sessionToken: 'good', allowWrite: false };
    await expect(
      handleMemoryWrite({ sessionToken: 'good', title: 'x', content: 'y' }, roCtx),
    ).rejects.toThrow(/allow-write/);
    expect(auditCount()).toBe(0);

    // A valid write IS audited.
    await handleMemoryWrite({ sessionToken: 'good', title: 'ok', content: 'body' }, ctx);
    expect(auditCount()).toBe(1);

    memory.close();
  });

  it('allows reads searches and writes when configured', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-mcp-write-'));
    const sherpaDir = path.join(tmp, '.sherpa');
    fs.mkdirSync(sherpaDir, { recursive: true });
    const memory = new MemoryRepository(path.join(sherpaDir, 'memory.db'));
    const audit = new AuditService(memory.getDatabase(), tmp);
    const token = 'tok';
    const ctx: ToolContext = {
      memory,
      audit,
      sessionToken: token,
      allowWrite: true,
    };

    const writeResult = (await handleMemoryWrite(
      { sessionToken: token, title: 'hello', content: 'world of sherpa', type: 'note' },
      ctx,
    )) as { id: string };
    const read = await handleMemoryRead({ sessionToken: token, id: writeResult.id }, ctx);
    expect((read as { found: boolean }).found).toBe(true);

    const hits = await handleMemorySearch({ sessionToken: token, query: 'sherpa' }, ctx);
    expect((hits as { hits: unknown[] }).hits.length).toBeGreaterThan(0);

    memory.close();
  });
});

describe('SherpaMcpServer handshake', () => {
  it('returns initialize payload with session token', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-mcp-init-'));
    fs.mkdirSync(path.join(tmp, '.sherpa'), { recursive: true });
    const server = new SherpaMcpServer({ projectRoot: tmp });
    const res = await server.handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res?.result && typeof (res.result as { sessionToken?: string }).sessionToken).toBe('string');
    server.stop();
  });
});
