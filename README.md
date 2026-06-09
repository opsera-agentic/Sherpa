<p align="center">
  <h1 align="center">Sherpa</h1>
  <p align="center"><strong>Portable context management for AI coding agents</strong></p>
  <p align="center">
    <a href="#installation">Install</a> &middot;
    <a href="#quick-start">Quick Start</a> &middot;
    <a href="#cli-reference">CLI Reference</a> &middot;
    <a href="#configuration">Configuration</a> &middot;
    <a href="docs/">Docs</a> &middot;
    <a href="#contributing">Contribute</a>
  </p>
</p>

---

## The Problem

Every AI coding agent has its own instruction format. Cursor reads `.cursorrules`. Claude Code reads `CLAUDE.md`. Copilot reads `copilot-instructions.md`. When your team uses multiple agents -- or when a developer switches tools -- project context gets fragmented, duplicated, or lost entirely.

**The result:** inconsistent AI behavior across tools, repeated prompting of the same conventions, and no shared memory between sessions.

## The Solution

Sherpa gives your project a single, version-controlled source of truth for AI context -- conventions, architecture decisions, reusable skills, and searchable memory -- then **adapts** that context into every agent's native format automatically.

```
Write once --> sherpa adapt --> every agent speaks your project's language
```

## Why Sherpa?

| Value | Description |
|-------|-------------|
| **Write once, use everywhere** | Define conventions once in `.sherpa/`. Sherpa generates native configs for 6 AI agents automatically. |
| **Persistent memory** | Decisions, patterns, and context survive across sessions in a local SQLite database with BM25/vector/hybrid search. |
| **Zero lock-in** | Switch agents freely. Your context travels with you. MIT licensed, local-first, no cloud dependency. |
| **Team consistency** | Commit `.sherpa/` to git. Every contributor gets the same AI context on `sherpa sync`. |
| **Security built-in** | 9 secret-scanning rules block API keys, PEM blocks, and credentials from entering memory. Hash-chained audit trail for tamper detection. |
| **Skill portability** | Reusable workflow definitions work across all supported agents. |
| **MCP integration** | Live memory access for agents via Model Context Protocol server. |
| **Telemetry** | Optional anonymous usage metrics (opt-in) for data-driven improvements. |

## Supported Agents

| Agent | Output File | Format |
|-------|-------------|--------|
| Claude Code | `CLAUDE.md` | Markdown with `##` sections |
| Cursor | `.cursorrules` | Plain text rules |
| Codex CLI | `AGENTS.md` | Markdown with terminal guidance |
| Gemini CLI | `GEMINI.md` | Markdown with `##` headers |
| GitHub Copilot | `.github/copilot-instructions.md` | Markdown with HTML comments |
| Windsurf | `.windsurfrules` | Bracket notation (`[section-name]`) |

## Installation

```bash
npm install -g @sherpa/cli-app
```

**Requirements:** Node.js 22+ (LTS recommended)

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

```
.sherpa/
  sherpa.config.yaml       # Configuration
  conventions.md           # Your project's coding standards (edit this!)
  skills/                  # Reusable workflow definitions
  decisions/               # Architecture decision records
  adapters/                # Generated adapter snapshots
  audit/                   # Immutable audit trail (JSONL)
  memory.sqlite            # Local search-indexed memory
```

**Auto-import:** If your project already has `CLAUDE.md`, `.cursorrules`, or other agent files, `sherpa init` detects and imports them into `conventions.md` automatically.

Use a starter template for pre-configured conventions:

```bash
sherpa init --template web-app      # React/Vue/Express patterns, API design, accessibility
sherpa init --template library      # Semver, public API design, changelog discipline
sherpa init --template cli-tool     # Arg parsing, exit codes, error handling
sherpa init --template monorepo     # Workspace boundaries, release coordination
```

### 2. Edit your conventions

Edit `.sherpa/conventions.md` with your project's coding standards, naming patterns, and architectural guidelines. This is the single source of truth.

### 3. Generate agent files

```bash
sherpa adapt
```

