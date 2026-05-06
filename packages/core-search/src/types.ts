import type { MemoryClassification } from '@sherpa/core-memory';

export interface SearchFilters {
  workspace_id?: string;
  type?: string;
  tags?: string[];
  dateRange?: { from?: string; to?: string };
  classification?: MemoryClassification;
}

export type SearchMode = 'bm25' | 'vector' | 'hybrid';

export interface SearchOptions {
  mode?: SearchMode;
  /** Maximum hits to return (default 10). */
  limit?: number;
  /** Offset into the merged ranked list (default 0). */
  offset?: number;
  filters?: SearchFilters;
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  type: string;
  tags: string[];
  metadata: Record<string, unknown>;
}
