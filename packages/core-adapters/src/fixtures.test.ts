import { describe, expect, it } from 'vitest';

import {
  createDefaultAdapterRegistry,
  type AdapterContext,
  type BaseAdapter,
} from './index.js';

function minimalContext(): AdapterContext {
  return {
    conventions: '',
    preferences: {},
    skills: [],
    decisions: [],
    projectName: 'minimal-proj',
    projectDescription: '',
  };
}

function richContext(): AdapterContext {
  return {
    conventions:
      'Always prefer typed APIs.\n\nDocument every public export.\n\nRun tests before merging.',
    preferences: { indent: '2 spaces', quotes: 'single' },
    skills: [
      { name: 'lint-fix', description: 'Apply eslint --fix safely.', tags: ['quality'] },
      { name: 'release-notes', description: 'Summarize commits for changelog.', tags: ['docs', 'release'] },
      { name: 'migrate-db', description: 'Generate SQL migrations.', tags: ['data'] },
    ],
    decisions: [
      'ADR-01 — SQLite for local-first storage.',
      'ADR-02 — FTS5 for lexical recall.',
      'ADR-03 — Hash-chained audit events.',
      'ADR-04 — Adapter exports stay markdown-native.',
    ],
    projectName: 'rich-monorepo-demo',
    projectDescription: 'Demonstrates rich Sherpa context shaping.',
  };
}

/** Expand conventions until this adapter's rendered markdown crosses the 64KiB soft cap (warning appended). */
function contextBreachingSoftCap(adapter: { generate: (c: AdapterContext) => { warnings: string[] } }, seed: AdapterContext): AdapterContext {
  let ctx: AdapterContext = { ...seed, conventions: seed.conventions };
  for (let i = 0; i < 800; i++) {
    const out = adapter.generate(ctx);
    if (out.warnings.some((w) => w.toLowerCase().includes('soft cap'))) {
      return ctx;
    }
    ctx = {
      ...ctx,
      conventions: `${ctx.conventions}\n\n${'█'.repeat(400)} soft-cap probe ${i}`,
    };
  }
  throw new Error(`Unable to breach adapter soft cap after expansion (${adapter.constructor?.name ?? 'adapter'})`);
}

/** Markdown-ish sanity: has headings, bracket sections, or underline headers from adapters. */
function looksLikeMarkdown(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.length) return false;
  return (
    /^#+\s/m.test(trimmed) ||
    trimmed.includes('[') ||
    /^=+\s*$/m.test(trimmed) ||
    trimmed.includes('## ')
  );
}

const REQUIRED_MARKERS: Record<string, readonly string[]> = {
  'claude-code': ['## Project Overview', '## Coding Conventions', '## Architecture Decisions', '## Available Skills'],
  cursor: ['Coding conventions:', 'Architecture decisions:', 'Available skills:'],
  'codex-cli': ['## Project Overview', '## Coding Conventions', '## Architecture Decisions', '## Available Skills'],
  'gemini-cli': ['## Project Overview', '## Coding Conventions', '## Architecture Decisions', '## Available Skills'],
  copilot: ['## Project Overview', '## Coding Conventions', '## Architecture Decisions', '## Available Skills'],
  windsurf: ['[coding-conventions]', '[architecture-decisions]', '[skills]'],
};

describe('Adapter fixtures — six bundled targets', () => {
  const registry = createDefaultAdapterRegistry();

  function exercise(adapter: BaseAdapter, ctx: AdapterContext, agentId: string, expectCapWarning: boolean): void {
    const output = adapter.generate(ctx);
    const validation = adapter.validate(output);

    expect(validation.valid, `validation errors: ${validation.errors.join('; ')}`).toBe(true);
    expect(output.filePath.length).toBeGreaterThan(0);
    expect(looksLikeMarkdown(output.content)).toBe(true);

    for (const marker of REQUIRED_MARKERS[agentId] ?? []) {
      expect(output.content, `${agentId} missing ${marker}`).toContain(marker);
    }

    const warnsAboutCap = output.warnings.some((w) => w.includes('65536') || w.toLowerCase().includes('soft cap'));
    if (expectCapWarning) {
      expect(warnsAboutCap, `${agentId} should warn when breaching soft cap`).toBe(true);
    }
  }

  for (const agentId of registry.names()) {
    const adapter = registry.get(agentId);
    if (!adapter) throw new Error(`missing adapter ${agentId}`);

    it(`${agentId} — minimal context`, () => {
      exercise(adapter, minimalContext(), agentId, false);
    });

    it(`${agentId} — rich context`, () => {
      exercise(adapter, richContext(), agentId, false);
    });

    it(`${agentId} — near soft-cap conventions`, () => {
      exercise(adapter, contextBreachingSoftCap(adapter, richContext()), agentId, true);
    });
  }
});
