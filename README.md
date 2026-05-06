# Sherpa

**Portable context management for AI coding agents.** Sherpa keeps conventions, skills, decisions, and searchable memory in a project-local `.sherpa/` workspace, then syncs and adapts that context into the formats your tools already read (Cursor rules, Claude Code, Copilot instructions, and more).

## Installation

```bash
npm install -g @sherpa/cli-app
```

Requires **Node.js 22+** (LTS).

## Quick start

```bash
cd your-repo
sherpa init
sherpa sync
sherpa adapt
```

- **`init`** — Creates `.sherpa/` with `sherpa.config.yaml`, conventions, starter skills (template-aware), and a local SQLite memory database.
- **`sync`** — Ingests sources into memory and refreshes adapter-oriented snapshots.
- **`adapt`** — Writes agent-specific instruction files from your Sherpa workspace.

Use **`sherpa init --template <web-app|library|cli-tool|monorepo>`** for curated conventions and skills.

## Features

| Capability | Description |
|------------|-------------|
| **Unified workspace** | Single `.sherpa/` tree for config, skills, decisions, audit trail hooks, and adapter outputs. |
| **Skills** | Markdown-defined reusable procedures agents can discover during adaptation. |
| **Memory & search** | SQLite-backed entries with BM25 / hybrid search over chunked content. |
| **Adapters** | One source of truth, multiple exports tuned per agent ecosystem. |
| **Privacy hooks** | Secret scanning on sensitive writes; configurable redaction and host allowlists. |
| **MCP server** | Optional Model Context Protocol integration for tools that speak MCP. |

## Supported agents

Sherpa can emit (or complement) instructions for:

- **Claude Code** (`CLAUDE.md`)
- **Cursor** (`.cursorrules`)
- **Codex CLI** (`AGENTS.md`)
- **Gemini CLI** (`GEMINI.md`)
- **GitHub Copilot** (`.github/copilot-instructions.md`)
- **Windsurf** (`.windsurfrules`)

Exact filenames and layouts follow each ecosystem’s conventions; see `sherpa adapt --help` and [docs/architecture.md](docs/architecture.md).

## Architecture (high level)

Sherpa is a TypeScript monorepo: a thin **`cli-app`** orchestrates **`core-*`** domains (config, memory, skills, search, adapters, migration, audit) on top of **`infra-*`** implementations (SQLite, parsers, embeddings).

```
                         ┌─────────────────┐
   Developers ─────────►│   sherpa CLI    │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
      ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
      │ core-config  │    │ core-memory  │    │ core-skills  │
      │ + adapters   │    │ + core-search│    │ + migration  │
      └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 ▼
                         ┌──────────────┐
                         │ infra-sqlite │
                         │ infra-parser │
                         │ infra-embed  │
                         └──────────────┘
```

## Documentation

- [Getting started (5 minutes)](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Mixed-assistant workflows](docs/mixed-assistant-workflows.md)
- [What Sherpa stores](docs/what-sherpa-stores.md)
- [Contributing](docs/contributing.md)

Security disclosures and data-classification guidance: [SECURITY.md](SECURITY.md).

## Contributing

Bug reports, doc fixes, and PRs are welcome. Start with [docs/contributing.md](docs/contributing.md) for branch hygiene, tests, and review expectations.

## License

MIT — see your organization’s `LICENSE` file if bundled downstream; Sherpa is intended for permissive use and modification.