Output:
```
Generated 6 adapter targets
  claude-code -> CLAUDE.md (valid)
  cursor -> .cursorrules (valid)
  codex-cli -> AGENTS.md (valid)
  gemini-cli -> GEMINI.md (valid)
  copilot -> .github/copilot-instructions.md (valid)
  windsurf -> .windsurfrules (valid)
```

### 4. Sync memory and search

```bash
sherpa sync                              # Index sources into memory
sherpa search "authentication flow"      # Search with natural language
sherpa search --mode bm25 "error"        # Keyword-only search
```

### 5. Keep everything in sync

```bash
# Manual: pull agent file edits back into conventions.md
sherpa pull

# Automatic: watch agent files and auto-sync on every save
sherpa watch
```

---

## CLI Reference

All commands support `--project-root <path>`, `--json` (machine-readable output), and `--verbose` (debug diagnostics).

### Core Workflow

| Command | Description |
|---------|-------------|
| `sherpa init [--template TYPE] [--force]` | Initialize `.sherpa/` workspace. Auto-detects project type (web-app, library, cli-tool, monorepo) and imports existing agent files. |
| `sherpa sync` | Index conventions, decisions, README, config files, and workflows into memory. Regenerate adapter snapshots. Compute embeddings if vector/hybrid search configured. |
| `sherpa adapt [--agent NAME]` | Generate agent-specific instruction files. Honors `adapters.disabled` config. Use `--agent` to target a single adapter. |
| `sherpa pull [--from AGENT]` | Reverse-sync agent files back into `conventions.md`. Skips files marked `<!-- sherpa:generated -->` to prevent duplication. |
| `sherpa watch` | Watch agent files for changes, auto-run pull + adapt on save (debounced 300ms). Press Ctrl+C to stop. |
| `sherpa inspect [--agent <agent>] [--sources]` | Inspect `.sherpa` sources and generated agent-file health |

### Search and Memory

| Command | Description |
|---------|-------------|
| `sherpa search <query> [--mode MODE] [--type TYPES] [--tags TAGS] [--limit N]` | Search memory. Modes: `bm25` (keyword), `vector` (semantic), `hybrid` (both with rank fusion). Also matches and displays relevant skills. |
| `sherpa status` | Show memory database entry count and file size. |
| `sherpa archive --older-than DURATION` | Archive stale entries. Duration formats: `30d`, `12h`, `45m`, `2w`. |

### Inspect Workspace and Agent Files

Use `sherpa inspect` to understand what Sherpa sources exist and whether generated AI-agent files are current, owned by Sherpa, and safe to use:

```bash
sherpa inspect
sherpa inspect --sources
sherpa inspect --agent claude-code
sherpa --json inspect --agent cursor
```

The report includes source counts, token estimates, file sizes, last-updated timestamps, secret-scan status, generated-file freshness, manual edit detection, source coverage, and recommended next actions.

### Skills

| Command | Description |
|---------|-------------|
| `sherpa skills list` | List all skills with name, version, description. |
| `sherpa skills show --name NAME` | View a skill's full definition and instructions. |
| `sherpa skills import --from PATH` | Import a skill folder into `.sherpa/skills/`. |

### Migration and Validation

| Command | Description |
|---------|-------------|
| `sherpa migrate --from AGENT [--dry-run]` | Import legacy agent instructions into memory. Agents: `claude-code`, `cursor`, `codex-cli`, `gemini-cli`, `copilot`, `windsurf`. |
| `sherpa validate` | Check conventions.md integrity: missing files, duplicate imports, secret patterns, size warnings, empty decisions, missing SKILL.md files. |

### MCP Server

| Command | Description |
|---------|-------------|
| `sherpa serve [--allow-write]` | Start MCP stdio server exposing `memory_read`, `memory_write`, `memory_search` tools. Session token generated on startup for access control. |

### Telemetry and Stats

| Command | Description |
|---------|-------------|
| `sherpa telemetry enable` | Enable anonymous usage metrics (sets both operational and privacy toggles). |
| `sherpa telemetry disable` | Disable telemetry collection. |
| `sherpa telemetry status` | Show telemetry state, anonymous ID, and exactly what is collected. |
| `sherpa stats` | Display local usage statistics: command breakdown, success rates, durations, active days. |

---

## Configuration

All settings live in `.sherpa/sherpa.config.yaml`. Run `sherpa init` to generate defaults.

