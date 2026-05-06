import type { MemoryRepository } from '@sherpa/core-memory';
import type { SqliteDatabase } from '@sherpa/infra-sqlite';
import type { EmbeddingProvider } from '@sherpa/infra-embedding';
import { searchBM25 as executeBm25Search } from './bm25.js';
import { searchVector as executeVectorSearch } from './vector.js';
import { reciprocalRankFusion, sortIdsByScore } from './fusion.js';
import type { SearchFilters, SearchOptions, SearchResult } from './types.js';

export type { SearchFilters, SearchOptions, SearchMode, SearchResult } from './types.js';
export { reciprocalRankContribution, reciprocalRankFusion, sortIdsByScore } from './fusion.js';
export { buildFtsMatchQuery, searchBM25 as bm25Search } from './bm25.js';
export { searchVector as vectorSearch } from './vector.js';

const DEFAULT_LIMIT = 10;
const DEFAULT_OFFSET = 0;
const HYBRID_FETCH_WINDOW = 200;

function mergeResultMaps(primary: Map<string, SearchResult>, secondary: Map<string, SearchResult>): void {
  for (const [id, value] of secondary) {
    if (!primary.has(id)) {
      primary.set(id, value);
    }
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    return [];
  }
}

function snippetFromRow(title: string, body: string): string {
  const condensed = body.replace(/\s+/g, ' ').trim();
  if (!condensed.length) return title;
  return condensed.length > 220 ? `${condensed.slice(0, 217)}…` : condensed;
}

function hydrateSearchRows(
  db: SqliteDatabase,
  ids: string[],
  fusedScores: Map<string, number>,
  snippetHints?: Map<string, string>,
): SearchResult[] {
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, title, body, type, tags FROM MEMORY_ENTRIES WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: string; title: string; body: string; type: string; tags: string }>;

  const rowMap = new Map(rows.map((r) => [r.id, r]));

  return ids.map((id) => {
    const row = rowMap.get(id);
    if (!row) {
      throw new Error(`Search hydrated an unknown memory id "${id}" — index may be out of sync with storage.`);
    }

    return {
      id: row.id,
      title: row.title,
      snippet: snippetHints?.get(id) ?? snippetFromRow(row.title, row.body),
      score: fusedScores.get(id) ?? 0,
      type: row.type,
      tags: parseTags(row.tags),
      metadata: {
        ranker: 'hybrid',
        fusedScore: fusedScores.get(id),
      },
    };
  });
}

export class SearchService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly embeddingProvider?: EmbeddingProvider,
  ) {}

  searchBM25(query: string, filters?: SearchFilters): SearchResult[] {
    return executeBm25Search(this.db, query, filters, DEFAULT_LIMIT, DEFAULT_OFFSET);
  }

  async searchVector(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    return executeVectorSearch(this.db, this.embeddingProvider, query, filters, DEFAULT_LIMIT, DEFAULT_OFFSET);
  }

  async searchHybrid(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const bm25Hits = executeBm25Search(this.db, query, filters, HYBRID_FETCH_WINDOW, DEFAULT_OFFSET);
    const vectorHits = await executeVectorSearch(
      this.db,
      this.embeddingProvider,
      query,
      filters,
      HYBRID_FETCH_WINDOW,
      DEFAULT_OFFSET,
    );

    if (!vectorHits.length) {
      return executeBm25Search(this.db, query, filters, DEFAULT_LIMIT, DEFAULT_OFFSET);
    }

    const fusedScores = reciprocalRankFusion(
      [bm25Hits.map((hit) => hit.id), vectorHits.map((hit) => hit.id)],
      60,
    );

    const snippetHints = new Map<string, string>();
    for (const hit of bm25Hits) snippetHints.set(hit.id, hit.snippet);

    const merged = new Map<string, SearchResult>();
    for (const hit of bm25Hits) merged.set(hit.id, hit);
    mergeResultMaps(merged, new Map(vectorHits.map((hit) => [hit.id, hit])));

    const orderedIds = sortIdsByScore(fusedScores).filter((id) => merged.has(id));
    const slicedIds = orderedIds.slice(DEFAULT_OFFSET, DEFAULT_OFFSET + DEFAULT_LIMIT);

    return hydrateSearchRows(this.db, slicedIds, fusedScores, snippetHints);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const mode = options?.mode ?? 'bm25';
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const offset = options?.offset ?? DEFAULT_OFFSET;
    const filters = options?.filters;

    if (mode === 'bm25') {
      return executeBm25Search(this.db, query, filters, limit, offset);
    }

    if (mode === 'vector') {
      return executeVectorSearch(this.db, this.embeddingProvider, query, filters, limit, offset);
    }

    const bm25Hits = executeBm25Search(this.db, query, filters, HYBRID_FETCH_WINDOW, DEFAULT_OFFSET);
    const vectorHits = await executeVectorSearch(
      this.db,
      this.embeddingProvider,
      query,
      filters,
      HYBRID_FETCH_WINDOW,
      DEFAULT_OFFSET,
    );

    if (!vectorHits.length) {
      return executeBm25Search(this.db, query, filters, limit, offset);
    }

    const fusedScores = reciprocalRankFusion(
      [bm25Hits.map((hit) => hit.id), vectorHits.map((hit) => hit.id)],
      60,
    );

    const snippetHints = new Map<string, string>();
    for (const hit of bm25Hits) snippetHints.set(hit.id, hit.snippet);

    const merged = new Map<string, SearchResult>();
    for (const hit of bm25Hits) merged.set(hit.id, hit);
    mergeResultMaps(merged, new Map(vectorHits.map((hit) => [hit.id, hit])));

    const orderedIds = sortIdsByScore(fusedScores).filter((id) => merged.has(id));
    const slicedIds = orderedIds.slice(offset, offset + limit);

    return hydrateSearchRows(this.db, slicedIds, fusedScores, snippetHints);
  }
}

export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
  readonly type: string;
}

export interface MemorySearchOptions {
  readonly limit?: number;
  readonly mode?: 'hybrid' | 'bm25' | 'vector';
  readonly types?: string[];
  readonly tags?: string[];
}

/** Lightweight BM25 helper shared by the CLI and MCP server — vectors require {@link SearchService}. */
export function searchMemory(
  repository: MemoryRepository,
  query: string,
  options: MemorySearchOptions = {},
): SearchHit[] {
  const db = repository.getDatabase();
  const limit = options.limit ?? 25;
  const fetchWindow = Math.max(limit * 4, 64);

  const filters: SearchFilters | undefined = {
    workspace_id: 'default',
    ...(options.types?.length === 1 ? { type: options.types[0] } : {}),
    ...(options.tags?.length ? { tags: options.tags } : {}),
  };

  const hits = executeBm25Search(db, query, filters, fetchWindow, DEFAULT_OFFSET);

  let narrowed = hits;
  if (options.types && options.types.length > 1) {
    const allowed = new Set(options.types);
    narrowed = narrowed.filter((hit) => allowed.has(hit.type));
  }

  return narrowed.slice(0, limit).map((hit) => ({
    id: hit.id,
    title: hit.title,
    snippet: hit.snippet,
    score: hit.score,
    type: hit.type,
  }));
}
