# Security policy

## Reporting vulnerabilities

Please report suspected vulnerabilities privately so we can fix issues before wider disclosure.

1. **Do not** open a public GitHub issue for undisclosed security defects.
2. Email or contact the maintainers through your organization’s security channel (or GitHub Security Advisories **“Report a vulnerability”** if enabled on this repository).
3. Include: affected component (`cli-app`, `core-memory`, etc.), reproduction steps, impact assessment, and any suggested patches.

We aim to acknowledge receipt within a few business days and coordinate remediation and disclosure timelines.

## What Sherpa stores and where

Sherpa keeps **project-local** artifacts under `.sherpa/` by default. Typical paths:

| Location | Purpose |
|----------|---------|
| `.sherpa/sherpa.config.yaml` | Merged configuration (adapters, search, embeddings, privacy, audit toggles). |
| `.sherpa/memory.sqlite` (path configurable) | SQLite database for memory entries, chunks, embeddings metadata, audit chain rows. |
| `.sherpa/skills/` | Skill folders (`SKILL.md` plus assets). |
| `.sherpa/decisions/` | Architecture decision records and convention hooks you maintain. |
| `.sherpa/adapters/` | Generated / staged adapter snapshots. |
| `.sherpa/audit/` | Append-only JSONL mirrors of audit events (aligned with SQLite hashes when intact). |

For more detail and diagrams, see [docs/what-sherpa-stores.md](docs/what-sherpa-stores.md).

## What must NOT be stored

Treat Sherpa-managed paths **like source control**:

- **Secrets**: API keys, OAuth tokens, private keys (RSA/ECDSA), PEM blocks, `.pem`/`.key` material, signing certificates with private halves.
- **Credentials**: Passwords, connection strings with passwords, database URLs embedding secrets.
- **Highly sensitive PII**: Government IDs, full payment card numbers, raw health records, or similarly regulated data.

Sherpa includes **optional secret scanning** on memory writes to reduce accidental commits of credential-shaped strings—but scanning is **not** a guarantee of safety and must not replace proper handling of secrets.

## Data classification

Use these tiers when labeling memory entries (`classification` field) and deciding what belongs in Sherpa:

| Level | Examples | Guidance |
|-------|-----------|-----------|
| **Public** | Published docs, open-source README excerpts | Safe to share externally; still avoid embedding secrets. |
| **Internal** | Team runbooks, architecture notes | Share within the team/org only. |
| **Confidential** | Unreleased product plans, customer-specific non-public info | Strict need-to-know; prefer redaction. |
| **Restricted** | Secrets, regulated personal data | **Do not store** in Sherpa memory or markdown skills; use vaults and secret managers. |

## `.gitignore` recommendations for public repositories

If `.sherpa/` might contain machine-specific or sensitive experimentation material, exclude at minimum:

```
node_modules/
dist/
*.tsbuildinfo
coverage/
.sherpa/memory.db
.sherpa/memory.sqlite
.env
.env.*
```

Adjust database filenames if your `memory.databasePath` differs. Never commit operator-specific tokens or customer dumps—even under “temporary” paths.