### Adapters

```yaml
adapters:
  disabled: []              # Agent names to skip: ["cursor", "windsurf"]
```

### Search and Embedding

```yaml
search:
  provider: bm25            # bm25 (keyword) | vector (semantic) | hybrid (both)
  maxResults: 50

embedding:
  provider: tfidf           # tfidf (local, no API) | ollama (local GPU) | openai (cloud)
  dimensions: 512
  openai:
    model: text-embedding-3-small
    baseUrl: https://api.openai.com/v1
  ollama:
    baseUrl: http://127.0.0.1:11434
    model: nomic-embed-text
```

### Memory and Sync

```yaml
memory:
  databasePath: .sherpa/memory.sqlite
  workspaceIsolation: true

sync:
  indexSourceFiles: false    # Set true to index JS/TS source files (up to 50 files)
```

### MCP Server

```yaml
mcp:
  enabled: false
  transport: stdio           # stdio | http
  port: 8787
```

Configure your agent to connect:
```json
{
  "mcpServers": {
    "sherpa": {
      "command": "sherpa",
      "args": ["serve", "--allow-write"]
    }
  }
}
```

### Audit Trail

```yaml
audit:
  enabled: true
  jsonlRotation: monthly     # monthly | daily | none
  integrityChecksOnStartup: false
```

Audit events are hash-chained (SHA-256) and mirrored to `.sherpa/audit/YYYY-MM.jsonl`. Run `sherpa sync` with `integrityChecksOnStartup: true` to verify chain integrity.

### Privacy and Security

```yaml
privacy:
  redactSecrets: true        # Scan for secrets during sync/validate (9 detection rules)
  allowTelemetry: false      # Privacy master switch for telemetry

security:
  requireTlsForRemoteProviders: true
  allowedHosts: []           # Restrict remote embedding provider hosts
```

### Telemetry

```yaml
telemetry:
  enabled: false             # Operational toggle (default: off)
  endpoint: https://us.i.posthog.com/batch
  apiKey: ''
  batchSize: 25
  flushIntervalSeconds: 300
```

Collection requires **both** `telemetry.enabled` and `privacy.allowTelemetry` to be true. See [docs/telemetry.md](docs/telemetry.md) for full transparency on what is collected.

---

## Skills System

Skills are reusable workflow definitions stored as `SKILL.md` files with YAML frontmatter:

```markdown
---
name: api-contract-hygiene
description: Enforce consistent API schema, versioning, and error handling.
version: 1.0.0
tags: [api, backend, rest]
triggers: [endpoint, api, route, schema]
---

## Instructions

Before merging any API change:
1. Verify OpenAPI schema is updated...
2. Error responses use standard envelope...
```

Skills are automatically included in generated adapter files and matched against search queries by trigger keywords.

---

## Secret Scanning

Sherpa scans content for 9 secret patterns during `sync` and `validate`:

