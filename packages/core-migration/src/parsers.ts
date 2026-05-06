import path from 'node:path';

import { splitMarkdownSections, type MarkdownSection } from '@sherpa/infra-parser';

export interface ParsedMemoryDraft {
  title: string;
  content: string;
  type: string;
}

/** Parses Claude/Gemini/Copilot markdown exports into discrete memory drafts. */
export function parseMarkdownAgentDoc(markdown: string): ParsedMemoryDraft[] {
  const sections = splitMarkdownSections(markdown);
  return sections.map((section: MarkdownSection) => ({
    title: section.heading,
    content: section.body,
    type: 'markdown-section',
  }));
}

/** Cursor `.cursorrules` files mix prose blocks — split on double newlines. */
export function parseCursorRules(contents: string): ParsedMemoryDraft[] {
  const chunks = contents
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks.map((chunk, idx) => ({
    title: `Cursor rules block ${idx + 1}`,
    content: chunk,
    type: 'cursor-rules',
  }));
}

/** Windsurf bracket sections map cleanly to memory entries. */
export function parseWindsurfRules(contents: string): ParsedMemoryDraft[] {
  const regex = /\[([^\]]+)]\s*([\s\S]*?)(?=\n\[|$)/g;
  const drafts: ParsedMemoryDraft[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(contents)) !== null) {
    drafts.push({
      title: match[1]!.trim(),
      content: match[2]!.trim(),
      type: 'windsurf-section',
    });
  }
  return drafts.length
    ? drafts
    : [{ title: 'windsurf-document', content: contents.trim(), type: 'windsurf-document' }];
}

/** Chooses parser based on originating agent id. */
export function parseAgentConfig(agent: string, contents: string): ParsedMemoryDraft[] {
  switch (agent) {
    case 'cursor':
      return parseCursorRules(contents);
    case 'windsurf':
      return parseWindsurfRules(contents);
    default:
      return parseMarkdownAgentDoc(contents);
  }
}

export function resolveAgentSourcePath(projectRoot: string, outputFile: string): string {
  return path.join(projectRoot, outputFile);
}
