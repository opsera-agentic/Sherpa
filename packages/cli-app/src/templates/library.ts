import type { StarterTemplateData } from './types.js';

export const libraryTemplate: StarterTemplateData = {
  conventions: `# Sherpa conventions — reusable library

Ship small, composable surfaces with semver discipline and documentation that teaches safe usage.

## API design

- Prefer explicit types over \`any\`; export only what consumers need.
- Avoid breaking changes in patch releases; document deprecations with timelines.
- Keep tree-shaking friendly entrypoints (side-effect free modules where possible).

## Documentation

- Maintain a concise README with quickstart, API overview, and migration notes.
- Provide runnable examples or snippets for non-trivial APIs.

## Releases

- Follow semantic versioning; tag releases and summarize changes in a changelog.
`,
  config: {
    audit: {
      enabled: true,
      integrityChecksOnStartup: true,
    },
    privacy: {
      redactSecrets: true,
      allowTelemetry: false,
    },
    search: {
      maxResults: 35,
    },
  },
  skills: [
    {
      name: 'semver-release-notes',
      description: 'Guard semver guarantees when modifying public APIs.',
      version: '1.0.0',
      tags: ['library', 'semver', 'release'],
      triggers: ['breaking change', 'semver', 'export'],
      instructions: `When touching exported APIs:

1. Classify the change as patch/minor/major before merging.
2. Document migrations for breaking changes with code samples.
3. Prefer deprecation windows before removal unless security demands otherwise.`,
      scripts: [],
      references: [],
      assets: [],
    },
    {
      name: 'typed-public-surface',
      description: 'Keep exported contracts readable for downstream TypeScript consumers.',
      version: '1.0.0',
      tags: ['typescript', 'types', 'library'],
      triggers: ['types', 'public API', 'dts'],
      instructions: `For library typings:

1. Narrow unions instead of broad \`string\` where domain knowledge exists.
2. Avoid leaking internal helper types in published entrypoints.
3. Run type checks against a representative consumer fixture when feasible.`,
      scripts: [],
      references: [],
      assets: [],
    },
  ],
};
