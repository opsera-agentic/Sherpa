import { describe, expect, it } from 'vitest';
import { parseSkillFile } from '@sherpa/core-skills';

import { skillToMarkdown } from './skill-markdown.js';

describe('skill-markdown', () => {
  it('round-trips through parseSkillFile', () => {
    const md = skillToMarkdown({
      name: 'demo-skill',
      description: 'Demonstrates serialization',
      version: '2.1.0',
      tags: ['a', 'b:c'],
      triggers: ['run demo'],
      instructions: 'Body line one\n\nBody line two',
      scripts: ['npm test'],
      references: [],
      assets: [],
    });
    const parsed = parseSkillFile(md);
    expect(parsed.frontmatter.name).toBe('demo-skill');
    expect(parsed.frontmatter.description).toBe('Demonstrates serialization');
    expect(parsed.frontmatter.version).toBe('2.1.0');
    expect(parsed.frontmatter.tags).toEqual(['a', 'b:c']);
    expect(parsed.body).toContain('Body line one');
  });

  it('handles empty optional arrays', () => {
    const md = skillToMarkdown({
      name: 'empty',
      description: 'x',
      version: '1.0.0',
      tags: [],
      triggers: [],
      instructions: 'noop',
      scripts: [],
      references: [],
      assets: [],
    });
    expect(md).toContain('tags: []');
    expect(parseSkillFile(md).frontmatter.name).toBe('empty');
  });
});
