import yaml from 'js-yaml';

export interface ParsedSkillFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Parses SKILL.md frontmatter + body into structured fields. */
export function parseSkillFile(contents: string): ParsedSkillFile {
  const lines = contents.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return {
      frontmatter: {},
      body: contents.trim(),
    };
  }
  const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
  if (end === -1) {
    return { frontmatter: {}, body: contents.trim() };
  }
  const fmRaw = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n').trim();
  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = (yaml.load(fmRaw) as Record<string, unknown>) ?? {};
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body };
}
