import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ClaudeCodeAdapter,
  CopilotAdapter,
  CursorAdapter,
  createDefaultAdapterRegistry,
  type AdapterContext,
} from './index.js';

let tmp: string | undefined;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  tmp = undefined;
});

const minimalContext: AdapterContext = {
  conventions: 'Use TypeScript strict mode.',
  preferences: {},
  skills: [],
  decisions: [],
  projectName: 'demo',
  projectDescription: 'Demo project',
};

const richContext: AdapterContext = {
  conventions: 'ESM only, vitest for tests.',
  preferences: { timezone: 'UTC' },
  skills: [
    { name: 'lint', description: 'Run eslint', tags: ['quality'] },
    { name: 'test', description: 'Run vitest', tags: ['ci'] },
  ],
  decisions: ['Prefer commander for CLI parsing'],
  projectName: 'sherpa',
  projectDescription: 'Portable AI context toolkit',
};

describe('core-adapters', () => {
  it('registers all adapters by default', () => {
    const registry = createDefaultAdapterRegistry();
    expect(registry.names()).toHaveLength(6);
    expect(registry.list().map((m) => m.name)).toEqual(
      expect.arrayContaining(['claude-code', 'cursor', 'codex-cli', 'gemini-cli', 'copilot', 'windsurf']),
    );
  });

  it.each([
    ['claude-code', ClaudeCodeAdapter],
    ['cursor', CursorAdapter],
    ['copilot', CopilotAdapter],
  ])('generates minimal output for %s', (_name, AdapterCtor) => {
    const adapter = new AdapterCtor();
    const output = adapter.generate(minimalContext);
    expect(output.content.length).toBeGreaterThan(20);
    expect(output.filePath).toBeTruthy();
    const validation = adapter.validate(output);
    expect(validation.valid).toBe(true);
  });

  it('includes rich context sections', () => {
    const adapter = new ClaudeCodeAdapter();
    const output = adapter.generate(richContext);
    expect(output.content).toContain('Available Skills');
    expect(output.content).toContain('Architecture Decisions');
    expect(output.content).toContain('lint');
  });

  it('warns when soft cap exceeded', () => {
    const adapter = new CursorAdapter();
    const huge = 'x'.repeat(70_000);
    const output = adapter.generate({ ...minimalContext, conventions: huge });
    expect(output.warnings.some((w) => w.includes('soft cap'))).toBe(true);
  });

  it('writes adapters to temp files for smoke test', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-adapters-'));
    const registry = createDefaultAdapterRegistry();
    for (const name of registry.names()) {
      const adapter = registry.get(name)!;
      const output = adapter.generate(richContext);
      const target = path.join(tmp, output.filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, output.content, 'utf8');
      expect(fs.statSync(target).size).toBeGreaterThan(0);
    }
  });
});
