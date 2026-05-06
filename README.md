<p align="center">
  <h1 align="center">Sherpa</h1>
  <p align="center"><strong>Portable context management for AI coding agents</strong></p>
  <p align="center">
    <a href="#installation">Install</a> &middot;
    <a href="#quick-start">Quick Start</a> &middot;
    <a href="docs/getting-started.md">Docs</a> &middot;
    <a href="#contributing">Contribute</a>
  </p>
</p>

---

## The Problem

Every AI coding agent has its own instruction format. Cursor reads `.cursorrules`. Claude Code reads `CLAUDE.md`. Copilot reads `copilot-instructions.md`. When your team uses multiple agents — or when a developer switches tools — project context gets fragmented, duplicated, or lost entirely.

**The result:** inconsistent AI behavior across tools, repeated prompting of the same conventions, and no shared memory between sessions.

## The Solution

Sherpa gives your project a single, version-controlled source of truth for AI context — conventions, architecture decisions, reusable skills, and searchable memory — then **adapts** that context into every agent's native format automatically.

```
Write once → sherpa adapt → every agent speaks your project's language
```

## Why Sherpa?

| Value | Description |
|-------|-------------|
| **Write once, use everywhere** | Define conventions once in `.sherpa/`. Sherpa generates native configs for 6+ AI agents automatically. |
| **Persistent memory** | Decisions, patterns, and context survive across sessions in a local SQLite database with hybrid search. |
| **Zero lock-in** | Switch agents freely. Your context travels with you. MIT licensed, local-first, no cloud dependency. |
| **Team consistency** | Commit `.sherpa/` to git. Every contributor gets the same AI context on `sherpa sync`. |
| **Security built-in** | Secret scanning blocks API keys from entering memory. Data classification controls what reaches adapter files. |
| **Skill portability** | Reusable workflow definitions (Agent Skills Standard) work across all supported agents. |

## Supported Agents

| Agent | Output File | Status |
|-------|-------------|--------|
| Claude Code | `CLAUDE.md` | Supported |
| Cursor | `.cursorrules` | Supported |
| Codex CLI | `AGENTS.md` | Supported |
| Gemini CLI | `GEMINI.md` | Supported |
| GitHub Copilot | `.github/copilot-instructions.md` | Supported |
| Windsurf | `.windsurfrules` | Supported |

## Installation

```bash
npm install -g @sherpa/cli-app
```

**Requirements:** Node.js 22+ (LTS recommended)

Verify the installation:

```bash
sherpa --version
```

## Quick Start

### 1. Initialize your project

```bash
cd your-project
sherpa init
```

This creates a `.sherpa/` directory with:
- `sherpa.config.yaml` — Configuration for adapters, search, and security
- `conventions.md` — Your project's coding standards (edit this!)
- `decisions/` — Architecture decision records
- `skills/` — Reusable workflow definitions
- `memory.sqlite` — Local search-indexed memory store
- `audit/` — Immutable audit trail

**If your project already has agent files** (`CLAUDE.md`, `.cursorrules`, etc.), `sherpa init` automatically detects and imports their content into `conventions.md` so nothing is lost:

```
Imported 2 existing agent file(s) into .sherpa/conventions.md — review and edit as needed.
```

Use a starter template for pre-configured conventions:

```bash
sherpa init --template web-app      # React/Vue patterns, API design
sherpa init --template library      # Semver, public API design
sherpa init --template cli-tool     # Arg parsing, error handling
sherpa init --template monorepo     # Workspace management
```

### 2. Customize your conventions

Edit `.sherpa/conventions.md` with your project's coding standards, naming patterns, and architectural guidelines. This is the single source of truth that all adapters draw from.

### 3. Generate adapter files

```bash
sherpa adapt
```

This generates native instruction files for all configured agents:

```
Generated 6 adapter targets
  claude-code -> CLAUDE.md (valid)
  cursor -> .cursorrules (valid)
  codex-cli -> AGENTS.md (valid)
  gemini-cli -> GEMINI.md (valid)
  copilot -> .github/copilot-instructions.md (valid)
  windsurf -> .windsurfrules (valid)
```

