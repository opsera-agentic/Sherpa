import fs from 'node:fs';
import path from 'node:path';

import BetterSqlite from 'better-sqlite3';

import { MigrationRunner } from './migrations.js';

export type { SqliteDatabase } from './repositories.js';
export { ALL_MIGRATIONS, MigrationRunner, type Migration } from './migrations.js';
export {
  AuditEventRepository,
  MemoryChunkRepository,
  MemoryEntryRepository,
  WorkspaceRepository,
  type AuditEventRecord,
  type MemoryChunkRecord,
  type MemoryEntryRecord,
} from './repositories.js';
export { SCHEMA_SQL } from './schema.js';

/** Opens (or creates) a SQLite database with WAL journaling and applies migrations. */
export function initDatabase(dbPath: string): BetterSqlite.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new BetterSqlite(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  new MigrationRunner(db).run();
  return db;
}
