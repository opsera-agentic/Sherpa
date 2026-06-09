# Telemetry

Sherpa can collect **anonymous usage metrics** to help us understand how the tool is used and prioritize improvements. Telemetry is **opt-in** — it is disabled by default and nothing is collected or sent until you explicitly enable it with `sherpa telemetry enable`.

## Quick Start

```bash
# Enable telemetry
sherpa telemetry enable

# Disable telemetry
sherpa telemetry disable

# See what is collected and your anonymous ID
sherpa telemetry status

# View your local usage stats
sherpa stats
```

## What We Collect

When telemetry is enabled, each CLI command invocation records:

| Field | Example | Purpose |
|-------|---------|---------|
| Command name | `sync`, `adapt`, `diff`, `search` | Know which features are used |
| Success/failure | `true` / `false` | Identify reliability issues |
| Duration (ms) | `342` | Find performance bottlenecks |
| CLI version | `0.1.0` | Track adoption of new versions |
| Node.js version | `v22.0.0` | Know which runtimes to support |
| OS platform | `darwin`, `linux`, `win32` | Platform-specific priorities |
| OS architecture | `x64`, `arm64` | Build/binary targeting |
| Anonymous machine ID | `a1b2c3d4e5f67890` | Distinguish unique installations |
| Command metadata | `{ adaptersGenerated: 6 }`, `{ changed: 2, check: true }` | Feature usage depth (counts and flags only — never paths) |

## What We NEVER Collect

- File contents, paths, or project names
- Memory entries or convention text
- Usernames, hostnames, or email addresses
- IP addresses (not logged server-side)
- Search queries or skill definitions
- Git history or commit messages
- Any personally identifiable information (PII)

## How It Works

1. **Local-first**: Events are stored in your local SQLite database first
2. **Batched**: Events are sent in batches (default: 25 events) to minimize network requests
3. **Non-blocking**: Network calls are fire-and-forget — they never slow down the CLI
4. **Resilient**: If the network is unavailable, events stay local and retry later
5. **Transparent**: Run `sherpa stats` to see exactly what has been recorded

## Anonymous Machine ID

Your anonymous ID is a truncated SHA-256 hash of your machine's hostname, username, and home directory. It cannot be reversed to identify you — it only helps us count unique installations.

Run `sherpa telemetry status` to see your anonymous ID.

## Configuration

Telemetry settings live in `.sherpa/sherpa.config.yaml`:

```yaml
telemetry:
  enabled: false          # Operational toggle (default: false)
  endpoint: https://us.i.posthog.com/batch  # PostHog endpoint
  apiKey: ''              # PostHog project API key
  batchSize: 25           # Events per flush
  flushIntervalSeconds: 300  # Seconds between flushes
privacy:
  allowTelemetry: false   # Privacy master switch (default: false)
```

Collection happens only when **both** `telemetry.enabled` and
`privacy.allowTelemetry` are true. `sherpa telemetry enable` sets both;
`sherpa telemetry disable` clears the operational toggle. Pin
`privacy.allowTelemetry: false` (e.g. via a committed config) to guarantee
telemetry can never be turned on.

## Data Retention

Local telemetry data is stored indefinitely in your SQLite database. You can purge old data by deleting the database or running `sherpa archive`.

Server-side data follows PostHog's retention policies.

## Open Source Commitment

As an open source project, we believe in transparency:

- This telemetry implementation is fully visible in our source code (`packages/core-telemetry/`)
- The exact events collected are documented above and in the code
- Telemetry is **opt-in** — disabled by default, nothing is collected until you enable it
- To enable: `sherpa telemetry enable` · to disable again: `sherpa telemetry disable`

## Self-Hosting

If you want to collect your own metrics (for a team or enterprise deployment), update the `endpoint` and `apiKey` in your config to point to your own PostHog instance or any PostHog-compatible endpoint.
