import type { Skill } from '@sherpa/core-skills';

/** YAML-safe quoting for simple scalar strings in SKILL.md frontmatter. */
function yamlScalar(value: string): string {
  if (value === '') return '""';
  if (/[\n:#\-?[\]{},&*!|>'"%@`]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlStringArray(key: string, items: string[]): string[] {
  if (items.length === 0) return [`${key}: []`];
  return [`${key}:`, ...items.map((item) => `  - ${yamlScalar(item)}`)];
}

/** Serializes a structured skill to the SKILL.md on-disk format (YAML frontmatter + body). */
export function skillToMarkdown(skill: Skill): string {
  const fm: string[] = ['---'];
  fm.push(`name: ${yamlScalar(skill.name)}`);
  fm.push(`description: ${yamlScalar(skill.description)}`);
  fm.push(`version: ${yamlScalar(skill.version)}`);
  fm.push(...yamlStringArray('tags', skill.tags));
  fm.push(...yamlStringArray('triggers', skill.triggers));
  fm.push(...yamlStringArray('scripts', skill.scripts));
  fm.push(...yamlStringArray('references', skill.references));
  fm.push(...yamlStringArray('assets', skill.assets));
  fm.push('---');
  fm.push('');
  fm.push(skill.instructions.trim());
  fm.push('');
  return fm.join('\n');
}
