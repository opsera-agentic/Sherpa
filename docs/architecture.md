# Architecture

Sherpa separates **orchestration** (CLI), **policy-rich domains** (`core-*`), and **infrastructure adapters** (`infra-*`). This note sketches decomposition and data flow—idealized for onboarding.

## Module decomposition

| Package | Responsibility |
|---------|----------------|
| `@sherpa/cli-app` | Parses argv, loads config, dispatches commands (`init`, `sync`, `adapt`, `pull`, `watch`, `search`, …). |
| `@sherpa/core-config` | YAML schema, defaults, merge + validation helpers. |
| `@sherpa/core-memory` | Memory entries, chunk rebuild hooks, secret scanning gates. |
| `@sherpa/core-skills` | SKILL.md discovery + parsing into structured skills. |
| `@sherpa/core-search` | BM25 / hybrid orchestration above SQLite FTS + embeddings. |
| `@sherpa/core-adapters` | Transforms Sherpa context into agent-specific instruction payloads. |
| `@sherpa/core-migration` | Imports legacy markdown sections into normalized memory. |
| `@sherpa/core-audit` | Hash-chained audit events mirrored to JSONL. |
| `@sherpa/core-telemetry` | Anonymous usage metrics, PostHog integration. |
| `@sherpa/infra-sqlite` | Schema, repositories, migrations. |
| `@sherpa/infra-parser` | Chunking + language-aware helpers. |
| `@sherpa/infra-embedding` | Provider abstraction for vectors / TF-IDF bridges. |
| `@sherpa/mcp-server` | MCP tool surface over existing services. |

## Data flow (conceptual)

```
Agent files (CLAUDE.md, .cursorrules, …)
        │
        │  sherpa pull / sherpa watch (reverse sync)
        ▼
.sherpa/conventions.md  ◄──── edit here (source of truth)
        │
        │  sherpa init (one-time import on first run)
        │  sherpa adapt (forward generate)
        │  sherpa sync  (memory + adapter snapshots)
        ▼
  SQLite • MEMORY_ENTRIES / MEMORY_CHUNKS (+ embeddings)
        │
        └──► Adapter snapshots / exported instructions (CLAUDE.md, …)
```

**Forward flow** (`conventions.md` → agent files): `sherpa adapt` overwrites agent files from `conventions.md`.

**Reverse flow** (agent files → `conventions.md`): `sherpa pull` or `sherpa watch` absorbs direct edits back into `conventions.md`, keyed by per-file HTML markers so each import block updates in-place.

Search reads chunks (+ embeddings) through `core-search`, never bypassing validation layers exposed by `MemoryService`.

## Dependency diagram (packages)

```
cli-app
  ├── core-adapters
  ├── core-audit
  ├── core-config
  ├── core-memory
  ├── core-migration
  ├── core-search
  ├── core-skills
  └── mcp-server
        └── (reuses core-config …)

core-memory ──► infra-sqlite
core-search ──► infra-sqlite + infra-embedding
core-skills ──► (filesystem IO + yaml parsing helpers)
```

Arrows imply compile-time imports; dashed semantics omitted for brevity.

## Configuration lifecycle

1. `mergeWithDefaults` hydrates partial YAML fragments into a fully validated `SherpaConfig`.
2. Sensitive toggles (`privacy`, `security`) influence remote embedding hosts and redaction.
3. CLI persists YAML via `serializeSherpaConfig` ensuring deterministic ordering for reviews.

## Extension points

- **Skills**: Drop new folders under `.sherpa/skills/` with frontmatter-rich `SKILL.md`.
- **Adapters**: Register strategy implementations inside `@sherpa/core-adapters` respecting existing adapter interfaces.
- **Embedding providers**: Implement infra interfaces rather than bolting vendor SDKs into CLI layers.

## Performance

SQLite is configured with WAL-friendly pragmas for the write-then-search workload:

- `journal_mode=WAL` -- Concurrent reads during writes
- `synchronous=NORMAL` -- Durable under WAL, faster than FULL
- `busy_timeout=5000` -- Avoids SQLITE_BUSY when CLI and MCP server share the database
- `cache_size=-16000` -- 16MB in-memory page cache for FTS/aggregate queries
- `temp_store=MEMORY` -- Scratch data stays in RAM

## Build system

The monorepo uses TypeScript composite project references. A single `tsc -b` at the root builds all 13 packages in dependency order with incremental compilation.

```bash
npm run build    # tsc -b (solution mode, parallel where possible)
npm test         # vitest
npm run lint     # eslint
```

## Related reading

- [Configuration Reference](configuration.md)
- [What Sherpa stores](what-sherpa-stores.md)
- [Mixed-assistant workflows](mixed-assistant-workflows.md)