| Pattern | Example |
|---------|---------|
| AWS Access Key ID | `AKIA2CJXQZ5ABCD1234F` |
| Private key blocks | `-----BEGIN PRIVATE KEY-----` |
| Password assignments | `password=mySecret` |
| API key assignments | `api_key=sk_live_abc` |
| JSON secret fields | `"password": "..."` |
| MongoDB URIs | `mongodb+srv://user:pass@host` |
| GitHub PATs | `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| Bearer tokens | `Bearer eyJhbGciOiJIUzI1NiJ9...` |
| High-entropy hex strings | Quoted strings with 32+ hex chars |

When `privacy.redactSecrets` is enabled (default), warnings are logged during `sync` and `validate`.

---

## Search Capabilities

| Mode | Algorithm | Best For | Network Required |
|------|-----------|----------|-----------------|
| **bm25** | SQLite FTS5 with BM25 ranking | Exact keyword matching | No |
| **vector** | Cosine similarity on dense embeddings | Semantic/meaning-based queries | Only with OpenAI/Ollama providers |
| **hybrid** | BM25 + Vector with Reciprocal Rank Fusion | Best overall accuracy | Only with OpenAI/Ollama providers |

Default is `bm25` (no network, fast). Switch to `hybrid` in config and run `sherpa sync` to compute embeddings.

---

## MCP Integration

Sherpa provides a Model Context Protocol server for live agent interaction:

```bash
sherpa serve --allow-write
```

**Tools exposed:**

| Tool | Description | Auth |
|------|-------------|------|
| `memory_read` | Retrieve a memory entry by ID | Session token |
| `memory_search` | Search memory with filters and modes | Session token |
| `memory_write` | Create/update entries (requires `--allow-write`) | Session token + write flag |

The session token is generated on startup and returned during MCP initialization. Authentication happens before any audit logging to prevent unauthorized writes to the integrity chain.

---

## Architecture

```
                          +----------------------+
    Developer ----------> |     sherpa CLI       |
                          |  (Commander.js)      |
                          +----------+-----------+
                                     |
           +-------------------------+-------------------------+
           v                         v                         v
   +---------------+        +---------------+        +---------------+
   |  core-config  |        |  core-memory  |        |  core-skills  |
   |  core-adapters|        |  core-search  |        |  core-migration|
   |  core-audit   |        |  core-telemetry|       |               |
   +-------+-------+        +-------+-------+        +-------+-------+
           |                        |                         |
           +------------------------+-------------------------+
                                    v
                          +----------------------+
                          |    infra-sqlite      |
                          |    infra-parser      |
                          |    infra-embedding   |
                          +----------------------+
```

**13 packages** with strict dependency direction: `cli-app` -> `core-*` -> `infra-*`

| Package | Purpose |
|---------|---------|
| `cli-app` | CLI entry point, 15 commands, 4 starter templates |
| `core-config` | YAML config loading, schema validation, defaults |
| `core-memory` | Memory CRUD, chunking, secret scanning |
| `core-search` | BM25, vector, hybrid search with rank fusion |
| `core-skills` | Skill discovery, validation, import |
| `core-adapters` | 6 agent adapters with registry pattern |
| `core-audit` | SHA-256 hash-chained audit logging, JSONL mirrors |
| `core-migration` | Legacy agent file parsers and import |
| `core-telemetry` | Anonymous usage metrics, PostHog integration |
| `infra-sqlite` | SQLite with WAL, FTS5, migrations, repositories |
| `infra-parser` | JS/TS regex chunker, markdown section splitter |
| `infra-embedding` | TF-IDF, OpenAI, Ollama embedding providers |
| `mcp-server` | MCP stdio server with JSON-RPC transport |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | 5-minute setup guide |
| [Architecture](docs/architecture.md) | Package boundaries and data flow |
| [Configuration Reference](docs/configuration.md) | All config options with examples |
| [Mixed-Assistant Workflows](docs/mixed-assistant-workflows.md) | Multi-agent team patterns |
| [What Sherpa Stores](docs/what-sherpa-stores.md) | Data transparency and inspection |
| [Telemetry](docs/telemetry.md) | What anonymous metrics are collected |
| [Contributing](docs/contributing.md) | How to contribute |
| [Security Policy](SECURITY.md) | Vulnerability reporting |

---

## Contributing

We welcome contributions of all kinds.

```bash
git clone https://github.com/opsera-agentic/Sherpa.git
cd Sherpa
npm ci
npm run build        # tsc -b (solution mode)
npm test             # vitest
npm run lint         # eslint
```

See [docs/contributing.md](docs/contributing.md) for the full guide.

## Roadmap

- [x] 6 agent adapters (Claude Code, Cursor, Codex CLI, Gemini CLI, Copilot, Windsurf)
- [x] Reverse sync (`sherpa pull` / `sherpa watch`)
- [x] BM25 + vector + hybrid search
- [x] MCP server with memory tools
- [x] Hash-chained audit trail
- [x] Secret scanning (9 rules)
- [x] Anonymous telemetry (opt-in)
- [x] Local usage stats dashboard
- [ ] Custom adapter SDK for community adapters
- [ ] Skill marketplace for sharing community skills
- [ ] VS Code / JetBrains extension for inline skill discovery
- [ ] Cloud sync for distributed teams (opt-in)
- [ ] Python, Go, Rust source file parsing

## License

[MIT](LICENSE)

---

<p align="center">
  Built for developers who use AI coding agents daily.
</p>
