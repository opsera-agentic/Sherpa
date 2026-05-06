import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getDefaultConfig,
  loadConfig,
  mergeWithDefaults,
  validateConfig,
} from './index.js';

describe('core-config', () => {
  it('getDefaultConfig uses bm25, tfidf, adapters enabled', () => {
    const cfg = getDefaultConfig();
    expect(cfg.search.provider).toBe('bm25');
    expect(cfg.embedding.provider).toBe('tfidf');
    expect(cfg.adapters.git.enabled).toBe(true);
    expect(cfg.adapters.filesystem.enabled).toBe(true);
  });

  it('mergeWithDefaults fills gaps', () => {
    const merged = mergeWithDefaults({ search: { provider: 'hybrid' } });
    expect(merged.search.provider).toBe('hybrid');
    expect(merged.embedding.provider).toBe('tfidf');
  });

  it('validateConfig rejects malformed configs', () => {
    const res = validateConfig({ adapters: 'oops' });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.path === 'adapters')).toBe(true);
  });

  it('validateConfig accepts default-shaped objects', () => {
    const res = validateConfig(getDefaultConfig());
    expect(res.ok).toBe(true);
  });

  it('loadConfig reads YAML from project folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'sherpa-core-config-'));
    mkdirSync(join(root, '.sherpa'), { recursive: true });
    writeFileSync(
      join(root, '.sherpa', 'sherpa.config.yaml'),
      [
        'search:',
        '  provider: hybrid',
        'embedding:',
        '  provider: openai',
        'adapters:',
        '  git:',
        '    enabled: false',
        '',
      ].join('\n'),
    );

    const cfg = loadConfig(root);
    expect(cfg.search.provider).toBe('hybrid');
    expect(cfg.embedding.provider).toBe('openai');
    expect(cfg.adapters.git.enabled).toBe(false);
    expect(cfg.adapters.filesystem.enabled).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('loadConfig throws with actionable validation errors', () => {
    const root = mkdtempSync(join(tmpdir(), 'sherpa-core-config-invalid-'));
    mkdirSync(join(root, '.sherpa'), { recursive: true });
    writeFileSync(join(root, '.sherpa', 'sherpa.config.yaml'), 'adapters: not-an-object\n');

    expect(() => loadConfig(root)).toThrow(/Invalid Sherpa configuration/);
    rmSync(root, { recursive: true, force: true });
  });

  it('loadConfig falls back when file missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'sherpa-core-config-missing-'));
    mkdirSync(root, { recursive: true });
    expect(loadConfig(root)).toEqual(getDefaultConfig());
    rmSync(root, { recursive: true, force: true });
  });
});
