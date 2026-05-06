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

Sherpa does **not** ship customer telemetry by default (`privacy.allowTelemetry` defaults off in generated configs).

## Inspect locally

```bash
sqlite3 .sherpa/memory.sqlite '.tables'
ls -R .sherpa/skills
cat .sherpa/sherpa.config.yaml
```

Replace paths if your config overrides `memory.databasePath`.

## Related docs

- [Getting started](getting-started.md)
- [Security policy](../SECURITY.md)
