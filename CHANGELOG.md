# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

Initial release of Sherpa — portable context management for AI coding agents.

### Added

- **CLI (`@sherpa/cli-app`)** — Commander.js entry point exposing the full command set:
  `init`, `sync`, `adapt`, `pull`, `search`, `validate`, `status`, `migrate`,
  `archive`, `skills`, `serve`, `watch`, and related subcommands.
- **Memory (`core-memory`)** — Memory entry CRUD with classification levels and
  optional secret scanning on writes.
- **Search (`core-search`)** — BM25, vector, and hybrid search over indexed memory chunks.
- **Skills (`core-skills`)** — Skill loading and management from `.sherpa/skills/`.
- **Adapters (`core-adapters`)** — Adapter framework with built-in support for multiple
  agents (Claude, Cursor, Windsurf, Copilot, Gemini, and more) plus `sherpa adapt`
  generation and validation.
- **Migration (`core-migration`)** — Import context from existing agent configurations.
- **Audit (`core-audit`)** — Hash-chained audit logging with append-only JSONL mirrors.
- **Telemetry (`core-telemetry`)** — Opt-in anonymous usage metrics behind a dual-switch
  privacy model (`telemetry.enabled` + `privacy.allowTelemetry`).
- **Persistence (`infra-sqlite`)** — SQLite storage with FTS5 indexing and schema migrations.
- **Parsing (`infra-parser`)** — AST-aware code chunking.
- **Embeddings (`infra-embedding`)** — Pluggable embedding providers (TF-IDF, Ollama, OpenAI).
- **MCP server (`mcp-server`)** — MCP stdio server exposing `memory_read`, `memory_write`,
  and `memory_search` tools with session-token auth and audit logging.

[Unreleased]: https://github.com/opsera-agentic/Sherpa/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/opsera-agentic/Sherpa/releases/tag/v0.1.0
