import type { Chunk, ChunkMetadata } from '../types.js';

function countBraceDelta(line: string): number {
  const opens = (line.match(/{/g) ?? []).length;
  const closes = (line.match(/}/g) ?? []).length;
  return opens - closes;
}

/** Returns exclusive 0-based index immediately after the closing brace of the block starting near `startIdx`. */
export function findExclusiveBlockEnd(lines: string[], startIdx: number): number {
  let cursor = startIdx;
  while (cursor < lines.length && !lines[cursor].includes('{')) {
    cursor++;
  }

  if (cursor >= lines.length) {
    return lines.length;
  }

  let depth = 0;
  for (let i = cursor; i < lines.length; i++) {
    depth += countBraceDelta(lines[i]);
    if (depth <= 0) {
      return i + 1;
    }
  }

  return lines.length;
}

export interface TsJsSegmentHint {
  /** 1-based inclusive line number relative to the provided snippet */
  startLine: number;
  /** 1-based inclusive line number relative to the provided snippet */
  endLine: number;
  nodeType: string;
  parentHierarchy: string[];
}

const CLASS_PATTERN =
  /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(?<name>[A-Za-z0-9_$]+)/;
const FUNCTION_PATTERN =
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(?<name>[A-Za-z0-9_$]+)\s*\(/;
const DEFAULT_EXPORT_FUNCTION_PATTERN =
  /^\s*export\s+default\s+function(?:\s+(?<name>[A-Za-z0-9_$]+))?\s*\(/;
const ARROW_CONST_PATTERN =
  /^\s*(?:export\s+)?const\s+(?<name>[A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/;
const METHOD_PATTERN =
  /^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*(?!if\b|for\b|while\b|switch\b|catch\b)(?<name>[A-Za-z0-9_$]+)\s*\([^)]*\)\s*(?::[^{]+)?\{/;

function linesFromContent(content: string): string[] {
  return content.split(/\r?\n/);
}

function pushHint(
  hints: TsJsSegmentHint[],
  startIdx0: number,
  endExclusive0: number,
  nodeType: string,
  hierarchy: string[],
): void {
  hints.push({
    startLine: startIdx0 + 1,
    endLine: endExclusive0,
    nodeType,
    parentHierarchy: hierarchy,
  });
}

function extractClassBodyHints(lines: string[], classStart0: number, classExclusiveEnd0: number, className: string): TsJsSegmentHint[] {
  const hints: TsJsSegmentHint[] = [];
  let cursor = classStart0 + 1;

  while (cursor < classExclusiveEnd0) {
    const line = lines[cursor];
    const match = line.match(METHOD_PATTERN);
    if (match?.groups?.name) {
      const methodEnd = findExclusiveBlockEnd(lines, cursor);
      pushHint(hints, cursor, methodEnd, 'method', [className]);
      cursor = methodEnd;
      continue;
    }

    cursor++;
  }

  return hints;
}

/**
 * Regex-guided segmentation for TypeScript/JavaScript without Tree-sitter bindings.
 */
export function extractTsJsSegments(content: string, language: 'typescript' | 'javascript'): TsJsSegmentHint[] {
  const lines = linesFromContent(content);
  const hints: TsJsSegmentHint[] = [];

  for (let idx = 0; idx < lines.length; ) {
    const line = lines[idx];

    const classMatch = line.match(CLASS_PATTERN);
    if (classMatch?.groups?.name) {
      const className = classMatch.groups.name;
      const endExclusive = findExclusiveBlockEnd(lines, idx);
      const inner = extractClassBodyHints(lines, idx, endExclusive, className);

      if (inner.length) {
        hints.push(...inner);
      } else {
        pushHint(hints, idx, endExclusive, 'class', []);
      }

      idx = endExclusive;
      continue;
    }

    const funcMatch = line.match(FUNCTION_PATTERN) ?? line.match(DEFAULT_EXPORT_FUNCTION_PATTERN);
    if (funcMatch) {
      const endExclusive = findExclusiveBlockEnd(lines, idx);
      pushHint(hints, idx, endExclusive, 'function', []);
      idx = endExclusive;
      continue;
    }

    const arrowMatch = line.match(ARROW_CONST_PATTERN);
    if (arrowMatch?.groups?.name) {
      const endExclusive = findExclusiveBlockEnd(lines, idx);
      pushHint(hints, idx, endExclusive, 'arrow_function', []);
      idx = endExclusive;
      continue;
    }

    idx++;
  }

  if (!hints.length && lines.length) {
    pushHint(hints, 0, lines.length, 'module', []);
  }

  void language;
  return hints;
}

export function sliceLines(lines: string[], startLine1: number, endLine1: number): string {
  const slice = lines.slice(startLine1 - 1, endLine1);
  return slice.join('\n');
}

export function hintToChunk(
  hint: TsJsSegmentHint,
  lines: string[],
  filePath: string,
  language: string,
): Chunk {
  const metadata: ChunkMetadata = {
    file_path: filePath,
    language,
    node_type: hint.nodeType,
    parent_hierarchy: hint.parentHierarchy,
    start_line: hint.startLine,
    end_line: hint.endLine,
  };

  return {
    content: sliceLines(lines, hint.startLine, hint.endLine),
    metadata,
  };
}
