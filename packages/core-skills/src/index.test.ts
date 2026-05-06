import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getSkill,
  importSkill,
  listSkills,
  loadSkills,
  parseSkillFile,
  validateSkill,
} from './index.js';

let tmp: string | undefined;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  tmp = undefined;
});

describe('core-skills', () => {
  it('parses YAML frontmatter', () => {
    const md = `---
name: demo
description: A demo skill
version: "2.0.0"
tags: [lint]
triggers:
  - /demo
scripts:
  - bin/run.sh
references:
  - ./README.md
assets:
  - ./templates/main.tpl
---
# Instructions

Do the thing.
`;
    const parsed = parseSkillFile(md);
    expect(parsed.frontmatter.name).toBe('demo');
    expect(parsed.body).toContain('Do the thing.');
  });

  it('loads skills from sherpa directory', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-skills-'));
    const skillDir = path.join(tmp, 'skills', 'demo');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: demo
description: Demo skill
version: "1.0.0"
tags: [a]
triggers: ["/demo"]
---
Hello`,
      'utf8',
    );
    const skills = loadSkills(tmp);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('demo');
    expect(listSkills(tmp)[0]!.description).toBe('Demo skill');
    expect(getSkill(tmp, 'demo')?.instructions).toContain('Hello');
  });

  it('validates required frontmatter', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-skills-'));
    const skillDir = path.join(tmp, 'bad');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: x\n---\nbody', 'utf8');
    const res = validateSkill(skillDir);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('description');
  });

  it('imports skill after validation', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-import-'));
    const src = path.join(tmp, 'source-skill');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'SKILL.md'),
      `---
name: imported
description: ok
version: "1.0.0"
tags: []
triggers: []
---
`,
      'utf8',
    );
    const destSherpa = path.join(tmp, 'dest', '.sherpa');
    fs.mkdirSync(destSherpa, { recursive: true });
    importSkill(src, destSherpa);
    expect(loadSkills(destSherpa)).toHaveLength(1);
  });
});
