export interface ChunkMetadata {
  file_path: string;
  language: string;
  node_type: string;
  parent_hierarchy: string[];
  start_line: number;
  end_line: number;
}

export interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}
