import { randomUUID } from 'node:crypto';

import type { AuditService } from '@sherpa/core-audit';
import {
  MemoryChunkRepository,
  MemoryEntryRepository,
  WorkspaceRepository,
  type MemoryChunkRecord,
  type MemoryEntryRecord,
  type SqliteDatabase,
} from '@sherpa/infra-sqlite';

import { scanForSecrets } from './secret-scanner.js';
import type { CreateEntryInput, ListFilters, MemoryClassification, MemoryEntry } from './types.js';

const BODY_MAX_BYTES = 256 * 1024;
const CLASSIFICATIONS: MemoryClassification[] = ['public', 'internal', 'confidential', 'restricted'];

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function assertClassification(value: unknown): asserts value is MemoryClassification {
  if (typeof value !== 'string' || !CLASSIFICATIONS.includes(value as MemoryClassification)) {
    throw new Error(
      `Invalid classification "${String(value)}". Expected one of: ${CLASSIFICATIONS.join(', ')}.`,
    );
  }
}

function mapRecord(row: MemoryEntryRecord): MemoryEntry {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    type: row.type,
    title: row.title,
    body: row.body,
    tags: JSON.parse(row.tags) as string[],
    classification: row.classification as MemoryClassification,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    archived_at: row.archived_at === null ? null : new Date(row.archived_at).toISOString(),
  };
}

