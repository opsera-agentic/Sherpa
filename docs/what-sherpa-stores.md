# What Sherpa stores

Transparency matters when AI tooling touches project knowledge. This document summarizes **what lands on disk**, **why**, and **how to inspect it**.

## High-level inventory

| Artifact | Format | Typical contents |
|----------|--------|------------------|
| `sherpa.config.yaml` | YAML | Adapter toggles, memory paths, search + embedding settings, audit/privacy/security knobs. |
| `memory.sqlite` (path configurable) | SQLite | Memory rows, chunk tables, embedding blobs/metadata, audit hash chain tables. |
| `skills/<skill>/SKILL.md` | Markdown + YAML FM | Skill metadata, instructions, triggers. |
| `decisions/` | Markdown | ADRs or narrative decisions you opt to store. |
| `adapters/` | Markdown/text | Generated intermediates / snapshots feeding exports. |
| `audit/*.jsonl` | JSON Lines | Mirror of audit events for Month partitions (UTC). |

Nothing above leaves your machine unless **you** commit it, sync via CI artifacts, or configure remote providers (embeddings, MCP transports).

## Memory entries vs chunks

- **Entries** capture logical documents (title, body, tags, classification).
- **Chunks** derive from bodies for retrieval (BM25 / optional embeddings). Updating an entry rebuilds its chunks transactionally.

## Audit trail mechanics

`core-audit` computes chained SHA-256 checksums over canonicalized payloads:

```
checksum[n] = SHA256(checksum[n-1] || '' || canonical(event[n]))
```

SQLite holds authoritative rows; JSONL mirrors aid grep-friendly investigations. Verification walks rows ordered by `(created_at, rowid)` so collisions on timestamps preserve insertion order.

## Classification labels

Memory entries carry `classification` (`public`, `internal`, `confidential`, `restricted`). These labels guide policy—not cryptographic enforcement. Operational secrecy still depends on repo access controls and avoiding prohibited content (see [SECURITY.md](../SECURITY.md)).

## Remote providers

When embedding providers call HTTP endpoints:

- Configuration references hosts (`embedding.openai.baseUrl`, `embedding.ollama.baseUrl`, …).
- `security.requireTlsForRemoteProviders` defaults conservative; expand `allowedHosts` deliberately.

Sherpa does **not** collect telemetry by default. Both `telemetry.enabled` and `privacy.allowTelemetry` default to `false`. Collection only happens when the user explicitly runs `sherpa telemetry enable`. See [telemetry.md](telemetry.md) for full transparency on what is collected.

## Inspect locally

```bash
sqlite3 .sherpa/memory.sqlite '.tables'
ls -R .sherpa/skills
cat .sherpa/sherpa.config.yaml
```

Replace paths if your config overrides `memory.databasePath`.

## Telemetry events

When telemetry is enabled (`sherpa telemetry enable`), anonymous usage events are stored in the same SQLite database in a `telemetry_events` table. Events contain only command names, durations, success/failure, OS/Node version, IDE environment, and install source. No file contents, paths, project names, or PII.

Run `sherpa stats` to inspect what has been recorded locally.

## Related docs

- [Getting started](getting-started.md)
- [Configuration Reference](configuration.md)
- [Telemetry](telemetry.md)
- [Security policy](../SECURITY.md)
