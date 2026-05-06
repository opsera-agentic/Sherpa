# Mixed-assistant workflows

Modern teams rarely standardize on a single AI assistant. Sherpa is built around **one canonical `.sherpa/` workspace** that fans out to multiple agent formats.

## Golden rules

1. **Treat `.sherpa/` as source**: Conventions, ADRs, and skills should be authored here—not duplicated silos per agent.
2. **Run `sync` before context-heavy work**: Keeps memory aligned with disk after substantive edits.
3. **`adapt` per agent switch**: Regenerate agent-local snapshots whenever skills or conventions change materially.
4. **Avoid forked narratives**: If Cursor and Claude diverge, reconcile upstream in `.sherpa/decisions/` instead of editing generated files only.

## Pattern A — primary author + secondary reviewer

**Scenario:** Engineers primarily use Cursor but reviewers paste snippets into Claude Code.

1. Maintain authoritative markdown under `.sherpa/` (skills + conventions).
2. `sherpa sync && sherpa adapt` on PR branches touching agent context.
3. Commit `.sherpa/` changes; treat agent-specific exports as **generated artifacts** when your policy allows, or regenerate locally without committing them.

## Pattern B — sequential handoff

**Scenario:** Research in Gemini CLI, implementation in Codex CLI.

1. Capture durable findings as memory entries or ADRs (`decisions/`) instead of chat-only text.
2. After research phase: `sherpa sync` so BM25 / hybrid search surfaces facts during implementation.
3. Run `sherpa adapt` before opening the implementation agent so instruction files include updated skills.

## Pattern C — CI guardrails

**Scenario:** CI ensures agent exports stay fresh.

1. Add a job step (non-interactive) running `sherpa validate` / `sherpa sync` depending on your workflow (see CLI help).
2. Fail builds when secrets scanners trip—Sherpa rejects credential-shaped memory bodies when scanning is enabled.

## Classification hygiene

When mixing vendors, assume **widest classification wins**: do not downgrade confidential customer notes to “internal” because a specific UI hides metadata. Use Sherpa’s classification fields consistently; see [what-sherpa-stores.md](what-sherpa-stores.md).

## Related docs

- [Architecture](architecture.md) — how adapters consume the same core graph.
- [Contributing](contributing.md) — proposing workflow changes to this repo.
