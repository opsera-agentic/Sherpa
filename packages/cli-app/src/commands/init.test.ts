import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSherpaConfig } from '@sherpa/core-config';
import { loadSkills } from '@sherpa/core-skills';

import { runInit } from './init.js';

describe('runInit', () => {
  it('materializes starter template skills and merged config', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-init-'));
    await runInit({
      projectRoot: tmp,
      force: false,
      template: 'cli-tool',
      verbose: false,
      json: true,
    });

    const sherpaDir = path.join(tmp, '.sherpa');
    expect(fs.existsSync(path.join(sherpaDir, 'conventions.md'))).toBe(true);
    expect(fs.readFileSync(path.join(sherpaDir, 'conventions.md'), 'utf8')).toContain('CLI tool');

    const skills = loadSkills(sherpaDir);
    expect(skills.map((s) => s.name).sort()).toEqual(['cli-exit-codes', 'cli-help-ergonomics']);

    const cfg = loadSherpaConfig(tmp);
    expect(cfg.adapters.ide.enabled).toBe(false);
    expect(cfg.adapters.terminal.enabled).toBe(true);
    expect(cfg.audit.jsonlRotation).toBe('daily');
  });

  it('refuses to clobber without --force', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-init-dup-'));
    await runInit({ projectRoot: tmp, force: false, template: 'library', verbose: false, json: true });
    await expect(
      runInit({ projectRoot: tmp, force: false, template: 'library', verbose: false, json: true }),
    ).rejects.toThrow(/already initialized/);
  });
});
