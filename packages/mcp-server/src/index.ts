import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  InitializeRequestSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import { AuditService } from '@sherpa/core-audit';
import { loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository } from '@sherpa/core-memory';
import { z } from 'zod';

import type { ToolContext } from './tools.js';
import { handleMemoryRead, handleMemorySearch, handleMemoryWrite } from './tools.js';

export interface ServeOptions {
  projectRoot: string;
  allowWrite?: boolean;
  auditDir?: string;
}

const SERVER_INFO = { name: 'sherpa-mcp', version: '0.1.0' };
const SERVER_CAPABILITIES: ServerCapabilities = { tools: { listChanged: true } };

const memoryReadSchema = z
  .object({
    sessionToken: z.string(),
    id: z.string(),
  })
  .passthrough();

const memoryWriteSchema = z
  .object({
    sessionToken: z.string(),
    id: z.string().optional(),
    title: z.string(),
    content: z.string(),
    type: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const memorySearchSchema = z
  .object({
    sessionToken: z.string(),
    query: z.string(),
    limit: z.number().optional(),
    mode: z.enum(['hybrid', 'bm25', 'vector']).optional(),
    types: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

function asToolArgs(args: object): Record<string, unknown> {
  return args as Record<string, unknown>;
}

function toolResponse(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}

export class SherpaMcpServer {
  private readonly server: McpServer;
  private readonly sessionToken: string;
  private readonly toolCtx: ToolContext;
  private closed = false;

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

    this.server = new McpServer(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });
    this.registerInitializeHandler();
    this.registerTools();
  }

  private registerInitializeHandler(): void {
    this.server.server.setRequestHandler(InitializeRequestSchema, (request) => {
      const requestedVersion = request.params.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
        ? requestedVersion
        : LATEST_PROTOCOL_VERSION;

      return {
        protocolVersion,
        capabilities: SERVER_CAPABILITIES,
        serverInfo: SERVER_INFO,
        sessionToken: this.sessionToken,
      };
    });
  }

  private registerTools(): void {
    this.server.registerTool(
      'memory_read',
      {
        description: 'Read a Sherpa memory entry by id',
        inputSchema: memoryReadSchema,
      },
      async (args) => toolResponse(await handleMemoryRead(asToolArgs(args), this.toolCtx)),
    );

    this.server.registerTool(
      'memory_write',
      {
        description: 'Create or update a Sherpa memory entry',
        inputSchema: memoryWriteSchema,
      },
      async (args) => toolResponse(await handleMemoryWrite(asToolArgs(args), this.toolCtx)),
    );

    this.server.registerTool(
      'memory_search',
      {
        description: 'Search Sherpa memory chunks',
        inputSchema: memorySearchSchema,
      },
      async (args) => toolResponse(await handleMemorySearch(asToolArgs(args), this.toolCtx)),
    );
  }

  /** Starts listening until stdin closes (stdio MCP lifecycle). */
  start(): void {
    void this.connect(new StdioServerTransport()).catch((err: unknown) => {
      process.stderr.write(`Failed to start Sherpa MCP server: ${String(err)}\n`);
      process.exitCode = 1;
    });
  }

  async connect(transport: Transport): Promise<void> {
    transport.onclose = () => this.closeMemory();
    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    try {
      await this.server.close();
    } finally {
      this.closeMemory();
    }
  }

  stop(): void {
    void this.close();
  }

  getSessionToken(): string {
    return this.sessionToken;
  }

  private closeMemory(): void {
    if (this.closed) return;
    this.closed = true;
    this.toolCtx.memory.close();
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
