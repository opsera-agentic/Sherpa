import { describe, expect, it } from 'vitest';

import { contextFromSectionDoc, createDefaultAdapterRegistry, type AdapterContext } from './index.js';

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

describe('Adapter round-trip — generate ∘ parse is idempotent', () => {
  const registry = createDefaultAdapterRegistry();
  const fixtures: Array<[label: string, ctx: () => AdapterContext]> = [
    ['minimal context', minimalContext],
    ['rich context', richContext],
  ];

  for (const agentId of registry.names()) {
    const adapter = registry.get(agentId);
    if (!adapter) throw new Error(`missing adapter ${agentId}`);

    for (const [label, makeCtx] of fixtures) {
      it(`${agentId} — ${label} re-renders identically after parse`, () => {
        const first = adapter.generate(makeCtx()).content;
        const parsed = adapter.parse(first);
        const second = adapter.generate(contextFromSectionDoc(parsed)).content;
        expect(second, 'second render should byte-equal the first').toBe(first);
      });
    }

    it(`${agentId} — parsed rich doc preserves projectName when adapter renders it`, () => {
      const ctx = richContext();
      const out = adapter.generate(ctx).content;
      const doc = adapter.parse(out);
      // Copilot is the only adapter that does not render projectName; everyone else must round-trip it.
      if (agentId !== 'copilot') {
        expect(doc.projectName).toBe(ctx.projectName);
      }
    });

    it(`${agentId} — parsed rich doc recovers conventions verbatim`, () => {
      const ctx = richContext();
      const out = adapter.generate(ctx).content;
      const doc = adapter.parse(out);
      expect(doc.conventions).toBe(ctx.conventions);
    });

    it(`${agentId} — parsed rich doc recovers decision count and content`, () => {
      const ctx = richContext();
      const out = adapter.generate(ctx).content;
      const doc = adapter.parse(out);
      expect(doc.decisions).toEqual(ctx.decisions);
    });

    it(`${agentId} — parsed minimal doc treats placeholders as empty`, () => {
      const out = adapter.generate(minimalContext()).content;
      const doc = adapter.parse(out);
      expect(doc.conventions).toBe('');
      expect(doc.decisions).toEqual([]);
      expect(doc.skills).toEqual([]);
    });
  }
});
