import type { StarterTemplateData } from './types.js';

export const webAppTemplate: StarterTemplateData = {
  conventions: `# Sherpa conventions — web application

This template emphasizes resilient UI layers, explicit API contracts, and fast feedback from automated tests.

## Frontend (React / Vue / Svelte)

- Prefer composition over inheritance; colocate tests next to components when practical.
- Define loading, empty, and error states explicitly; avoid silent failures in data fetching.
- Meet baseline accessibility (labels, focus order, keyboard paths) before merging UI changes.

## Backend / API

- Version REST surfaces thoughtfully; document breaking changes in \`decisions/\`.
- Validate inputs at boundaries; return actionable error payloads (machine-readable codes where helpful).
- Keep secrets out of repo configuration — use environment injection only.

## Testing

- Cover critical user journeys with integration or e2e smoke tests where feasible.
- Mock external HTTP at stable seams; record fixtures when replay improves determinism.
`,
  config: {
    adapters: {
      http: { enabled: true },
      filesystem: { enabled: true },
      git: { enabled: true },
      ide: { enabled: true },
      terminal: { enabled: true },
    },
    search: {
      maxResults: 40,
    },
    audit: {
      enabled: true,
      integrityChecksOnStartup: false,
    },
  },
  skills: [
    {
      name: 'web-ui-accessibility',
      description: 'Checklist for interactive UI states and accessibility seams.',
      version: '1.0.0',
      tags: ['web', 'frontend', 'a11y'],
      triggers: ['component', 'accessibility', 'UI'],
      instructions: `Before shipping interactive UI:

1. Confirm focus management for dialogs, drawers, and routed views.
2. Verify visible labels and programmatic names for inputs.
3. Exercise keyboard-only paths for primary workflows.
4. Capture regressions with at least one automated test touching the changed surface.`,
      scripts: [],
      references: [],
      assets: [],
    },
    {
      name: 'api-contract-hygiene',
      description: 'Keep HTTP APIs predictable with schemas and stable error shapes.',
      version: '1.0.0',
      tags: ['api', 'backend', 'rest'],
      triggers: ['endpoint', 'REST', 'API'],
      instructions: `When designing or changing HTTP handlers:

1. Declare request/response schemas (OpenAPI, zod, or equivalent).
2. Use consistent error envelopes across routes (status + machine-readable code + human hint).
3. Document pagination, filtering, and idempotency expectations.
4. Prefer additive changes; gate breaking changes behind explicit versioning notes.`,
      scripts: [],
      references: [],
      assets: [],
    },
  ],
};
