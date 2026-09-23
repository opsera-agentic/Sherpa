# Contributing to Sherpa

First off, thank you for considering contributing to Sherpa! Every contribution helps make AI coding agents more consistent and portable for developers everywhere.

## Ways to Contribute

- **Report bugs** — Open an issue with reproduction steps
- **Suggest features** — Describe your use case and proposed solution
- **Fix documentation** — Typos, unclear explanations, missing examples
- **Submit code** — Bug fixes, new adapters, search improvements, tests
- **Share skills** — Create and share reusable skill definitions

## Prerequisites

- Node.js **22+** (latest LTS recommended)
- npm 10+ (comes with Node.js)
- Git

## Setup

```bash
# Fork and clone the repo
git clone https://github.com/opsera-public/sherpa.git
cd sherpa

# Install all workspace dependencies
npm ci

# Build all packages (ordered by dependency)
npm run build

# Run the full test suite
npm test

# Run the linter
npm run lint
```

## Development Workflow

### 1. Create a branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make your changes

Follow the module structure — business logic belongs in `core-*` packages, persistence in `infra-*`, and CLI wiring in `cli-app`.

### 3. Write tests

Every new or materially changed source file should have a corresponding `*.test.ts` file. Tests live alongside source files:

```
packages/core-memory/src/
  index.ts
  index.test.ts
  secret-scanner.ts
```

Use Vitest:

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should do the expected thing', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

### 4. Verify everything passes

```bash
npm run build    # TypeScript compilation
npm run lint     # ESLint checks
npm test         # All tests (unit + E2E + fixtures)
```

### 5. Submit a pull request

- Write a clear title and description
- Reference any related issues
- Note breaking changes or migration steps
- Include before/after examples for behavior changes

## Module Structure

```
packages/
  cli-app/          # CLI entry point (Commander.js)
  core-config/      # Configuration loading and validation
  core-memory/      # Memory CRUD, secret scanning
  core-search/      # BM25, vector, hybrid search
  core-skills/      # Skill loading and management
  core-adapters/    # Adapter interface + all 6 adapters
  core-audit/       # Hash-chained audit logging
  core-migration/   # Import from existing agent configs
  core-telemetry/   # Anonymous usage metrics
  infra-sqlite/     # SQLite, FTS5, migrations
  infra-parser/     # AST-aware code chunking
  infra-embedding/  # Embedding providers (TF-IDF, Ollama, OpenAI)
  mcp-server/       # MCP stdio server
```

**Dependency direction:** `cli-app` → `core-*` → `infra-*`

Never import upward (e.g., `infra-sqlite` must not import from `core-memory`). Extract shared types into the lower-level package if needed.

## Code Guidelines

### Architecture

- **Layered design** — routes/commands → services → repositories
- **Dependency injection** — Services receive dependencies through constructors
- **Strategy pattern** — External integrations depend on interfaces, not vendor SDKs
- **Thin handlers** — CLI commands parse input, call service, format output

### Style

- ESLint config is the authority — run `npm run lint`
- Explain **why**, not **what** — Code is self-documenting for the "what"
- No commented-out code — Use git history
- No TODOs without an issue reference
- Prefer descriptive errors over silent failures

### Testing

- Mock external dependencies (databases, APIs, file systems)
- Cover happy path, error cases, and edge cases
- Tests should be deterministic — no timing dependencies
- Use temp directories for file I/O tests, clean up in `afterEach`

## Adding a New Adapter

1. Create `packages/core-adapters/src/adapters/your-agent.ts`
2. Extend `BaseAdapter` and implement `generate()` and `validate()`
3. Register it in `packages/core-adapters/src/index.ts`
4. Add fixture tests in `packages/core-adapters/src/fixtures.test.ts`
5. Document the output format in the README

## Adding an Embedding Provider

1. Create `packages/infra-embedding/src/your-provider.ts`
2. Implement the `EmbeddingProvider` interface (`embed`, `embedBatch`)
3. Add it to the factory in `packages/infra-embedding/src/index.ts`
4. Add configuration support in `packages/core-config/src/schema.ts`
5. Write tests with mocked API calls

## Pull Request Review

We aim to review PRs within a few days. To speed things up:

- Keep PRs focused — one concern per PR
- Separate refactoring from behavior changes
- Call out security-sensitive changes (memory operations, adapter output, audit logic)
- Update docs when user-visible behavior changes

## Code of Conduct

Be kind, be constructive, be inclusive. We're building tools for everyone.

## License

By contributing to Sherpa, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
