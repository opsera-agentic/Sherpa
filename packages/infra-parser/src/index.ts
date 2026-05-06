import { finalizeChunks } from './chunker.js';

export type { Chunk, ChunkMetadata } from './types.js';
export { finalizeChunks, enforceMaxLines, mergeUndersizedChunks } from './chunker.js';
export { splitMarkdownSections, type MarkdownSection } from './markdown.js';
export {
  extractTsJsSegments,
  findExclusiveBlockEnd,
  hintToChunk,
} from './languages/typescript.js';

/**
 * Parses supported languages into AST-ish chunks using regex heuristics (Tree-sitter fallback path).
 */
export function parseFile(filePath: string, content: string, language: string): import('./types.js').Chunk[] {
  const normalized = language.trim().toLowerCase();

  if (normalized !== 'javascript' && normalized !== 'typescript') {
    throw new Error(
      `Unsupported language "${language}". Sherpa's regex chunker currently handles JavaScript and TypeScript only.`,
    );
  }

  try {
    return finalizeChunks(content, filePath, normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to chunk "${filePath}" (${normalized}): ${message}`);
  }
}
