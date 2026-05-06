import { describe, expect, it } from 'vitest';

import { getStarterTemplate } from './index.js';

describe('starter templates registry', () => {
  it.each(['web-app', 'library', 'cli-tool', 'monorepo'] as const)(
    'exposes non-empty conventions, config patch, and skills for %s',
    (id) => {
      const t = getStarterTemplate(id);
      expect(t.conventions.trim().length).toBeGreaterThan(40);
      expect(typeof t.config).toBe('object');
      expect(t.skills.length).toBeGreaterThanOrEqual(2);
      expect(t.skills.every((s) => s.name && s.description && s.instructions)).toBe(true);
    },
  );
});
