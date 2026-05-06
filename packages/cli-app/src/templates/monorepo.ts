import type { StarterTemplateData } from './types.js';

export const monorepoTemplate: StarterTemplateData = {
  conventions: `# Sherpa conventions — npm workspaces monorepo

Coordinate multiple packages without letting dependency graphs sprawl unchecked.

## Workspace hygiene

- Prefer shared dev tooling at the root; scope package scripts narrowly.
- Pin critical toolchain versions; document upgrade playbooks in \`decisions/\`.

## Dependencies

- Lift duplicated runtime deps thoughtfully; avoid version skew across packages.
- Keep internal packages versioned together or via workspace protocol consistently.

## Builds & tests

- Order builds respecting package dependency DAG (build workspace predecessors first).
- Run targeted tests per changed workspace in CI when possible; keep a full-suite gate on main.`,
  config: {
    skills: {
      roots: ['.sherpa/skills'],
      autoDiscover: true,
    },
    search: {
      maxResults: 75,
    },
    embedding: {
      dimensions: 768,
    },
    audit: {
      enabled: true,
      integrityChecksOnStartup: false,
      jsonlRotation: 'monthly',
    },
  },
  skills: [
    {
      name: 'workspace-boundaries',
      description: 'Protect package boundaries inside a multi-package repo.',
      version: '1.0.0',
      tags: ['monorepo', 'architecture', 'boundaries'],
      triggers: ['workspace', 'package', 'import'],
      instructions: `When changing cross-package imports:

1. Respect layering rules documented in this repo's architecture notes.
2. Prefer explicit package exports over deep relative paths across roots.
3. Capture new coupling decisions as ADRs under \`.sherpa/decisions/\`.`,
      scripts: [],
      references: [],
      assets: [],
    },
    {
      name: 'shared-ci-cache',
      description: 'Keep CI fast with disciplined caching and selective tests.',
      version: '1.0.0',
      tags: ['ci', 'cache', 'monorepo'],
      triggers: ['pipeline', 'CI', 'cache'],
      instructions: `CI guidance:

1. Cache install artifacts keyed on lockfiles.
2. Run builds/tests scoped to affected workspaces when tooling supports it.
3. Maintain a periodic full-matrix job to catch drift.`,
      scripts: [],
      references: [],
      assets: [],
    },
  ],
};
