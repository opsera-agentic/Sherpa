import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { SqliteDatabase } from '@sherpa/infra-sqlite';
import type { EmbeddingProvider } from '@sherpa/infra-embedding';
import { MemoryRepository } from '@sherpa/core-memory';

import { reciprocalRankFusion, sortIdsByScore } from './fusion.js';
import { SearchService } from './index.js';

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = undefined;
});

function bootstrap(): { db: SqliteDatabase; memory: MemoryRepository; search: SearchService } {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-core-search-'));
  const dbPath = path.join(tmpDir, '.sherpa', 'memory.sqlite');
  const memory = new MemoryRepository(dbPath);
  const search = new SearchService(memory.getDatabase());
  return { db: memory.getDatabase(), memory, search };
}

function seedEmbedding(db: SqliteDatabase, entryId: string, vector: number[]): void {
  const row = db
    .prepare(`SELECT rowid FROM MEMORY_CHUNKS WHERE entry_id = ? ORDER BY chunk_index ASC LIMIT 1`)
    .get(entryId) as { rowid: number } | undefined;
  if (!row) {
    throw new Error(`MEMORY_CHUNKS row missing for entry ${entryId}`);
  }
  const f32 = new Float32Array(vector);
  const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
  db.prepare(`UPDATE MEMORY_CHUNKS SET embedding = ? WHERE rowid = ?`).run(buf, Number(row.rowid));
}

function embeddingStub(embedFn: (text: string) => number[]): EmbeddingProvider {
  return {
    embed: (text: string) => embedFn(text),
    embedBatch: (texts: string[]) => texts.map((t) => embedFn(t)),
  };
}

describe('reciprocalRankFusion', () => {
  it('prioritizes ids appearing early in multiple lists', () => {
    const fused = reciprocalRankFusion(
      [
        ['a', 'b', 'c'],
        ['b', 'a', 'd'],
      ],
      60,
    );

    expect(sortIdsByScore(fused)[0]).toBe('a');
  });
});

describe('SearchService', () => {
  it('returns BM25 hits backed by chunk FTS', () => {
    const { memory, search } = bootstrap();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'doc',
      title: 'Rust primer',
      body: 'Ownership eliminates data races in systems programming.',
      tags: ['systems'],
      classification: 'public',
    });

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'doc',
      title: 'Python primer',
      body: 'Async IO excels at network-bound workloads.',
      tags: ['python'],
      classification: 'public',
    });

    const hits = search.searchBM25('ownership programming');

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].metadata.ranker).toBe('bm25');

    memory.close();
  });

  it('handles queries containing single quotes via the bound MATCH param', () => {
    const { memory, search } = bootstrap();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'doc',
      title: "O'Reilly handbook",
      body: "The team's ownership model is documented here.",
      tags: [],
      classification: 'public',
    });

    // An apostrophe in the query must not break the SQL or throw — the MATCH
    // expression is bound, not interpolated.
    expect(() => search.searchBM25("team's ownership")).not.toThrow();
    expect(search.searchBM25('ownership').length).toBeGreaterThan(0);

    memory.close();
  });

  it('runs filtered queries via search()', async () => {
    const { memory, search } = bootstrap();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'fact',
      title: 'Filtered hit',
      body: 'Unique sherpa-filter-token lives here',
      tags: ['beta'],
      classification: 'internal',
    });

    const hits = await search.search('sherpa-filter-token', {
      mode: 'bm25',
      filters: { classification: 'internal', tags: ['beta'] },
      limit: 5,
      offset: 0,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('Filtered hit');

    memory.close();
  });

  it('orders vector matches using chunk embeddings', async () => {
    const { db, memory } = bootstrap();

    const provider = embeddingStub((text: string) => (text.includes('alpha') ? [1, 0, 0] : [0, 1, 0]));

    const search = new SearchService(db, provider);

    const firstId = memory.upsertEntry({
      workspace_id: 'default',
      type: 'fact',
      title: 'Alpha lane',
      body: 'mentions alpha keyword',
      tags: [],
      classification: 'public',
    });

    const secondId = memory.upsertEntry({
      workspace_id: 'default',
      type: 'fact',
      title: 'Beta lane',
      body: 'mentions beta keyword',
      tags: [],
      classification: 'public',
    });

    seedEmbedding(db, firstId, [1, 0, 0]);
    seedEmbedding(db, secondId, [0, 1, 0]);

    const hits = await search.searchVector('alpha keyword');

    expect(hits[0]?.id).toBe(firstId);

    memory.close();
  });

  it('vector search works on embeddings persisted through reindexAll', async () => {
    const { db, memory } = bootstrap();

    const provider = embeddingStub((text: string) => (text.includes('alpha') ? [1, 0, 0] : [0, 1, 0]));
    const search = new SearchService(db, provider);

    const alphaId = memory.upsertEntry({
      workspace_id: 'default',
      type: 'fact',
      title: 'Alpha lane',
      body: 'mentions alpha keyword',
      tags: [],
      classification: 'public',
    });
    memory.upsertEntry({
      workspace_id: 'default',
      type: 'fact',
      title: 'Beta lane',
      body: 'mentions beta keyword',
      tags: [],
      classification: 'public',
    });

    // Persist embeddings via the real indexing path (no manual seedEmbedding).
    await memory.reindexAll(provider);

    const hits = await search.searchVector('alpha keyword');
    expect(hits[0]?.id).toBe(alphaId);

    memory.close();
  });

  it('falls back to BM25 when vectors are unavailable', async () => {
    const { memory, search } = bootstrap();

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'snippet',
      title: 'Fallback',
      body: 'unique hybrid-token-example appears inline',
      tags: [],
      classification: 'public',
    });

    const hits = await search.searchHybrid('hybrid-token-example');

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].metadata.ranker).toBe('bm25');

    memory.close();
  });

  it('runs hybrid fusion when embeddings exist', async () => {
    const { db, memory } = bootstrap();

    const provider = embeddingStub(() => [1, 0]);

    const search = new SearchService(db, provider);

    const vectorHeavyId = memory.upsertEntry({
      workspace_id: 'default',
      type: 'mixed',
      title: 'Orthogonal title',
      body: 'body avoids textual cues',
      tags: [],
      classification: 'public',
    });

    const lexicalHeavyId = memory.upsertEntry({
      workspace_id: 'default',
      type: 'mixed',
      title: 'BM25 anchor token',
      body: 'noise',
      tags: [],
      classification: 'public',
    });

    seedEmbedding(db, vectorHeavyId, [1, 0]);
    seedEmbedding(db, lexicalHeavyId, [0, 1]);

    const hits = await search.search('BM25 anchor token', { mode: 'hybrid', limit: 10 });

    const ids = hits.map((h) => h.id);
    expect(ids).toContain(lexicalHeavyId);
    expect(ids).toContain(vectorHeavyId);
    expect(hits.every((hit) => hit.metadata.ranker === 'hybrid')).toBe(true);

    memory.close();
  });
});
