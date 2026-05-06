import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { MemoryRepository } from '@sherpa/core-memory';

import { SearchService } from './index.js';

const LOREM_VARIANTS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
  'Excepteur sint occaecat cupidatat non proident sunt in culpa.',
];

describe('Search performance & hybrid fallback', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('BM25 search over 100 entries completes quickly and returns ranked hits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sherpa-search-bench-'));
    dirs.push(root);

    const dbPath = join(root, 'memory.sqlite');
    const memory = new MemoryRepository(dbPath);

    const spotlight = 'BENCHMARK_SPOTLIGHT_TOKEN_XY42';

    for (let i = 0; i < 100; i++) {
      const variant = LOREM_VARIANTS[i % LOREM_VARIANTS.length]!;
      memory.upsertEntry({
        workspace_id: 'default',
        type: 'benchmark-note',
        title: `entry-${i}`,
        body:
          i === 42
            ? `${variant}\n\n${spotlight} critical routing guidance.\n\nExtra paragraph for chunking.`
            : `${variant}\n\nParagraph ${i} filler.\n\nAnother block.`,
        tags: ['bench'],
        classification: 'internal',
      });
    }

    const db = memory.getDatabase();
    const service = new SearchService(db);

    const started = Date.now();
    const hits = await service.search(spotlight, { mode: 'bm25', limit: 10 });
    const elapsed = Date.now() - started;

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.snippet ?? hits[0]?.title).toContain('critical');

    expect(elapsed).toBeLessThan(8000);

    memory.close();
  });

  it('hybrid mode without embeddings falls back to BM25 and still finds seeded phrases', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sherpa-search-hybrid-'));
    dirs.push(root);

    const dbPath = join(root, 'memory.sqlite');
    const memory = new MemoryRepository(dbPath);

    memory.upsertEntry({
      workspace_id: 'default',
      type: 'guide',
      title: 'alpha',
      body: 'General onboarding notes.',
      tags: [],
      classification: 'internal',
    });
    memory.upsertEntry({
      workspace_id: 'default',
      type: 'guide',
      title: 'beta',
      body: 'HYBRID_FALLBACK_UNIQUE_MARKER describing fallback behaviour.',
      tags: [],
      classification: 'internal',
    });

    const svc = new SearchService(memory.getDatabase());
    const hybrid = await svc.searchHybrid('HYBRID_FALLBACK_UNIQUE_MARKER');
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid.some((h) => h.snippet.includes('HYBRID_FALLBACK_UNIQUE_MARKER') || h.title === 'beta')).toBe(
      true,
    );

    memory.close();
  });
});
