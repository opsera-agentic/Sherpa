import type { AuditService } from '@sherpa/core-audit';
import type { MemoryClassification, MemoryRepository } from '@sherpa/core-memory';
import { searchMemory } from '@sherpa/core-search';

export interface ToolContext {
  memory: MemoryRepository;
  audit: AuditService;
  sessionToken: string;
  allowWrite: boolean;
}

export async function handleMemoryRead(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  ctx.audit.log({
    operation: 'memory_read',
    resource_type: 'memory.entry',
    resource_id: String(args.id ?? ''),
    details: { transport: 'mcp' },
  });
  const token = String(args.sessionToken ?? '');
  if (token !== ctx.sessionToken) {
    throw new Error('Invalid session token');
  }
  const id = String(args.id ?? '');
  if (!id) {
    throw new Error('memory_read requires id');
  }
  const entry = ctx.memory.getEntry(id);
  if (!entry) {
    return { found: false };
  }
  return { found: true, entry };
}

export async function handleMemoryWrite(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  ctx.audit.log({
    operation: 'memory_write',
    resource_type: 'memory.entry',
    resource_id: String(args.id ?? 'new'),
    details: { title: args.title },
  });
  if (!ctx.allowWrite) {
    throw new Error('memory_write disabled (restart server with --allow-write)');
  }
  const token = String(args.sessionToken ?? '');
  if (token !== ctx.sessionToken) {
    throw new Error('Invalid session token');
  }
  const title = String(args.title ?? '');
  const body = String(args.content ?? '');
  const type = String(args.type ?? 'note');
  const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
  const classification = (args.classification as MemoryClassification | undefined) ?? 'internal';
  const workspace_id = String(args.workspace_id ?? 'default');
  if (!title || !body) {
    throw new Error('memory_write requires title and content');
  }
  const id = ctx.memory.upsertEntry({
    id: args.id ? String(args.id) : undefined,
    workspace_id,
    title,
    body,
    type,
    tags,
    classification,
  });
  return { id };
}

export async function handleMemorySearch(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  ctx.audit.log({
    operation: 'memory_search',
    resource_type: 'memory.index',
    resource_id: 'fts',
    details: { query: args.query },
  });
  const token = String(args.sessionToken ?? '');
  if (token !== ctx.sessionToken) {
    throw new Error('Invalid session token');
  }
  const query = String(args.query ?? '');
  if (!query) {
    throw new Error('memory_search requires query');
  }
  const limit = args.limit !== undefined ? Number(args.limit) : 10;
  const mode = (args.mode as 'hybrid' | 'bm25' | 'vector' | undefined) ?? 'hybrid';
  const types = Array.isArray(args.types) ? args.types.map(String) : undefined;
  const tags = Array.isArray(args.tags) ? args.tags.map(String) : undefined;
  const hits = searchMemory(ctx.memory, query, { limit, mode, types, tags });
  return { hits };
}
