# Getting started (5 minutes)

Sherpa gives AI coding agents a **portable project brain**: conventions, skills, and searchable memory live under `.sherpa/`, then sync into each tool's native instruction files.

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

**Already have agent files?** If your project has existing `CLAUDE.md`, `.cursorrules`, or other agent instruction files, `sherpa init` detects them and automatically imports their content into `conventions.md` — no manual migration needed:

```
Imported 2 existing agent file(s) into .sherpa/conventions.md — review and edit as needed.
```

Review `.sherpa/conventions.md` after init to verify the imported content looks right, then edit freely.

## 3. Sync sources into memory

```bash
sherpa sync
```

This replays Sherpa-managed sources into memory and refreshes derived snapshots used by adapters.

## 4. Adapt for your agents

After editing `.sherpa/conventions.md`, preview pending agent file changes **before** overwriting anything:

```bash
sherpa diff --stat              # summary: which files would change
sherpa diff --agent claude-code # unified diff for one adapter
sherpa diff --check             # CI gate — exit 1 when changes are pending
```

`sherpa diff` is read-only: it generates adapter output in memory and compares it to on-disk files. It never writes agent files.

When the preview looks right, apply the changes:

```bash
sherpa adapt
```

Sherpa writes agent-specific files (for example `CLAUDE.md`, `.cursorrules`, `AGENTS.md`) based on your `conventions.md`. This **overwrites** the output files, so always treat `conventions.md` as the source of truth and avoid editing agent files directly.

Run `sherpa diff --stat` again after `adapt` — you should see *No pending adapter changes*.

## 5. Reverse-sync agent files back into conventions.md

If a teammate edits an agent file directly (instead of going through `conventions.md`), pull those changes back:

```bash
# Pull all agent files at once
sherpa pull

# Pull a specific agent file
sherpa pull --from claude-code
sherpa pull --from cursor
```

Each agent's content is written into a clearly marked, per-file block in `conventions.md`. Running `pull` again updates only that block — no duplicates.

## 6. Watch for changes automatically

Instead of running `pull` manually, start the file watcher to sync automatically whenever an agent file is saved:

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

Run this in a background terminal during active development sessions.

## 7. Search and iterate

```bash
sherpa search "Where do we document deployment?"
sherpa status
```

Use **`sherpa --help`** and **`sherpa <command> --help`** for flags (`--project-root`, `--json`, `--verbose`).

## 8. Validate your setup

```bash
sherpa validate
```

Checks for missing files, duplicate imports, secrets in conventions, and oversized documents.

## 9. Optional: enable telemetry

Help improve Sherpa by sharing anonymous usage metrics:

```bash
sherpa telemetry enable     # Opt in
sherpa telemetry status     # See what's collected
sherpa stats                # View your local usage dashboard
```

No file contents, paths, or personal data are ever collected. See [telemetry.md](telemetry.md) for full details.

## Next steps

- Read [configuration.md](configuration.md) for all config options.
- Read [architecture.md](architecture.md) for package boundaries.
- Read [mixed-assistant-workflows.md](mixed-assistant-workflows.md) if multiple agents touch the same repo.
- Read [what-sherpa-stores.md](what-sherpa-stores.md) before storing sensitive material.
