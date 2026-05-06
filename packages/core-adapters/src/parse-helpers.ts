/**
 * Shared parsing primitives used by adapter `parse()` implementations. The goal
 * of these helpers is reverse-engineering the deterministic output produced by
 * `generate()` — they are not general-purpose markdown parsers.
 */

/** A parsed section keyed by its heading text. */
export type SectionMap = Map<string, string>;

/** Strip the `=`-rule banner produced by `BaseAdapter.formatHeader`. */
export function stripFormatHeader(content: string): { title: string; rest: string } {
  const lines = content.split(/\r?\n/);
  let i = 0;

  while (i < lines.length && lines[i]?.trim() === '') i++;

  if (i + 2 < lines.length && isRuleLine(lines[i]) && isRuleLine(lines[i + 2])) {
    const title = (lines[i + 1] ?? '').trim();
    return { title, rest: lines.slice(i + 3).join('\n').replace(/^\n+/, '') };
  }

  return { title: '', rest: content };
}

function isRuleLine(line: string | undefined): boolean {
  return !!line && /^=+\s*$/.test(line);
}

/**
 * Split a markdown body on `## Heading` lines. The order of insertion in the
 * returned map matches the order of headings in the source.
 */
export function splitH2Sections(content: string): SectionMap {
  const map: SectionMap = new Map();
  const lines = content.split(/\r?\n/);
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      map.set(currentHeading, buffer.join('\n').trim());
    }
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.*?)\s*$/);
    if (match) {
      flush();
      currentHeading = match[1] ?? '';
      buffer = [];
    } else if (currentHeading !== null) {
      buffer.push(line);
    }
  }

  flush();
  return map;
}

const CONVENTIONS_PLACEHOLDERS = new Set([
  '(none documented yet)',
  '(none)',
  'none',
  '_(none)_',
  '_Pending sync from Sherpa._',
  '_Define conventions in Sherpa and run `sherpa sync`._',
]);

/** Treat the documented "no conventions yet" placeholders as empty. */
export function normalizeConventionsBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (CONVENTIONS_PLACEHOLDERS.has(trimmed)) return '';
  return trimmed;
}

const DECISION_EMPTY_BULLETS = new Set([
  '- _None recorded yet._',
  '- _None yet._',
  '- _(none)_',
]);

/**
 * Parse a bullet list of decisions. Each line beginning with `- ` is treated as
 * the start of a new decision; the body extends until the next bullet or EOF
 * (so multi-line decisions survive the round-trip).
 */
export function parseDecisionList(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (DECISION_EMPTY_BULLETS.has(trimmed)) return [];

  const lines = trimmed.split(/\r?\n/);
  const decisions: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const match = line.match(/^- (.*)$/);
    if (match) {
      if (current) decisions.push(current.join('\n').trim());
      current = [match[1] ?? ''];
    } else if (current) {
      current.push(line);
    }
  }

  if (current) decisions.push(current.join('\n').trim());
  return decisions.filter((d) => d.length > 0);
}

const SKILLS_EMPTY_PLACEHOLDERS = new Set([
  '_No skills published yet._',
  '_No skills available._',
  '_No skills yet._',
  '_(none)_',
  '(none)',
]);

export function isSkillsEmptyPlaceholder(body: string): boolean {
  return SKILLS_EMPTY_PLACEHOLDERS.has(body.trim());
}
