# Configuration Reference

All Sherpa settings live in `.sherpa/sherpa.config.yaml`. Run `sherpa init` to generate a default config.

## Complete Default Configuration

```yaml
adapters:
  filesystem:
    enabled: true
  git:
    enabled: true
  ide:
    enabled: true
  terminal:
    enabled: true
  http:
    enabled: true
  disabled: []                    # Agent adapter names to skip: ["cursor", "windsurf"]

sync:
  indexSourceFiles: false         # Index JS/TS source files from src/ and lib/

memory:
  databasePath: .sherpa/memory.sqlite
  workspaceIsolation: true

search:
  provider: bm25                  # bm25 | vector | hybrid
  maxResults: 50

skills:
  roots:
    - .sherpa/skills
  autoDiscover: true

embedding:
  provider: tfidf                 # tfidf | openai | ollama
  dimensions: 512
  openai:
    model: text-embedding-3-small
    baseUrl: https://api.openai.com/v1
  ollama:
    baseUrl: http://127.0.0.1:11434
    model: nomic-embed-text

mcp:
  enabled: false
  transport: stdio                # stdio | http
  port: 8787

audit:
  enabled: true
  jsonlRotation: monthly          # monthly | daily | none
  integrityChecksOnStartup: false

telemetry:
  enabled: false
  endpoint: https://us.i.posthog.com/batch
  apiKey: ""
  batchSize: 25
  flushIntervalSeconds: 300

privacy:
  redactSecrets: true
  allowTelemetry: false

security:
  requireTlsForRemoteProviders: true
  allowedHosts: []
```

## Section Details

### adapters

Controls which agent adapters run during `sherpa adapt` and `sherpa sync`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `disabled` | `string[]` | `[]` | List of adapter names to skip. Valid names: `claude-code`, `cursor`, `codex-cli`, `gemini-cli`, `copilot`, `windsurf` |

Using `--agent NAME` with `sherpa adapt` overrides the disabled list for that specific adapter (with a warning).

### sync

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `indexSourceFiles` | `boolean` | `false` | When true, indexes JS/TS files from `src/` and `lib/` (up to 50 files, excluding tests and `.d.ts`). Creates `source-chunk` entries in memory. |

### memory

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `databasePath` | `string` | `.sherpa/memory.sqlite` | Path to SQLite database (relative to project root or absolute) |
| `workspaceIsolation` | `boolean` | `true` | Isolate memory entries by workspace |

### search

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider` | `string` | `bm25` | Search algorithm: `bm25` (keyword only), `vector` (embeddings only), `hybrid` (BM25 + vector with rank fusion) |
| `maxResults` | `number` | `50` | Default maximum search results |

When `provider` is `vector` or `hybrid`, `sherpa sync` computes and persists chunk embeddings using the configured embedding provider. The default `bm25` skips embedding entirely (no network calls).

### skills

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `roots` | `string[]` | `[".sherpa/skills"]` | Directories to scan for skill definitions |
| `autoDiscover` | `boolean` | `true` | Automatically discover skills in root directories |

### embedding

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider` | `string` | `tfidf` | Embedding provider: `tfidf` (local, no API), `openai` (cloud), `ollama` (local GPU) |
| `dimensions` | `number` | `512` | Vector dimensions for TF-IDF provider |

**OpenAI settings:**

| Key | Default | Description |
|-----|---------|-------------|
| `openai.model` | `text-embedding-3-small` | OpenAI embedding model |
| `openai.baseUrl` | `https://api.openai.com/v1` | API base URL |

Requires `OPENAI_API_KEY` environment variable.

**Ollama settings:**

| Key | Default | Description |
|-----|---------|-------------|
| `ollama.baseUrl` | `http://127.0.0.1:11434` | Ollama server URL |
| `ollama.model` | `nomic-embed-text` | Ollama embedding model |

Requires a running Ollama instance.

### mcp

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable MCP server |
| `transport` | `string` | `stdio` | Transport protocol: `stdio` or `http` |
| `port` | `number` | `8787` | Port for HTTP transport |

### audit

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable hash-chained audit logging |
| `jsonlRotation` | `string` | `monthly` | JSONL file rotation: `monthly` (2026-06.jsonl), `daily` (2026-06-08.jsonl), `none` (audit.jsonl) |
| `integrityChecksOnStartup` | `boolean` | `false` | Verify audit hash chain before sync |

### telemetry

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `false` | Operational toggle for telemetry collection |
| `endpoint` | `string` | PostHog US | Remote endpoint for batched event submission |
| `apiKey` | `string` | `""` | PostHog project API key (public) |
| `batchSize` | `number` | `25` | Events buffered locally before flush |
| `flushIntervalSeconds` | `number` | `300` | Seconds between automatic flush attempts |

Collection requires **both** `telemetry.enabled` AND `privacy.allowTelemetry` to be true. Use `sherpa telemetry enable` to set both at once.

### privacy

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `redactSecrets` | `boolean` | `true` | Scan content for secrets during sync/validate |
| `allowTelemetry` | `boolean` | `false` | Privacy master switch for telemetry (must be true alongside `telemetry.enabled`) |

### security

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `requireTlsForRemoteProviders` | `boolean` | `true` | Enforce HTTPS for remote embedding providers |
| `allowedHosts` | `string[]` | `[]` | Restrict which hosts embedding providers can connect to |
