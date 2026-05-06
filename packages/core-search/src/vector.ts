import type { SqliteDatabase } from '@sherpa/infra-sqlite';
import { MemoryChunkRepository } from '@sherpa/infra-sqlite';

import type { EmbeddingProvider } from '@sherpa/infra-embedding';
import type { SearchFilters, SearchResult } from './types.js';

function blobToFloat32(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosineSimilarityInline(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
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

function matchesAllTags(entryTags: string[], required?: string[]): boolean {
  if (!required?.length) return true;
  const have = new Set(entryTags);
  return required.every((t) => have.has(t));
}

function entrySnippet(title: string, body: string): string {
  const condensed = body.replace(/\s+/g, ' ').trim();
  if (!condensed.length) return title;
  return condensed.length > 200 ? `${condensed.slice(0, 197)}…` : condensed;
}

function sqlWhere(filters: SearchFilters | undefined): { clause: string; params: Record<string, unknown> } {
  const clauses: string[] = [`e.archived_at IS NULL`, `LENGTH(c.embedding) = @embedding_bytes`];
  const params: Record<string, unknown> = {};

  if (!filters) {
    return { clause: clauses.join(' AND '), params };
  }

  if (filters.workspace_id) {
    clauses.push(`e.workspace_id = @workspace_id`);
    params.workspace_id = filters.workspace_id;
  }
  if (filters.type) {
    clauses.push(`e.type = @type`);
    params.type = filters.type;
  }
  if (filters.classification) {
    clauses.push(`e.classification = @classification`);
    params.classification = filters.classification;
  }
  if (filters.dateRange?.from) {
    const fromMs = Date.parse(filters.dateRange.from);
    if (!Number.isNaN(fromMs)) {
      clauses.push(`e.created_at >= @from`);
      params.from = fromMs;
    }
  }
  if (filters.dateRange?.to) {
    const toMs = Date.parse(filters.dateRange.to);
    if (!Number.isNaN(toMs)) {
      clauses.push(`e.created_at <= @to`);
      params.to = toMs;
    }
  }

  return { clause: clauses.join(' AND '), params };
}

function maxScoreByEntry(
  scored: Array<{ id: string; title: string; body: string; type: string; tags: string; score: number }>,
): typeof scored {
  const best = new Map<string, (typeof scored)[0]>();
  for (const row of scored) {
    const prev = best.get(row.id);
    if (!prev || row.score > prev.score) {
      best.set(row.id, row);
    }
  }
  return [...best.values()];
}

/**
 * Cosine similarity executed in-process against {@link MEMORY_CHUNKS.embedding} blobs.
 */
export async function searchVector(
  db: SqliteDatabase,
  embeddingProvider: EmbeddingProvider | undefined,
  query: string,
  filters: SearchFilters | undefined,
  limit: number,
  offset: number,
): Promise<SearchResult[]> {
  if (!embeddingProvider) {
    return [];
  }

  let queryVecRaw: number[];
  try {
    const embedded = Promise.resolve(embeddingProvider.embed(query));
    queryVecRaw = [...(await embedded)];
  } catch {
    return [];
  }

  const queryVec = new Float32Array(queryVecRaw);
  const embedding_bytes = queryVec.length * 4;
  const { clause, params } = sqlWhere(filters);
  const repo = new MemoryChunkRepository(db);
  const rows = repo.listEmbeddingRows(clause, {
    ...params,
    embedding_bytes,
  });

  const scored = rows
    .map((row) => {
      const vec = blobToFloat32(row.embedding);
      const score = cosineSimilarityInline(queryVec, vec);
      return { row, score };
    })
    .filter((item) =>
      filters?.tags?.length ? matchesAllTags(parseTags(item.row.tags), filters.tags) : true,
    );

  const collapsed = maxScoreByEntry(
    scored.map(({ row, score }) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      tags: row.tags,
      score,
    })),
  )
    .sort((a, b) => b.score - a.score)
    .slice(offset, offset + limit);

  return collapsed.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: entrySnippet(row.title, row.body),
    score: row.score,
    type: row.type,
    tags: parseTags(row.tags),
    metadata: {
      ranker: 'vector',
      dims: queryVec.length,
    },
  }));
}
