import type { Chunk } from './types.js';
import { extractTsJsSegments, hintToChunk } from './languages/typescript.js';

const DEFAULT_MAX_LINES = 80;
const DEFAULT_MIN_LINES = 5;

function lineSpan(chunk: Chunk): number {
  return chunk.metadata.end_line - chunk.metadata.start_line + 1;
}

function shiftHintLines(chunk: Chunk, hints: ReturnType<typeof extractTsJsSegments>): ReturnType<typeof extractTsJsSegments> {
  const offset = chunk.metadata.start_line - 1;
  return hints.map((hint) => ({
    ...hint,
    startLine: hint.startLine + offset,
    endLine: hint.endLine + offset,
  }));
}

function splitEvenFallback(chunk: Chunk, lines: string[]): Chunk[] {
  const mid = Math.floor((chunk.metadata.start_line + chunk.metadata.end_line) / 2);
  const firstEnd = mid;
  const secondStart = Math.min(mid + 1, chunk.metadata.end_line);

  const first = hintToChunk(
    {
      startLine: chunk.metadata.start_line,
      endLine: firstEnd,
      nodeType: `${chunk.metadata.node_type}_fragment`,
      parentHierarchy: chunk.metadata.parent_hierarchy,
    },
    lines,
    chunk.metadata.file_path,
    chunk.metadata.language,
  );

  const second = hintToChunk(
    {
      startLine: secondStart,
      endLine: chunk.metadata.end_line,
      nodeType: `${chunk.metadata.node_type}_fragment`,
      parentHierarchy: chunk.metadata.parent_hierarchy,
    },
    lines,
    chunk.metadata.file_path,
    chunk.metadata.language,
  );

  return [first, second].filter((part) => part.metadata.start_line <= part.metadata.end_line);
}

/**
 * Recursively splits chunks whose span exceeds `maxLines`, preferring nested regex boundaries.
 */
export function enforceMaxLines(chunk: Chunk, lines: string[], maxLines = DEFAULT_MAX_LINES, language: string): Chunk[] {
  if (lineSpan(chunk) <= maxLines) {
    return [chunk];
  }

  const langKey = language === 'typescript' ? 'typescript' : 'javascript';
  const nested = extractTsJsSegments(chunk.content, langKey);

  const usable =
    nested.length > 1 || (nested.length === 1 && nested[0].nodeType !== 'module')
      ? nested
      : [];

  if (!usable.length) {
    const halves = splitEvenFallback(chunk, lines);
    return halves.flatMap((half) => enforceMaxLines(half, lines, maxLines, language));
  }

  const shifted = shiftHintLines(chunk, usable);
  const subdivided = shifted.map((hint) => hintToChunk(hint, lines, chunk.metadata.file_path, chunk.metadata.language));

  return subdivided.flatMap((piece) => enforceMaxLines(piece, lines, maxLines, language));
}

function mergeTwo(a: Chunk, b: Chunk): Chunk {
  const mergedContent = `${a.content}\n${b.content}`;
  return {
    content: mergedContent,
    metadata: {
      ...a.metadata,
      end_line: b.metadata.end_line,
      node_type:
        a.metadata.node_type === b.metadata.node_type
          ? a.metadata.node_type
          : `${a.metadata.node_type}+${b.metadata.node_type}`,
      parent_hierarchy:
        a.metadata.parent_hierarchy.join('/') === b.metadata.parent_hierarchy.join('/')
          ? a.metadata.parent_hierarchy
          : [...a.metadata.parent_hierarchy, ...b.metadata.parent_hierarchy],
    },
  };
}

/** Merges adjacent chunks smaller than `minLines` to avoid overly granular snippets. */
export function mergeUndersizedChunks(chunks: Chunk[], minLines = DEFAULT_MIN_LINES): Chunk[] {
  if (!chunks.length) return [];

  const sorted = [...chunks].sort((a, b) => a.metadata.start_line - b.metadata.start_line);
  const merged: Chunk[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const span = lineSpan(current);

    if (span < minLines) {
      current = mergeTwo(current, next);
      continue;
    }

    merged.push(current);
    current = next;
  }

  if (lineSpan(current) < minLines && merged.length) {
    merged[merged.length - 1] = mergeTwo(merged[merged.length - 1], current);
  } else {
    merged.push(current);
  }

  return merged;
}

export function finalizeChunks(content: string, filePath: string, language: string): Chunk[] {
  const lines = content.split(/\r?\n/);
  const langKey = language === 'typescript' ? 'typescript' : 'javascript';
  const hints = extractTsJsSegments(content, langKey);
  const base = hints.map((hint) => hintToChunk(hint, lines, filePath, language));
  const resized = base.flatMap((chunk) => enforceMaxLines(chunk, lines, DEFAULT_MAX_LINES, language));
  return mergeUndersizedChunks(resized, DEFAULT_MIN_LINES);
}
