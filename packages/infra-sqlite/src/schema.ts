/**
 * Canonical DDL for Sherpa persistence. Applied via {@link MigrationRunner}.
 *
 * Table names use uppercase for parity with the Sherpa architecture diagram;
 * SQLite identifiers are case-insensitive unless quoted.
 */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS WORKSPACES (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS MEMORY_ENTRIES (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  classification TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  FOREIGN KEY (workspace_id) REFERENCES WORKSPACES(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_workspace ON MEMORY_ENTRIES(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_type ON MEMORY_ENTRIES(type);
CREATE INDEX IF NOT EXISTS idx_memory_entries_classification ON MEMORY_ENTRIES(classification);
CREATE INDEX IF NOT EXISTS idx_memory_entries_archived ON MEMORY_ENTRIES(archived_at);

CREATE TABLE IF NOT EXISTS MEMORY_CHUNKS (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  embedding BLOB,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES MEMORY_ENTRIES(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_entry ON MEMORY_CHUNKS(entry_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  entry_id UNINDEXED,
  content,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON MEMORY_CHUNKS BEGIN
  INSERT INTO memory_chunks_fts(rowid, chunk_id, entry_id, content)
  VALUES (new.rowid, new.id, new.entry_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON MEMORY_CHUNKS BEGIN
  DELETE FROM memory_chunks_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS memory_chunks_au AFTER UPDATE OF content, chunk_index ON MEMORY_CHUNKS BEGIN
  DELETE FROM memory_chunks_fts WHERE rowid = old.rowid;
  INSERT INTO memory_chunks_fts(rowid, chunk_id, entry_id, content)
  VALUES (new.rowid, new.id, new.entry_id, new.content);
END;

CREATE TABLE IF NOT EXISTS AUDIT_EVENTS (
  id TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  operation TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details TEXT NOT NULL,
  checksum TEXT NOT NULL,
  prev_checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created ON AUDIT_EVENTS(created_at);

CREATE TABLE IF NOT EXISTS SKILLS (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  body TEXT NOT NULL,
  checksum TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS SESSIONS (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workspace_id) REFERENCES WORKSPACES(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON SESSIONS(workspace_id);

CREATE TABLE IF NOT EXISTS ARTIFACTS (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES SESSIONS(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifacts_session ON ARTIFACTS(session_id);

INSERT OR IGNORE INTO WORKSPACES(id, name, created_at)
VALUES (
  'default',
  'Default',
  (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);
`;
