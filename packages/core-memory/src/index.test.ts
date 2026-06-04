import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { MemoryRepository, scanForSecrets } from './index.js';

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = undefined;
});

function bootstrap(): MemoryRepository {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-memory-repo-'));
  const dbPath = path.join(tmpDir, '.sherpa', 'memory.sqlite');
  return new MemoryRepository(dbPath);
}

describe('scanForSecrets', () => {
  it('detects AWS-style identifiers', () => {
    const result = scanForSecrets('token AKIAIOSFODNN7EXAMPLE trail');
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.ruleId === 'aws_access_key_id')).toBe(true);
  });

  it('allows benign prose', () => {
    const result = scanForSecrets('Sherpa keeps institutional knowledge structured.');
    expect(result.found).toBe(false);
  });

  it('detects JSON-style password fields', () => {
    const result = scanForSecrets('{ "password": "hunter2" }');
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.ruleId === 'json_secret')).toBe(true);
  });

  it('detects MongoDB URIs with credentials', () => {
    const result = scanForSecrets('mongodb+srv://admin:s3cret@cluster0.example.net');
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.ruleId === 'mongodb_uri')).toBe(true);
  });

  it('detects GitHub PATs', () => {
    const result = scanForSecrets('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12');
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.ruleId === 'github_pat')).toBe(true);
  });

  it('detects Bearer tokens', () => {
    const result = scanForSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature');
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.ruleId === 'generic_bearer')).toBe(true);
  });

  it('does not false-positive on short strings', () => {
    const result = scanForSecrets('See commit abc123 for details on the refactor.');
    expect(result.found).toBe(false);
  });
});

describe('MemoryRepository', () => {
  it('persists entries and materializes FTS-backed chunks', () => {
    const memory = bootstrap();

    const id = memory.upsertEntry({
      workspace_id: 'default',
      type: 'note',
      title: 'Hello',
      body: 'World context\n\nSecond paragraph',
      tags: ['alpha'],
      classification: 'internal',
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/i);

    const entry = memory.getEntry(id);
    expect(entry?.title).toBe('Hello');

    const chunks = memory
      .getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM MEMORY_CHUNKS WHERE entry_id = ?`)
      .get(id) as { c: number };
    expect(chunks.c).toBeGreaterThan(0);

    memory.close();
  });

  it('archives stale rows via archived_at metadata', () => {
    const memory = bootstrap();

    const id = memory.upsertEntry({
      workspace_id: 'default',
      type: 'note',
      title: 'Archive me',
      body: 'content',
      tags: [],
      classification: 'internal',
    });

    expect(memory.getEntry(id)?.archived_at).toBeNull();

    memory.getDatabase().prepare(`UPDATE MEMORY_ENTRIES SET updated_at = @ts WHERE id = @id`).run({ ts: 1, id });

    memory.archiveOlderThan(new Date().toISOString());

    expect(memory.getEntry(id)?.archived_at).toBeTruthy();

    memory.close();
  });

  it('reindexes derived chunks', async () => {
    const memory = bootstrap();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'note',
      title: 'Doc',
      body: 'Part one\n\nPart two',
      tags: [],
      classification: 'public',
    });

    const stats = await memory.reindexAll();
    expect(stats.entries).toBeGreaterThan(0);
    expect(stats.chunks).toBeGreaterThan(0);

    memory.close();
  });

  it('persists chunk embeddings when an embedder is supplied', async () => {
    const memory = bootstrap();
    const db = memory.getDatabase();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'note',
      title: 'Doc',
      body: 'Alpha section here\n\nBeta section there',
      tags: [],
      classification: 'public',
    });

    const nullBefore = (
      db.prepare('SELECT COUNT(*) AS c FROM MEMORY_CHUNKS WHERE embedding IS NOT NULL').get() as { c: number }
    ).c;
    expect(nullBefore).toBe(0);

    // A trivial 3-dim embedder; the contract allows sync or async embedBatch.
    const embedder = {
      embedBatch: (texts: string[]) => texts.map((_, i) => [i + 1, 0, 0]),
    };
    const stats = await memory.reindexAll(embedder);
    expect(stats.chunks).toBe(2);

    const withEmbedding = (
      db.prepare('SELECT COUNT(*) AS c FROM MEMORY_CHUNKS WHERE embedding IS NOT NULL').get() as { c: number }
    ).c;
    expect(withEmbedding).toBe(2);

    // Stored as a 3-float (12-byte) blob.
    const row = db
      .prepare('SELECT LENGTH(embedding) AS len FROM MEMORY_CHUNKS WHERE embedding IS NOT NULL LIMIT 1')
      .get() as { len: number };
    expect(row.len).toBe(12);

    memory.close();
  });
});
