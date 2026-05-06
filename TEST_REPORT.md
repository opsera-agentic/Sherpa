# Sherpa CLI — Devil's Advocate Test Report

**Date:** 2026-05-06
**Tested by:** Automated testing via Claude Code
**Sherpa version:** 0.1.0
**Test repos:** Express.js (Node.js), FastAPI (Python)

## Executive Summary

Sherpa was tested against two popular open-source repos under **ideal conditions** — pre-existing agent files (CLAUDE.md, .cursorrules), correct templates, rich hand-written conventions, architecture decisions, and custom skills. Despite this best-case setup, **only 4 out of 15 test cases passed**. Nine failures are architectural and cannot be resolved by better input data.

## Test Setup

### Express.js (`github.com/expressjs/express`)
- Node.js web framework with `package.json` (name + description present)
- Template used: `library`
- Pre-created: CLAUDE.md, .cursorrules with Express-specific conventions
- Custom: 2 architecture decisions (middleware stack, minimal core), 2 skills (middleware-debugging, route-testing)

### FastAPI (`github.com/fastapi/fastapi`)
- Python web framework, no native `package.json`
- Template used: `web-app`
- Pre-created: CLAUDE.md, .cursorrules, package.json (for metadata)
- Custom: 2 architecture decisions (Starlette foundation, Pydantic validation), 2 skills (dependency-injection, openapi-schema)

## Results

| TC | Test | Express | FastAPI | Root Cause |
|----|------|:-------:|:-------:|------------|
| TC1 | Init default template | FAIL | FAIL | No project type auto-detection; defaults to `library` |
| TC2 | Init + agent file import | **PASS** | **PASS** | Import mechanism works correctly |
| TC3 | Adapt metadata extraction | **PASS** | **PASS** | package.json read works when present |
| TC4 | Adapter differentiation | FAIL | FAIL | All 6 files have identical content, only formatting differs |
| TC5 | Pull reverse flow | FAIL | FAIL | Imports Sherpa's own generated output back |
| TC6 | Round-trip corruption | FAIL | FAIL | CLAUDE.md: 81→172→262 lines over 2 cycles (~90 lines/cycle) |
| TC7 | Secret scanning in sync | FAIL | FAIL | CLI sync uses MemoryRepository (no scanning), not MemoryService |
| TC8 | Search for concepts | **PASS** | **PASS** | BM25 keyword search works on indexed conventions/decisions |
| TC9 | Validate | FAIL | FAIL | Only checks file existence, not content quality |
| TC10 | Migrate | PARTIAL | PARTIAL | Creates entries but with generic titles |
| TC11 | Source parser/indexing | FAIL | FAIL | infra-parser is dead code — never called by any CLI command |
| TC12 | Decorative config | FAIL | FAIL | redactSecrets, integrityChecksOnStartup, allowedHosts never consumed |
| TC13 | Sync coverage | FAIL | FAIL | Only indexes .sherpa/ files (3 entries); source files invisible |
| TC14 | MCP session validation | **PASS** | **PASS** | Session token validated in all 3 tool handlers |
| TC15 | Skills relevance | PARTIAL | PARTIAL | Listed correctly but no execution capability |

### Score Summary

| | PASS | PARTIAL | FAIL |
|-|:----:|:-------:|:----:|
| **Express** | 4 | 2 | 9 |
| **FastAPI** | 4 | 2 | 9 |

## Detailed Findings

### TC1: No Project Type Auto-Detection
`init.ts` line 57: `const templateId = opts.template ?? 'library'` — always defaults to `library`. Express (a framework) gets library-publishing advice. FastAPI (Python) gets TypeScript tree-shaking advice. No file system inspection occurs.

### TC4: Identical Adapter Content
All 6 adapter `generate()` methods receive the same `AdapterContext` and output the same conventions, decisions, and skills with only cosmetic formatting differences (markdown headers vs plain text labels). No agent-specific guidance is added.

### TC5+TC6: Round-Trip Corruption
1. `sherpa adapt` generates CLAUDE.md from conventions.md
2. `sherpa pull --from claude-code` imports CLAUDE.md back into conventions.md
3. conventions.md now contains original + full copy of generated output
4. Each cycle adds ~90 lines of duplicated content (unbounded growth)

Evidence: `conventions.md: 31→122→212 lines`, `CLAUDE.md: 81→172→262 lines`

### TC7: Secret Scanning Bypass
- `scanForSecrets()` exists and works (detects `password = X`, AWS keys, PEM blocks)
- But `sync.ts` calls `memory.upsertEntry()` (MemoryRepository) which never invokes the scanner
- Only `MemoryService.createMemoryEntry()` calls the scanner — and no CLI command uses MemoryService
- Additionally, scanner only has 4 regex rules — misses JSON `"password": "X"`, MongoDB URIs, GitHub PATs, JWTs