function resolveArchivedAt(
  update: string | null | undefined,
  existing: number | null,
): number | null {
  if (update === undefined) return existing;
  if (update === null) return null;
  const ms = Date.parse(update);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid archived_at ISO timestamp: "${update}".`);
  }
  return ms;
}

function rebuildChunks(db: SqliteDatabase, chunksRepo: MemoryChunkRepository, entryId: string, body: string): void {
  chunksRepo.deleteByEntryId(entryId);
  const parts = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const now = Date.now();
  const tx = db.transaction(() => {
    parts.forEach((content, index) => {
      const chunk: MemoryChunkRecord = {
        id: randomUUID(),
        entry_id: entryId,
        content,
        chunk_index: index,
        metadata: '{}',
        embedding: null,
        created_at: now,
      };
      chunksRepo.insert(chunk);
    });
  });
  tx();
}

/**
 * CRUD surface with validation, secret scanning, and audit logging for agent-facing workflows.
 */
export class MemoryService {
  private readonly entries: MemoryEntryRepository;
  private readonly chunks: MemoryChunkRepository;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly auditService: AuditService,
  ) {
    new WorkspaceRepository(db).ensureDefaultWorkspace();
    this.entries = new MemoryEntryRepository(db);
    this.chunks = new MemoryChunkRepository(db);
  }

  createMemoryEntry(entry: CreateEntryInput): MemoryEntry {
    assertClassification(entry.classification ?? 'public');

    const resolvedBody = entry.body ?? entry.content;
    if (resolvedBody === undefined || resolvedBody.trim().length === 0) {
      throw new Error('Memory entry requires `body` or `content`.');
    }

    const byteLen = utf8ByteLength(resolvedBody);
    if (byteLen > BODY_MAX_BYTES) {
      throw new Error(
        `Memory body exceeds maximum size (${BODY_MAX_BYTES} UTF-8 bytes); received ${byteLen} bytes. Trim content or split across entries.`,
      );
    }

    const combinedForSecrets = `${entry.title}\n${resolvedBody}`;
    const secretScan = scanForSecrets(combinedForSecrets);
    if (secretScan.found) {
      const rules = [...new Set(secretScan.matches.map((m) => m.ruleId))].join(', ');
      throw new Error(
        `Secret scanning rejected this memory entry (${secretScan.matches.length} hit(s), rules: ${rules}). Remove credential-like material before storing.`,
      );
    }

    const now = Date.now();
    const id = randomUUID();
    const tagsJson = JSON.stringify(entry.tags ?? []);
    const classification = entry.classification ?? 'public';
    const row: MemoryEntryRecord = {
      id,
      workspace_id: entry.workspace_id ?? 'default',
      type: entry.type,
      title: entry.title,
      body: resolvedBody,
      tags: tagsJson,
      classification,
      created_at: now,
      updated_at: now,
      archived_at: null,
    };

    const tx = this.db.transaction(() => {
      this.entries.upsert(row);
      rebuildChunks(this.db, this.chunks, id, resolvedBody);
    });
    tx();

    this.auditService.log({
      operation: 'memory.created',
      resource_type: 'memory_entry',
      resource_id: id,
      details: { workspace_id: row.workspace_id, type: row.type, classification },
    });

    return this.getMemoryEntry(id)!;
  }

  getMemoryEntry(id: string): MemoryEntry | null {
    const row = this.entries.findById(id);
    return row ? mapRecord(row) : null;
  }

  updateMemoryEntry(id: string, updates: Partial<MemoryEntry>): MemoryEntry {
    const existing = this.entries.findById(id);
    if (!existing) {
      throw new Error(`Cannot update memory entry "${id}" because it does not exist.`);
    }

    if (updates.classification !== undefined) {
      assertClassification(updates.classification);
    }

    const mergedRecord: MemoryEntryRecord = {
      id,
      workspace_id: updates.workspace_id ?? existing.workspace_id,
      type: updates.type ?? existing.type,
      title: updates.title ?? existing.title,
      body: updates.body ?? existing.body,
      tags: updates.tags ? JSON.stringify(updates.tags) : existing.tags,
      classification: updates.classification ?? existing.classification,
      created_at: existing.created_at,
      updated_at: Date.now(),
      archived_at: resolveArchivedAt(updates.archived_at, existing.archived_at),
    };

    const byteLen = utf8ByteLength(mergedRecord.body);
    if (byteLen > BODY_MAX_BYTES) {
      throw new Error(
        `Memory body exceeds maximum size (${BODY_MAX_BYTES} UTF-8 bytes); received ${byteLen} bytes.`,
      );
    }

    const mergedEntry = mapRecord(mergedRecord);
    const secretScan = scanForSecrets(`${mergedEntry.title}\n${mergedEntry.body}`);
    if (secretScan.found) {
      const rules = [...new Set(secretScan.matches.map((m) => m.ruleId))].join(', ');
      throw new Error(
        `Secret scanning rejected this update (${secretScan.matches.length} hit(s), rules: ${rules}). Remove credential-like material before storing.`,
      );
    }

    const tx = this.db.transaction(() => {
      this.entries.upsert(mergedRecord);
      rebuildChunks(this.db, this.chunks, id, mergedRecord.body);
    });
    tx();

    this.auditService.log({
      operation: 'memory.updated',
      resource_type: 'memory_entry',
      resource_id: id,
      details: { fields: Object.keys(updates) },
    });

    return this.getMemoryEntry(id)!;
  }

  archiveMemoryEntry(id: string): void {
    const existing = this.entries.findById(id);
    if (!existing) {
      throw new Error(`Cannot archive memory entry "${id}" because it does not exist.`);
    }

    const now = Date.now();
    this.entries.upsert({
      ...existing,
      updated_at: now,
      archived_at: now,
    });

    this.auditService.log({
      operation: 'memory.archived',
      resource_type: 'memory_entry',
      resource_id: id,
      details: {},
    });
  }

  listMemoryEntries(filters?: ListFilters): MemoryEntry[] {
    const clauses: string[] = [`archived_at IS NULL`];
    const params: Record<string, unknown> = {};

    if (filters?.workspace_id) {
      clauses.push(`workspace_id = @workspace_id`);
      params.workspace_id = filters.workspace_id;
    }
    if (filters?.type) {
      clauses.push(`type = @type`);
      params.type = filters.type;
    }
    if (filters?.classification) {
      clauses.push(`classification = @classification`);
      params.classification = filters.classification;
    }
    if (filters?.dateRange?.from) {
      const fromMs = Date.parse(filters.dateRange.from);
      if (!Number.isNaN(fromMs)) {
        clauses.push(`created_at >= @from`);
        params.from = fromMs;
      }
    }
    if (filters?.dateRange?.to) {
      const toMs = Date.parse(filters.dateRange.to);
      if (!Number.isNaN(toMs)) {
        clauses.push(`created_at <= @to`);
        params.to = toMs;
      }
    }

    const sql = `SELECT * FROM MEMORY_ENTRIES WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`;
    const rows = this.db.prepare(sql).all(params) as MemoryEntryRecord[];

    let entries = rows.map(mapRecord);

    if (filters?.tags?.length) {
      const required = new Set(filters.tags);
      entries = entries.filter((e) => {
        const have = new Set(e.tags);
        for (const t of required) {
          if (!have.has(t)) return false;
        }
        return true;
      });
    }

    return entries;
  }
}

/** Ensures migrations ran — `@sherpa/infra-sqlite` applies SCHEMA_SQL via {@link initDatabase}. */
export function ensureMemorySchema(db: SqliteDatabase): void {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='MEMORY_ENTRIES'`)
    .get() as { c: number };
  if (!row.c) {
    throw new Error(
      'MEMORY_ENTRIES table missing — open the database through initDatabase()/MigrationRunner before using MemoryService.',
    );
  }
}
