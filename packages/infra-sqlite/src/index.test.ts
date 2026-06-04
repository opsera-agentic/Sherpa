import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MemoryChunkRepository,
  MemoryEntryRepository,
  WorkspaceRepository,
  initDatabase,
} from './index.js';

describe('infra-sqlite', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    tmp = undefined;
  });

  it('applies WAL and performance pragmas on open', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-infra-sqlite-pragma-'));
    const db = initDatabase(path.join(tmp, '.sherpa', 'memory.sqlite'));

    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(db.pragma('temp_store', { simple: true })).toBe(2); // MEMORY
    expect(db.pragma('cache_size', { simple: true })).toBe(-16000);

    db.close();
  });

  it('initializes WAL database, migrates schema, and searches FTS chunks', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-infra-sqlite-'));
    const dbPath = path.join(tmp, '.sherpa', 'memory.sqlite');
    const db = initDatabase(dbPath);

    const workspaces = new WorkspaceRepository(db);
    workspaces.ensureDefaultWorkspace();

    const entries = new MemoryEntryRepository(db);
    const chunks = new MemoryChunkRepository(db);
    const entryId = randomUUID();
    const now = Date.now();
    const marker = `ftsmarker${randomUUID().replace(/-/g, '')}`;

    entries.upsert({
      id: entryId,
      workspace_id: 'default',
      type: 'note',
      title: 'SQLite FTS smoke test',
      body: `${marker} embedding pipeline validation`,
      tags: JSON.stringify(['infra']),
      classification: 'internal',
      created_at: now,
      updated_at: now,
      archived_at: null,
    });

    chunks.insert({
      id: randomUUID(),
      entry_id: entryId,
      content: `${marker} embedding pipeline validation`,
      chunk_index: 0,
      metadata: '{}',
      embedding: null,
      created_at: now,
    });

    const repo = new MemoryChunkRepository(db);
    const hits = repo.searchFts(marker, 'e.archived_at IS NULL', {}, 10, 0);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title).toContain('SQLite');

    db.close();
  });
});
