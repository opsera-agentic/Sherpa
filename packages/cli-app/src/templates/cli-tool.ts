import type { StarterTemplateData } from './types.js';

export const cliToolTemplate: StarterTemplateData = {
  conventions: `# Sherpa conventions — CLI tool

Optimize for operators running commands in CI and locally with predictable exit codes and stderr-first diagnostics.

## Argument parsing

- Prefer structured parsers (Commander, yargs, etc.) with generated help text.
- Fail fast on invalid combinations; print remediation hints, not stack traces, for user errors.

## Errors & logging

- Reserve stdout for primary payload; route diagnostics to stderr.
- Use non-zero exit codes consistently (config errors vs runtime failures).

## Testing

- Snapshot help output for regressions where stable.
- Exercise golden paths with subprocess tests when integration coverage matters.
`,
  config: {
    adapters: {
      terminal: { enabled: true },
      filesystem: { enabled: true },
      git: { enabled: true },
      ide: { enabled: false },
      http: { enabled: false },
    },
    mcp: {
      enabled: false,
      transport: 'stdio',
    },
    audit: {
      enabled: true,
      jsonlRotation: 'daily',
    },
  },
  skills: [
    {
      name: 'cli-help-ergonomics',
      description: 'Ship CLI help text that teaches flags and examples.',
      version: '1.0.0',
      tags: ['cli', 'ux', 'help'],
      triggers: ['command', 'CLI', 'flags'],
      instructions: `When adding commands or flags:

1. Provide short and long descriptions with concrete examples.
2. Document defaults and mutual exclusivity directly in help output.
3. Align naming with POSIX conventions where it reduces surprise.`,
      scripts: [],
      references: [],
      assets: [],
    },
    {
      name: 'cli-exit-codes',
      description: 'Keep exit semantics stable for CI consumers.',
      version: '1.0.0',
      tags: ['cli', 'ci', 'errors'],
      triggers: ['exit code', 'stderr', 'failure'],
      instructions: `For CLI failures:

1. Map validation problems to a dedicated non-zero exit bucket.
2. Surface actionable stderr messages before exiting.
3. Avoid leaking secrets in traces — scrub tokens from logged paths.`,
      scripts: [],
      references: [],
      assets: [],
    },
  ],
};
