import type { SqliteDatabase } from '@sherpa/infra-sqlite';
import { MemoryChunkRepository } from '@sherpa/infra-sqlite';

import type { SearchFilters, SearchResult } from './types.js';

function escapeFtsToken(term: string): string {
  const escaped = term.replace(/"/g, '""');
  return `"${escaped}"`;
}

/** Token AND semantics suitable for FTS5 MATCH queries. */
export function buildFtsMatchQuery(userQuery: string): string {
  const trimmed = userQuery.trim();
  if (!trimmed) {
    throw new Error('BM25 search requires a non-empty query string.');
  }

  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  return tokens.map(escapeFtsToken).join(' AND ');
}

function sqlFilterClause(filters: SearchFilters | undefined): {
  clause: string;
  params: Record<string, unknown>;
} {
  const clauses: string[] = [`e.archived_at IS NULL`];
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

/**
 * BM25-ranked FTS5 search over {@link memory_chunks_fts}, joining live rows for filters/snippets.
 */
export function searchBM25(
  db: SqliteDatabase,
  query: string,
  filters: SearchFilters | undefined,
  limit: number,
  offset: number,
): SearchResult[] {
  const ftsQuery = buildFtsMatchQuery(query);
  const { clause, params } = sqlFilterClause(filters);
  const repo = new MemoryChunkRepository(db);
  const rows = repo.searchFts(ftsQuery, clause, params, limit, offset);

  const filtered = filters?.tags?.length
    ? rows.filter((r) => matchesAllTags(parseTags(r.tags), filters.tags))
    : rows;

  return filtered.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: row.body_snippet?.trim().length ? row.body_snippet : row.title,
    score: -Number(row.bm25_score),
    type: row.type,
    tags: parseTags(row.tags),
    metadata: {
      ranker: 'bm25',
      bm25: Number(row.bm25_score),
    },
  }));
}
