# Contributing

Thank you for improving Sherpa. This document covers expectations for pull requests, testing, and module layout.

## Prerequisites

- Node.js **22.x**
- npm workspaces (`npm ci` at repo root)

## Workflow

1. **Discuss larger changes** via issue or draft PR when behavior crosses multiple packages.
2. **Branch** — Follow your team’s naming convention (examples: `feat/…`, `fix/…`, `wo/…`).
3. **Implement with tests** — New or materially changed TypeScript should include Vitest coverage near the code (`packages/*/src/**/*.test.ts`).
4. **Keep handlers thin** — CLI commands should orchestrate; domain logic belongs in `core-*` packages.
5. **Run checks locally:**

```bash
npm run build
npm run lint
npm run test
```

6. **Describe PRs clearly** — Summarize intent, risk, and rollout notes (breaking CLI flags, config migrations, etc.).

## Module structure

| Prefix | Role |
|--------|------|
| `packages/cli-app` | Commander CLI (`sherpa`), command wiring, starter templates. |
| `packages/core-*` | Domain services (config schema, memory CRUD, adapters, search orchestration, audit chain). |
| `packages/infra-*` | Persistence & integrations (SQLite repositories, Markdown parsers, embedding providers). |
| `packages/mcp-server` | MCP transport plumbing built on shared cores. |

Dependency direction: **`cli-app` → `core-*` → `infra-*`**. Avoid circular imports; extract shared types rather than reaching sideways.

## Reviews

- Prefer smaller PRs per concern (docs-only vs behavior change).
- Call out security-sensitive paths (`core-memory`, `infra-sqlite`, adapters generating executable hints).
- Update docs under `docs/` when user-visible behavior shifts.

## Code style

- ESLint (`eslint.config.js`) governs TypeScript sources.
- Avoid commented-out code; rely on version control.
- Explain non-obvious trade-offs with concise comments.

## Licensing

By contributing, you agree your contributions ship under the project license (MIT intent).
