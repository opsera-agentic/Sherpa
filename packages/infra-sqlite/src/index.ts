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
  // Performance pragmas for the write-then-search workload:
  //  - synchronous=NORMAL is durable under WAL and much faster than FULL
  //  - busy_timeout avoids SQLITE_BUSY when the CLI and the MCP server (or
  //    two commands) touch the same WAL database concurrently
  //  - a larger negative cache_size (KB) and in-memory temp store speed up
  //    FTS/aggregate queries that spill scratch data
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -16000');
  db.pragma('temp_store = MEMORY');
  new MigrationRunner(db).run();
  return db;
}
