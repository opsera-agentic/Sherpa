# Architecture

Sherpa separates **orchestration** (CLI), **policy-rich domains** (`core-*`), and **infrastructure adapters** (`infra-*`). This note sketches decomposition and data flow—idealized for onboarding.

## Module decomposition

| Package | Responsibility |
|---------|----------------|
| `@sherpa/cli-app` | Parses argv, loads config, dispatches commands (`init`, `sync`, `adapt`, `search`, …). |
| `@sherpa/core-config` | YAML schema, defaults, merge + validation helpers. |
| `@sherpa/core-memory` | Memory entries, chunk rebuild hooks, secret scanning gates. |
| `@sherpa/core-skills` | SKILL.md discovery + parsing into structured skills. |
| `@sherpa/core-search` | BM25 / hybrid orchestration above SQLite FTS + embeddings. |
| `@sherpa/core-adapters` | Transforms Sherpa context into agent-specific instruction payloads. |
| `@sherpa/core-migration` | Imports legacy markdown sections into normalized memory. |
| `@sherpa/core-audit` | Hash-chained audit events mirrored to JSONL. |
| `@sherpa/infra-sqlite` | Schema, repositories, migrations. |
| `@sherpa/infra-parser` | Chunking + language-aware helpers. |
| `@sherpa/infra-embedding` | Provider abstraction for vectors / TF-IDF bridges. |
| `@sherpa/mcp-server` | MCP tool surface over existing services. |

## Data flow (conceptual)

```
Markdown & YAML (.sherpa/, repo docs)
        │
        ▼
  CLI commands (sync / migrate / skills import)
        │
        ├──► SQLite • MEMORY_ENTRIES / MEMORY_CHUNKS (+ embeddings)
        │
        └──► Adapter snapshots / exported instructions (CLAUDE.md, …)
```

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

## Related reading

- [What Sherpa stores](what-sherpa-stores.md)
- [Mixed-assistant workflows](mixed-assistant-workflows.md)