### 4. Search your memory

```bash
sherpa search "authentication flow"
sherpa search --type convention "naming"
sherpa search --mode hybrid "error handling patterns"
```

### 5. Sync after pulling changes

```bash
sherpa sync
```

Rebuilds the memory index and regenerates adapter files from the latest `.sherpa/` content.

### 6. Keep agent files in sync (reverse flow)

If a teammate edits `CLAUDE.md` or `.cursorrules` directly, pull those changes back into `conventions.md`:

```bash
# Pull all agent files
sherpa pull

# Pull a specific one
sherpa pull --from claude-code
```

Or run the file watcher to sync automatically whenever an agent file is saved:

```bash
sherpa watch
```

```
Watching 3 agent file(s) for changes. Press Ctrl+C to stop.
  CLAUDE.md
  .cursorrules
  AGENTS.md

[watch] CLAUDE.md changed — pulling into conventions.md...
[watch] Re-running adapt...
[watch] Done. conventions.md and all adapter files are up to date.
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `sherpa init` | Initialize the `.sherpa/` workspace; auto-imports any existing agent files |
| `sherpa adapt` | Generate agent-specific instruction files from `conventions.md` |
| `sherpa pull [--from <agent>]` | Reverse-sync agent files back into `conventions.md` |
| `sherpa watch` | Watch agent files and auto-run pull + adapt on every save |
| `sherpa sync` | Sync sources into memory and refresh adapter snapshots |
| `sherpa search <query>` | Search memory with BM25/hybrid search |
| `sherpa skills list` | List available skills |
| `sherpa skills show <name>` | View a skill's full details |
| `sherpa skills import <path>` | Import a skill from external source |
| `sherpa serve` | Start the MCP server (stdio transport) |
| `sherpa migrate --from <agent>` | Import context from existing agent configs into memory |
| `sherpa validate` | Check conventions for consistency |
| `sherpa status` | Show database stats and health |
| `sherpa archive` | Archive old memory entries |

All commands support `--json` for machine-readable output and `--verbose` for debug diagnostics.

## Architecture

Sherpa is a TypeScript monorepo with clean separation between CLI, domain logic, and infrastructure:

```
                          ┌──────────────────────┐
    Developer ──────────► │     sherpa CLI       │
                          │  (Commander.js)      │
                          └──────────┬───────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
   ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
   │  core-config  │        │  core-memory  │        │  core-skills  │
   │  core-adapters│        │  core-search  │        │  core-migration│
   │               │        │  core-audit   │        │               │
   └───────┬───────┘        └───────┬───────┘        └───────┬───────┘
           │                        │                         │
           └────────────────────────┼─────────────────────────┘
                                    ▼
                          ┌──────────────────────┐
                          │    infra-sqlite      │
                          │    infra-parser      │
                          │    infra-embedding   │
                          └──────────────────────┘
```

### Key Design Principles

- **Local-first** — All data stays on your machine. No cloud, no accounts, no telemetry.
- **Portable** — Everything lives in `.sherpa/` which you commit to version control.
- **Pluggable** — Swap embedding providers (TF-IDF, Ollama, OpenAI) without changing application code.
- **Auditable** — Every mutation produces a hash-chained audit record.
- **Secure** — Secret scanning, data classification, and PII redaction built into the pipeline.

## Search Capabilities

Sherpa provides three search modes:

| Mode | How it works | Best for |
|------|--------------|----------|
| **BM25** | Full-text search via SQLite FTS5 | Exact keyword matching |
| **Vector** | Cosine similarity on embeddings | Semantic/meaning-based search |
| **Hybrid** | BM25 + Vector with Reciprocal Rank Fusion | Best overall accuracy |

Configure your embedding provider in `sherpa.config.yaml`:

```yaml
embedding:
  provider: tfidf    # Local, no API needed (default)
  # provider: ollama # Local GPU acceleration
  # provider: openai # Cloud, highest quality
