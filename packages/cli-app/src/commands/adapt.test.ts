import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runAdapt } from './adapt.js';

describe('adapt honors config.adapters.disabled', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function makeProject(configYaml: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-adapt-'));
    fs.mkdirSync(path.join(dir, '.sherpa'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.sherpa', 'conventions.md'), '# Conventions\nUse tabs.\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.sherpa', 'sherpa.config.yaml'), configYaml, 'utf8');
    return dir;
  }

  const exists = (p: string) => fs.existsSync(path.join(root!, p));

  it('skips disabled adapters on a bulk adapt', async () => {
    root = makeProject('adapters:\n  disabled:\n    - cursor\n    - windsurf\n');

    await runAdapt({ projectRoot: root, json: true });

    // Disabled → not written
    expect(exists('.cursorrules')).toBe(false);
    expect(exists('.windsurfrules')).toBe(false);
    // Enabled → written
    expect(exists('CLAUDE.md')).toBe(true);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('GEMINI.md')).toBe(true);
    expect(exists('.github/copilot-instructions.md')).toBe(true);
  });

  it('still generates an explicitly requested adapter even if disabled', async () => {
    root = makeProject('adapters:\n  disabled:\n    - cursor\n');

    await runAdapt({ projectRoot: root, agent: 'cursor', json: true });

    // Explicit --agent overrides the disabled list.
    expect(exists('.cursorrules')).toBe(true);
    // ...and only that one is generated.
    expect(exists('CLAUDE.md')).toBe(false);
  });
});
