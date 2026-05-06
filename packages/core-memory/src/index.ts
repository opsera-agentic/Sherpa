import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  MemoryChunkRepository,
  MemoryEntryRepository,
  WorkspaceRepository,
  initDatabase,
  type MemoryChunkRecord,
  type MemoryEntryRecord,
  type SqliteDatabase,
} from '@sherpa/infra-sqlite';

import type { CreateEntryInput, MemoryEntry } from './types.js';

export type { MemoryClassification, CreateEntryInput, MemoryEntry, ListFilters } from './types.js';
export { scanForSecrets } from './secret-scanner.js';
export { MemoryService, ensureMemorySchema } from './memory-service.js';

/** Computes SHA-256 checksum for migration verification and integrity. */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** SQLite-backed memory facade layered on `@sherpa/infra-sqlite` repositories. */
export class MemoryRepository {
  private readonly db: SqliteDatabase;
  private readonly workspaces: WorkspaceRepository;
  private readonly entries: MemoryEntryRepository;
  private readonly chunks: MemoryChunkRepository;

  constructor(dbPath: string, existingDb?: SqliteDatabase) {
    if (existingDb) {
      this.db = existingDb;
    } else {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      this.db = initDatabase(dbPath);
    }
    this.workspaces = new WorkspaceRepository(this.db);
    this.entries = new MemoryEntryRepository(this.db);
    this.chunks = new MemoryChunkRepository(this.db);
    this.workspaces.ensureDefaultWorkspace();
  }

  upsertEntry(input: CreateEntryInput): string {
    const resolvedBody = input.body ?? input.content;
    if (resolvedBody === undefined || resolvedBody.trim().length === 0) {
      throw new Error('Memory upsert requires `body` or `content`.');
    }

    const id = input.id ?? randomUUID();
    const existing = this.entries.findById(id);
    const now = Date.now();
    const workspaceId = input.workspace_id ?? 'default';
    const tagsJson = JSON.stringify(input.tags ?? []);
    const classification = input.classification ?? 'public';
    const row: MemoryEntryRecord = {
      id,
      workspace_id: workspaceId,
      type: input.type,
      title: input.title,
      body: resolvedBody,
      tags: tagsJson,
      classification,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      archived_at: existing?.archived_at ?? null,
    };

    const txn = this.db.transaction(() => {
      this.entries.upsert(row);
      this.rebuildChunks(id, resolvedBody);
    });
    txn();
    return id;
  }

  private rebuildChunks(entryId: string, body: string): number {
    this.chunks.deleteByEntryId(entryId);
    const parts = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const now = Date.now();
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
      this.chunks.insert(chunk);
    });
    return parts.length;
  }

  /** Rebuilds MEMORY_CHUNKS rows for every entry after bulk imports. */
  reindexAll(): { entries: number; chunks: number } {
    const rows = this.db.prepare(`SELECT id, body FROM MEMORY_ENTRIES`).all() as Array<{ id: string; body: string }>;
    let chunks = 0;
    const txn = this.db.transaction(() => {
      for (const row of rows) {
        chunks += this.rebuildChunks(row.id, row.body);
      }
    });
    txn();
    return { entries: rows.length, chunks };
  }

  /** Marks entries older than `cutoffIso` as archived; returns rows touched. */
  archiveOlderThan(cutoffIso: string): number {
    const cutoffMs = Date.parse(cutoffIso);
    if (Number.isNaN(cutoffMs)) {
      throw new Error(`Invalid ISO cutoff timestamp: ${cutoffIso}`);
    }
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE MEMORY_ENTRIES
         SET archived_at = @now
         WHERE updated_at < @cutoff AND archived_at IS NULL`,
      )
      .run({ now, cutoff: cutoffMs });
    return Number(result.changes ?? 0);
  }

  dbFileSizeBytes(dbPath: string): number {
    try {
      return fs.statSync(dbPath).size;
    } catch {
      return 0;
    }
  }

  getEntry(id: string): MemoryEntry | undefined {
    const row = this.entries.findById(id);
    if (!row) return undefined;
    return this.mapRow(row);
  }

  private mapRow(row: MemoryEntryRecord): MemoryEntry {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      type: row.type,
      title: row.title,
      body: row.body,
      tags: JSON.parse(row.tags) as string[],
      classification: row.classification as MemoryEntry['classification'],
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      archived_at: row.archived_at === null ? null : new Date(row.archived_at).toISOString(),
    };
  }

  countEntries(): number {
    return this.entries.count();
  }

  close(): void {
    this.db.close();
  }

  /** Search helpers operate against the shared SQLite connection. */
  getDatabase(): SqliteDatabase {
    return this.db;
  }
}
