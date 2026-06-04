import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadSherpaConfig } from '@sherpa/core-config';
import type { JsonRpcMessage } from './transport.js';
import { StdioJsonRpcTransport } from './transport.js';
import type { ToolContext } from './tools.js';
import { handleMemoryRead, handleMemorySearch, handleMemoryWrite } from './tools.js';
import { AuditService } from '@sherpa/core-audit';
import { MemoryRepository } from '@sherpa/core-memory';

export interface ServeOptions {
  projectRoot: string;
  allowWrite?: boolean;
  auditDir?: string;
}

export class SherpaMcpServer {
  private readonly transport: StdioJsonRpcTransport;
  private readonly sessionToken: string;
  private readonly toolCtx: ToolContext;

  constructor(options: ServeOptions) {
    const config = loadSherpaConfig(options.projectRoot);
    const configuredPath = config.memory.databasePath;
    const dbPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(options.projectRoot, configuredPath);
    const memory = new MemoryRepository(dbPath);
    const audit = new AuditService(memory.getDatabase(), options.projectRoot, config.audit.jsonlRotation);
    this.sessionToken = randomUUID();
    this.toolCtx = {
      memory,
      audit,
      sessionToken: this.sessionToken,
      allowWrite: Boolean(options.allowWrite),
    };

    this.transport = new StdioJsonRpcTransport((msg) => this.handleRequest(msg));
    process.stdin.on('close', () => {
      memory.close();
    });
  }

  /** Starts listening until stdin closes (stdio MCP lifecycle). */
  start(): void {
    this.transport.start();
  }

  stop(): void {
    this.transport.stop();
    this.toolCtx.memory.close();
  }

  getSessionToken(): string {
    return this.sessionToken;
  }

  async handleRequest(message: JsonRpcMessage): Promise<JsonRpcMessage | null> {
    if (message.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'sherpa-mcp', version: '0.1.0' },
          sessionToken: this.sessionToken,
        },
      };
    }

    if (message.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: {
          tools: [
            {
              name: 'memory_read',
              description: 'Read a Sherpa memory entry by id',
              inputSchema: {
                type: 'object',
                properties: {
                  sessionToken: { type: 'string' },
                  id: { type: 'string' },
                },
                required: ['sessionToken', 'id'],
              },
            },
            {
              name: 'memory_write',
              description: 'Create or update a Sherpa memory entry',
              inputSchema: {
                type: 'object',
                properties: {
                  sessionToken: { type: 'string' },
                  id: { type: 'string' },
                  title: { type: 'string' },
                  content: { type: 'string' },
                  type: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
                required: ['sessionToken', 'title', 'content'],
              },
            },
            {
              name: 'memory_search',
              description: 'Search Sherpa memory chunks',
              inputSchema: {
                type: 'object',
                properties: {
                  sessionToken: { type: 'string' },
                  query: { type: 'string' },
                  limit: { type: 'number' },
                  mode: { type: 'string', enum: ['hybrid', 'bm25', 'vector'] },
                  types: { type: 'array', items: { type: 'string' } },
                  tags: { type: 'array', items: { type: 'string' } },
                },
                required: ['sessionToken', 'query'],
              },
            },
          ],
        },
      };
    }

    if (message.method === 'tools/call') {
      const params = (message.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const args = params.arguments ?? {};
      try {
        let payload: unknown;
        switch (params.name) {
          case 'memory_read':
            payload = await handleMemoryRead(args, this.toolCtx);
            break;
          case 'memory_write':
            payload = await handleMemoryWrite(args, this.toolCtx);
            break;
          case 'memory_search':
            payload = await handleMemorySearch(args, this.toolCtx);
            break;
          default:
            throw new Error(`Unknown tool ${params.name}`);
        }

        return {
          jsonrpc: '2.0',
          id: message.id ?? null,
          result: {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id: message.id ?? null,
          error: { code: -32000, message: String(err) },
        };
      }
    }

    if (message.method?.startsWith('notifications')) {
      return null;
    }

    return {
      jsonrpc: '2.0',
      id: message.id ?? null,
      error: { code: -32601, message: `Method not found: ${message.method}` },
    };
  }
}

export function parseServeArgv(argv: string[]): ServeOptions {
  const allowWrite = argv.includes('--allow-write');
  const rootFlagIdx = argv.indexOf('--project-root');
  const projectRoot =
    rootFlagIdx >= 0 && argv[rootFlagIdx + 1]
      ? path.resolve(argv[rootFlagIdx + 1]!)
      : process.cwd();
  return { projectRoot, allowWrite };
}

/** Convenience helper used by the CLI `serve` command. */
export function startSherpaMcpServer(options: ServeOptions): SherpaMcpServer {
  const server = new SherpaMcpServer(options);
  server.start();
  return server;
}
