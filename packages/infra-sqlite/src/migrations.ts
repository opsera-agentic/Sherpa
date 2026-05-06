import type BetterSqlite from 'better-sqlite3';

import { SCHEMA_SQL } from './schema.js';

export interface Migration {
  readonly id: string;
  readonly up: (db: BetterSqlite.Database) => void;
}

/** Ordered migrations applied exactly once and recorded in {@link MIGRATIONS_TABLE}. */
export const MIGRATIONS_TABLE = 'MIGRATIONS';

export const ALL_MIGRATIONS: readonly Migration[] = [
  {
    id: '001_initial_schema',
    up(db) {
      db.exec(SCHEMA_SQL);
    },
  },
  {
    id: '002_fts_chunk_triggers',
    up(db) {
      db.exec(`
        DROP TRIGGER IF EXISTS memory_chunks_au;
        DROP TRIGGER IF EXISTS memory_chunks_ad;

        CREATE TRIGGER memory_chunks_ad AFTER DELETE ON MEMORY_CHUNKS BEGIN
          DELETE FROM memory_chunks_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER memory_chunks_au AFTER UPDATE OF content, chunk_index ON MEMORY_CHUNKS BEGIN
          DELETE FROM memory_chunks_fts WHERE rowid = old.rowid;
          INSERT INTO memory_chunks_fts(rowid, chunk_id, entry_id, content)
          VALUES (new.rowid, new.id, new.entry_id, new.content);
        END;
      `);
    },
  },
];

export class MigrationRunner {
  constructor(private readonly db: BetterSqlite.Database) {}

  /** Applies pending migrations inside a transaction each. */
  run(migrations: readonly Migration[] = ALL_MIGRATIONS): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const applied = new Set(
      (this.db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE}`).all() as { id: string }[]).map((r) => r.id),
    );

    const insertApplied = this.db.prepare(
      `INSERT INTO ${MIGRATIONS_TABLE}(id, applied_at) VALUES (@id, @applied_at)`,
    );

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      const txn = this.db.transaction(() => {
        migration.up(this.db);
        insertApplied.run({ id: migration.id, applied_at: Date.now() });
      });
      txn();
      applied.add(migration.id);
    }
  }
}
