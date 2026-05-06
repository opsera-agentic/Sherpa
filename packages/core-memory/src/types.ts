export type MemoryClassification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface MemoryEntry {
  id: string;
  workspace_id: string;
  type: string;
  title: string;
  body: string;
  tags: string[];
  classification: MemoryClassification;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CreateEntryInput {
  /** When omitted a new UUID is minted; when supplied rows upsert on `MEMORY_ENTRIES.id`. */
  id?: string;
  /** Defaults to the bundled `default` workspace for single-tenant flows. */
  workspace_id?: string;
  type: string;
  title: string;
  /** Primary prose payload — falls back to {@link CreateEntryInput.content}. */
  body?: string;
  /** MCP synonym for `body`. At least one of `body` or `content` must be provided. */
  content?: string;
  tags?: string[];
  classification?: MemoryClassification;
}

export interface ListFilters {
  workspace_id?: string;
  type?: string;
  tags?: string[];
  classification?: MemoryClassification;
  dateRange?: { from?: string; to?: string };
}
