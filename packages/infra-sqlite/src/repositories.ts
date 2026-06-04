import type BetterSqlite from 'better-sqlite3';

export type SqliteDatabase = BetterSqlite.Database;

export interface MemoryEntryRecord {
  readonly id: string;
  readonly workspace_id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly tags: string;
  readonly classification: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly archived_at: number | null;
}

export interface MemoryChunkRecord {
  readonly id: string;
  readonly entry_id: string;
  readonly content: string;
  readonly chunk_index: number;
  readonly metadata: string;
  readonly embedding: Buffer | null;
  readonly created_at: number;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly actor: string;
  readonly operation: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details: string;
  readonly checksum: string;
  readonly prev_checksum: string;
  readonly created_at: number;
}

export class WorkspaceRepository {
  constructor(private readonly db: SqliteDatabase) {}

  /** Ensures the bundled default workspace exists for single-tenant CLI flows. */
  ensureDefaultWorkspace(): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO WORKSPACES(id, name, created_at)
         VALUES ('default', 'Default', @created_at)`,
      )
      .run({ created_at: Date.now() });
  }
}

export class MemoryEntryRepository {
  constructor(private readonly db: SqliteDatabase) {}

  upsert(entry: MemoryEntryRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO MEMORY_ENTRIES (
        id, workspace_id, type, title, body, tags, classification,
        created_at, updated_at, archived_at
      ) VALUES (
        @id, @workspace_id, @type, @title, @body, @tags, @classification,
        @created_at, @updated_at, @archived_at
      )
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        type = excluded.type,
        title = excluded.title,
        body = excluded.body,
        tags = excluded.tags,
        classification = excluded.classification,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `);
    stmt.run(entry);
  }

  findById(id: string): MemoryEntryRecord | undefined {
    return this.db.prepare(`SELECT * FROM MEMORY_ENTRIES WHERE id = ?`).get(id) as MemoryEntryRecord | undefined;
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM MEMORY_ENTRIES`).get() as { c: number };
    return row.c;
  }
}

export class MemoryChunkRepository {
  constructor(private readonly db: SqliteDatabase) {}

  deleteByEntryId(entryId: string): void {
    this.db.prepare(`DELETE FROM MEMORY_CHUNKS WHERE entry_id = ?`).run(entryId);
  }

  insert(chunk: MemoryChunkRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO MEMORY_CHUNKS (
        id, entry_id, content, chunk_index, metadata, embedding, created_at
      ) VALUES (
        @id, @entry_id, @content, @chunk_index, @metadata, @embedding, @created_at
      )
    `);
    stmt.run(chunk);
  }

  /** BM25-ranked FTS5 rows joined back to live entries for filtering and snippets. */
  searchFts(ftsQuery: string, filterClause: string, params: Record<string, unknown>, limit: number, offset: number) {
    // Bind the MATCH expression instead of interpolating it. This keeps the
    // SQL text constant so better-sqlite3 reuses one prepared statement across
    // queries, and removes the fragile manual single-quote escaping.
    const sql = `
      SELECT
        e.id AS id,
        e.title AS title,
        e.body AS body,
        e.type AS type,
        e.tags AS tags,
        snippet(memory_chunks_fts, 2, '[', ']', ' … ', 24) AS body_snippet,
        bm25(memory_chunks_fts) AS bm25_score
      FROM memory_chunks_fts
      INNER JOIN MEMORY_ENTRIES AS e ON e.id = memory_chunks_fts.entry_id
      WHERE memory_chunks_fts MATCH @ftsMatch
        AND (${filterClause})
      ORDER BY bm25_score ASC
      LIMIT @limit OFFSET @offset
    `;
    return this.db.prepare(sql).all({
      ...params,
      ftsMatch: ftsQuery,
      limit,
      offset,
    }) as Array<{
      id: string;
      title: string;
      body: string;
      type: string;
      tags: string;
      body_snippet: string;
      bm25_score: number;
    }>;
  }

  /** Returns chunks carrying embeddings suitable for vector similarity scans. */
  listEmbeddingRows(filterClause: string, params: Record<string, unknown>) {
    const sql = `
      SELECT e.id AS id, e.title AS title, e.body AS body, e.type AS type, e.tags AS tags,
             c.embedding AS embedding
      FROM MEMORY_CHUNKS c
      INNER JOIN MEMORY_ENTRIES e ON e.id = c.entry_id
      WHERE c.embedding IS NOT NULL AND (${filterClause})
    `;
    return this.db.prepare(sql).all(params) as Array<{
      id: string;
      title: string;
      body: string;
      type: string;
      tags: string;
      embedding: Buffer;
    }>;
  }
}

export class AuditEventRepository {
  constructor(private readonly db: SqliteDatabase) {}

  insert(row: AuditEventRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO AUDIT_EVENTS (
        id, actor, operation, resource_type, resource_id,
        details, checksum, prev_checksum, created_at
      ) VALUES (
        @id, @actor, @operation, @resource_type, @resource_id,
        @details, @checksum, @prev_checksum, @created_at
      )
    `);
    stmt.run(row);
  }

  listOrderedByCreatedAt(): AuditEventRecord[] {
    return this.db
      .prepare(`SELECT * FROM AUDIT_EVENTS ORDER BY created_at ASC, rowid ASC`)
      .all() as AuditEventRecord[];
  }

  latestChecksum(): string | null {
    const row = this.db
      .prepare(`SELECT checksum FROM AUDIT_EVENTS ORDER BY created_at DESC, rowid DESC LIMIT 1`)
      .get() as { checksum: string } | undefined;
    return row?.checksum ?? null;
  }
}
