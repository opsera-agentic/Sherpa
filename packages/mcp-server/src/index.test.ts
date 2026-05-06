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
