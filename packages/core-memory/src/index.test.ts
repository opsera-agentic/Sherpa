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

  it('reindexes derived chunks', () => {
    const memory = bootstrap();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'note',
      title: 'Doc',
      body: 'Part one\n\nPart two',
      tags: [],
      classification: 'public',
    });

    const stats = memory.reindexAll();
    expect(stats.entries).toBeGreaterThan(0);
    expect(stats.chunks).toBeGreaterThan(0);

    memory.close();
  });
});