```

## MCP Integration

For agents that support the Model Context Protocol, Sherpa provides a stdio server:

```bash
sherpa serve --allow-write
```

This exposes three tools:
- `memory_read` — Retrieve memory entries by ID
- `memory_write` — Create new memory entries (requires `--allow-write`)
- `memory_search` — Search memory with filters

Configure in your agent's MCP settings to enable live memory access during coding sessions.

## Security

Sherpa takes security seriously:

- **Secret scanning** — Content is scanned for AWS keys, private key headers, password patterns before storage
- **Data classification** — Four tiers (Public, Internal, Confidential, Restricted) control what reaches adapter files
- **PII redaction** — Git-derived metadata (emails, names) is optionally redacted
- **Audit trail** — Hash-chained logs of every mutation for tamper detection

See [SECURITY.md](SECURITY.md) for vulnerability reporting and detailed security guidance.

## Documentation

- [Getting Started (5 minutes)](docs/getting-started.md)
- [Architecture Deep Dive](docs/architecture.md)
- [Mixed-Assistant Workflows](docs/mixed-assistant-workflows.md)
- [What Sherpa Stores](docs/what-sherpa-stores.md)
- [Contributing Guide](docs/contributing.md)
- [Security Policy](SECURITY.md)

## Contributing

We welcome contributions of all kinds — bug reports, documentation improvements, feature requests, and code contributions.

### Getting Started

```bash
# Clone the repo
git clone https://github.com/Vishnu-Opsera/Sherpa.git
cd Sherpa

# Install dependencies
npm ci

# Build all packages
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Development Workflow

1. **Fork** the repository and create a feature branch
2. **Make changes** following the module structure (`cli-app` → `core-*` → `infra-*`)
3. **Write tests** — Every new or changed source file should have corresponding tests
4. **Run the full suite** — `npm run build && npm run lint && npm test`
5. **Submit a PR** with a clear description of intent and any breaking changes

### Module Structure

| Package | Purpose |
|---------|---------|
| `packages/cli-app` | CLI entry point, Commander.js commands, templates |
| `packages/core-config` | YAML configuration loading and validation |
| `packages/core-memory` | Memory CRUD, secret scanning, classification |
| `packages/core-search` | BM25, vector, and hybrid search orchestration |
| `packages/core-skills` | Skill loading, validation, and import |
| `packages/core-adapters` | Adapter interface, registry, and all 6 adapters |
| `packages/core-audit` | Immutable hash-chained audit logging |
| `packages/core-migration` | Import context from existing agent configs |
| `packages/infra-sqlite` | SQLite with WAL, FTS5, schema migrations |
| `packages/infra-parser` | AST-aware chunking for JS/TS files |
| `packages/infra-embedding` | TF-IDF, Ollama, and OpenAI embedding providers |
| `packages/mcp-server` | MCP stdio server for live agent integration |

### Code Guidelines

- **Keep files focused** — One responsibility per file, split at 500 lines
- **Dependency direction** — `cli-app` → `core-*` → `infra-*` (never reverse)
- **Test behavior, not implementation** — Mock external dependencies
- **Comments explain why, not what** — The code speaks for itself
- **No secrets in code** — Use environment variables, never hardcode credentials

See [docs/contributing.md](docs/contributing.md) for the full guide.

## Roadmap

- [x] File watching with auto-regeneration (`sherpa watch`)
- [ ] Parser integration for source file indexing (JS/TS regex chunker built in `infra-parser`, CLI integration pending)
- [ ] Custom adapter development SDK
- [ ] Skill marketplace for sharing community skills
- [ ] VS Code extension for inline skill discovery
- [ ] Cloud sync for distributed teams (opt-in)
- [ ] Additional language support for AST chunking (Python, Go, Rust)

## License

[MIT](LICENSE) — Use it, modify it, ship it. No strings attached.

---

<p align="center">
  Built with care for developers who use AI coding agents daily.
</p>
