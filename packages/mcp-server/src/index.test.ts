import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  CallToolResult,
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it } from 'vitest';

import { AuditService } from '@sherpa/core-audit';
import { MemoryRepository } from '@sherpa/core-memory';

import { SherpaMcpServer } from './index.js';
import { handleMemoryRead, handleMemorySearch, handleMemoryWrite, type ToolContext } from './tools.js';

let tmp: string | undefined;

class TestTransport implements Transport {
  private readonly queued: JSONRPCMessage[] = [];
  private readonly waiters: Array<(message: JSONRPCMessage) => void> = [];

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }
    this.queued.push(message);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  receive(message: JSONRPCRequest): void {
    this.onmessage?.(message);
  }

  nextMessage(): Promise<JSONRPCMessage> {
    const queued = this.queued.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

function createProject(): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-mcp-sdk-'));
  fs.mkdirSync(path.join(tmp, '.sherpa'), { recursive: true });
  return tmp;
}

async function connectTestServer(server: SherpaMcpServer): Promise<TestTransport> {
  const transport = new TestTransport();
  await server.connect(transport);
  return transport;
}

async function sendRequest(
  transport: TestTransport,
  id: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<JSONRPCResponse> {
  transport.receive({ jsonrpc: '2.0', id, method, params });
  return (await transport.nextMessage()) as JSONRPCResponse;
}

function resultOf<T>(response: JSONRPCResponse): T {
  if ('error' in response) {
    throw new Error(response.error.message);
  }
  return response.result as T;
}

function toolText(result: CallToolResult): string {
  const [content] = result.content;
  expect(content?.type).toBe('text');
  return content.type === 'text' ? content.text : '';
}

async function initialize(transport: TestTransport): Promise<{ sessionToken: string }> {
  const response = await sendRequest(transport, 1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'vitest', version: '0.0.0' },
  });
  return resultOf<{ sessionToken: string }>(response);
}

async function callTool(
  transport: TestTransport,
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const response = await sendRequest(transport, id, 'tools/call', { name, arguments: args });
  return resultOf<CallToolResult>(response);
}

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

describe('SherpaMcpServer SDK protocol', () => {
  it('returns initialize payload with session token and lists tools', async () => {
    const projectRoot = createProject();
    const server = new SherpaMcpServer({ projectRoot });
    try {
      const transport = await connectTestServer(server);
      const init = await initialize(transport);
      expect(init.sessionToken).toBe(server.getSessionToken());

      const listResponse = await sendRequest(transport, 2, 'tools/list', {});
      const { tools } = resultOf<ListToolsResult>(listResponse);
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'memory_read',
        'memory_search',
        'memory_write',
      ]);
      expect(tools.find((tool) => tool.name === 'memory_read')?.inputSchema.required).toEqual([
        'sessionToken',
        'id',
      ]);
      expect(tools.find((tool) => tool.name === 'memory_write')?.inputSchema.required).toEqual([
        'sessionToken',
        'title',
        'content',
      ]);
      expect(tools.find((tool) => tool.name === 'memory_search')?.inputSchema.required).toEqual([
        'sessionToken',
        'query',
      ]);
    } finally {
      await server.close();
    }
  });

  it('runs reads searches and writes through SDK tool calls', async () => {
    const projectRoot = createProject();
    const server = new SherpaMcpServer({ projectRoot, allowWrite: true });
    try {
      const transport = await connectTestServer(server);
      const { sessionToken } = await initialize(transport);

      const write = await callTool(transport, 2, 'memory_write', {
        sessionToken,
        title: 'hello',
        content: 'world of sherpa',
        type: 'note',
      });
      expect(write.isError).not.toBe(true);
      const writePayload = JSON.parse(toolText(write)) as { id: string };

      const read = await callTool(transport, 3, 'memory_read', {
        sessionToken,
        id: writePayload.id,
      });
      expect(JSON.parse(toolText(read)) as { found: boolean }).toMatchObject({ found: true });

      const search = await callTool(transport, 4, 'memory_search', {
        sessionToken,
        query: 'sherpa',
      });
      expect((JSON.parse(toolText(search)) as { hits: unknown[] }).hits.length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('does not audit SDK tool calls rejected before authentication', async () => {
    const projectRoot = createProject();
    const dbPath = path.join(projectRoot, '.sherpa', 'memory.db');
    const server = new SherpaMcpServer({ projectRoot, allowWrite: true });
    try {
      const transport = await connectTestServer(server);
      await initialize(transport);

      const result = await callTool(transport, 2, 'memory_search', {
        sessionToken: 'bad',
        query: 'attacker controlled',
      });
      expect(result.isError).toBe(true);
      expect(toolText(result)).toMatch(/Invalid session token/);
    } finally {
      await server.close();
    }

    const memory = new MemoryRepository(dbPath);
    try {
      const auditCount = (
        memory.getDatabase().prepare('SELECT COUNT(*) AS c FROM AUDIT_EVENTS').get() as { c: number }
      ).c;
      expect(auditCount).toBe(0);
    } finally {
      memory.close();
    }
  });
});