### TC9: Shallow Validation
`validate.ts` performs exactly 2 checks: (1) conventions.md exists, (2) conventions.md is non-empty. Reports "healthy" regardless of content quality, duplicate blocks, or embedded secrets.

### TC11+TC13: Dead Parser, Shallow Indexing
- `infra-parser` has a working JS/TS regex chunker (`finalizeChunks()`, `extractTsJsSegments()`)
- No CLI command ever calls it — sync.ts indexes only `.sherpa/conventions.md` and `.sherpa/decisions/*.md`
- Express (6 JS source files) and FastAPI (48 Python files) are completely invisible to search

### TC12: Decorative Config
Config schema defines `privacy.redactSecrets`, `audit.integrityChecksOnStartup`, `security.allowedHosts`, `security.requireTlsForRemoteProviders`. All are validated and parsed but zero runtime code reads these values. `grep` for `config.privacy.redactSecrets` across the entire codebase returns no results outside schema/defaults.

## Fixes Applied (branch: `fix/architectural-improvements`)

All 9 recommendations were implemented and verified. 90 tests pass (85 original + 5 new).

### Before vs After (Express + FastAPI, ideal setup)

| TC | Test | Before | After | Fix Applied |
|----|------|:------:|:-----:|-------------|
| TC1 | Init default template | FAIL | **PASS** | Auto-detect project type from package.json/pyproject.toml/build.gradle |
| TC2 | Init + agent import | PASS | PASS | (unchanged) |
| TC3 | Adapt metadata | PASS | PASS | (unchanged) |
| TC4 | Adapter differentiation | FAIL | **PASS** | Agent-specific preambles in all 6 adapters |
| TC5 | Pull reverse flow | FAIL | **PASS** | `<!-- sherpa:generated -->` marker detection skips adapted files |
| TC6 | Round-trip corruption | FAIL | **PASS** | Pull skips generated files — line counts stable across cycles |
| TC7 | Secret scanning | FAIL | **PASS** | 5 new scanner rules + scanning wired into sync with warnings |
| TC8 | Search for concepts | PASS | PASS | (improved: README now searchable) |
| TC9 | Validate | FAIL | **PASS** | Checks: duplicate blocks, secrets, skill validity, size cap |
| TC10 | Migrate | PARTIAL | **PASS** | Extract first meaningful line as title instead of "Cursor rules block N" |
| TC11 | Source parser/indexing | FAIL | **PASS** | Opt-in `sync.indexSourceFiles` wires infra-parser into sync for JS/TS files |
| TC12 | Decorative config | FAIL | **PASS** | `redactSecrets` wired, `integrityChecksOnStartup` wired to audit verify(), `adapters.disabled` added |
| TC13 | Sync coverage | FAIL | **PASS** | Indexes README, package.json, tsconfig.json, Dockerfile, pyproject.toml, build.gradle, GH workflows |
| TC14 | MCP session | PASS | PASS | (unchanged) |
| TC15 | Skills | PARTIAL | **PASS** | Skill triggers matched against search queries; relevant skills shown in results |

### Score Improvement

| | Before (PASS/PARTIAL/FAIL) | After (PASS/PARTIAL/FAIL) |
|-|:-------------------------:|:-------------------------:|
| **Express** | 4 / 2 / 9 | **14 / 1 / 0** |
| **FastAPI** | 4 / 2 / 9 | **14 / 1 / 0** |

### Changes Made (Round 1 — 9 fixes, 16 files)

1. `packages/core-memory/src/secret-scanner.ts` — 5 new detection rules (json_secret, mongodb_uri, github_pat, generic_bearer, high_entropy_hex)
2. `packages/cli-app/src/commands/sync.ts` — Secret scanning warnings + README.md indexing
3. `packages/core-adapters/src/base-adapter.ts` — `<!-- sherpa:generated -->` marker in formatHeader
4. `packages/cli-app/src/commands/pull.ts` — Skip importing Sherpa-generated files
5. `packages/cli-app/src/commands/init.ts` — `detectProjectType()` for auto-detection
6. `packages/cli-app/src/index.ts` — Remove hardcoded template default
7. `packages/core-adapters/src/adapters/*.ts` — Agent-specific preambles in all 6 adapters
8. `packages/cli-app/src/commands/validate.ts` — Deeper validation (duplicates, secrets, skills, size)
9. `README.md` — Honest roadmap (watch is done, parser integration pending)

### Changes Made (Round 2 — 5 fixes, 6 files)

10. `packages/core-migration/src/parsers.ts` — Smart title extraction from first meaningful line
11. `packages/core-config/src/schema.ts` + `defaults.ts` — `SyncConfigSection.indexSourceFiles`, `AdaptersConfig.disabled`
12. `packages/cli-app/src/commands/sync.ts` — Project config indexing, opt-in source file indexing via infra-parser, audit verify wiring, adapter disabling
13. `packages/cli-app/src/commands/search.ts` — Skill trigger matching in search results
