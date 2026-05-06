# Getting started (5 minutes)

Sherpa gives AI coding agents a **portable project brain**: conventions, skills, and searchable memory live under `.sherpa/`, then sync into each tool’s native instruction files.

## 1. Install the CLI

```bash
npm install -g @sherpa/cli-app
```

Verify Node 22+ (`node -v`).

## 2. Initialize a repository

```bash
cd /path/to/your/repo
sherpa init
```

Optional templates tune conventions and starter skills:

```bash
sherpa init --template web-app   # or library | cli-tool | monorepo
```

You should see `.sherpa/` with `sherpa.config.yaml`, `conventions.md`, `skills/`, and a SQLite database path declared in config.

## 3. Sync sources into memory

```bash
sherpa sync
```

This replays Sherpa-managed sources into memory and refreshes derived snapshots used by adapters.

## 4. Adapt for your agents

```bash
sherpa adapt
```

Sherpa writes agent-specific files (for example `CLAUDE.md`, `.cursorrules`, `AGENTS.md`) based on your workspace contents.

## 5. Search and iterate

```bash
sherpa search "Where do we document deployment?"
sherpa status
```

Use **`sherpa --help`** and **`sherpa <command> --help`** for flags (`--project-root`, `--json`, `--verbose`).

## Next steps

- Read [architecture.md](architecture.md) for package boundaries.
- Read [mixed-assistant-workflows.md](mixed-assistant-workflows.md) if multiple agents touch the same repo.
- Read [what-sherpa-stores.md](what-sherpa-stores.md) before storing sensitive material.
