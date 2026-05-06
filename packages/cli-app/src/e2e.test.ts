import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@sherpa/core-audit';
import { loadSherpaConfig, getSherpaDir, getSherpaConfigPath } from '@sherpa/core-config';
import { MemoryRepository, MemoryService } from '@sherpa/core-memory';
import { SearchService } from '@sherpa/core-search';

import { createSherpaProgram } from './index.js';

/** Commander `from: 'user'` expects argv without the node executable path. */
function sherpaArgv(projectRoot: string, args: string[]): string[] {
  return ['--project-root', projectRoot, ...args];
}

async function runSherpaCaptureStdout(projectRoot: string, args: string[]): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  });
  try {
    await createSherpaProgram().parseAsync(sherpaArgv(projectRoot, args), { from: 'user' });
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
}

describe('Sherpa CLI E2E', () => {
  const roots: string[] = [];

  function tempProject(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sherpa-e2e-'));
    roots.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of roots.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Flow 1 — first-time setup', () => {
    it('creates workspace layout, sqlite db, and valid config', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      const sherpaDir = getSherpaDir(root);
      expect(existsSync(sherpaDir)).toBe(true);
      expect(existsSync(join(sherpaDir, 'skills'))).toBe(true);
      expect(existsSync(join(sherpaDir, 'decisions'))).toBe(true);
      expect(existsSync(join(sherpaDir, 'adapters'))).toBe(true);
      expect(existsSync(join(sherpaDir, 'audit'))).toBe(true);
      expect(existsSync(join(sherpaDir, 'conventions.md'))).toBe(true);
      expect(existsSync(getSherpaConfigPath(root))).toBe(true);

      const cfg = loadSherpaConfig(root);
      expect(cfg.memory.databasePath).toBeTruthy();

      const dbPath = join(root, cfg.memory.databasePath);
      expect(existsSync(dbPath)).toBe(true);

      const memory = new MemoryRepository(dbPath);
      try {
        const row = memory.getDatabase().prepare(`PRAGMA integrity_check`).get() as { integrity_check: string };
        expect(row.integrity_check).toBe('ok');
      } finally {
        memory.close();
      }

      expect(() => loadSherpaConfig(root)).not.toThrow();
    });
  });

  describe('Flow 2 — switching agents (adapt)', () => {
    it('writes agent files including conventions from disk', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      const convPath = join(getSherpaDir(root), 'conventions.md');
      writeFileSync(
        convPath,
        `${readFileSync(convPath, 'utf8')}\n\nE2E_ADAPT_MARKER_CONVENTIONS\n`,
        'utf8',
      );
      writeFileSync(join(getSherpaDir(root), 'decisions', 'adr-001.md'), 'E2E_ADAPT_MARKER_DECISION', 'utf8');

      await createSherpaProgram().parseAsync(sherpaArgv(root, ['adapt']), { from: 'user' });

      const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
      const cursor = readFileSync(join(root, '.cursorrules'), 'utf8');
      expect(claude).toContain('E2E_ADAPT_MARKER_CONVENTIONS');
      expect(cursor).toContain('E2E_ADAPT_MARKER_CONVENTIONS');

      expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('E2E_ADAPT_MARKER_CONVENTIONS');
    });
  });

  describe('Flow 3 — search', () => {
    it('BM25 via CLI finds seeded chunks and paging via SearchService is stable', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      const cfg = loadSherpaConfig(root);
      const dbPath = join(root, cfg.memory.databasePath);
      const memory = new MemoryRepository(dbPath);

      const needle = 'E2E_SEARCH_UNIQUE_NEEDLE_QZW911';

      for (let i = 0; i < 8; i++) {
        memory.upsertEntry({
          workspace_id: 'default',
          type: 'note',
          title: `note-${i}`,
          body: `Lorem ipsum batch ${i}.\n\n${i === 3 ? needle + ' highlighted passage.' : 'other filler prose.'}`,
          tags: [],
          classification: 'internal',
        });
      }
      memory.close();

      const jsonOut = await runSherpaCaptureStdout(root, ['--json', 'search', needle, '--mode', 'bm25']);
      const parsed = JSON.parse(jsonOut.trim()) as { hits: Array<{ title: string; snippet: string }> };
      expect(parsed.hits.length).toBeGreaterThan(0);
      const hitBodies = parsed.hits.map((h) => `${h.title} ${h.snippet}`).join(' ');
      expect(hitBodies).toContain('highlighted');

      const mem2 = new MemoryRepository(dbPath);
      try {
        const search = new SearchService(mem2.getDatabase());
        const wide = await search.search('Lorem', { mode: 'bm25', limit: 20, offset: 0 });
        expect(wide.length).toBeGreaterThanOrEqual(4);

        const pageSize = 2;
        const p1 = await search.search('Lorem', { mode: 'bm25', limit: pageSize, offset: 0 });
        const p2 = await search.search('Lorem', { mode: 'bm25', limit: pageSize, offset: pageSize });
        const ids1 = new Set(p1.map((h) => h.id));
        const ids2 = new Set(p2.map((h) => h.id));
        for (const id of ids2) {
          expect(ids1.has(id)).toBe(false);
        }
      } finally {
        mem2.close();
      }
    });
  });

  describe('Flow 4 — skills', () => {
    it('discovers a skill folder with SKILL.md', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      const skillDir = join(getSherpaDir(root), 'skills', 'demo-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        `---
name: demo-skill
description: Demonstrates CLI discovery
version: 1.0.0
tags: [e2e]
---

Follow these steps when testing.`,
        'utf8',
      );

      const out = await runSherpaCaptureStdout(root, ['--json', 'skills', 'list']);
      const parsed = JSON.parse(out.trim()) as {
        skills: Array<{ name: string; description: string }>;
      };
      const skill = parsed.skills.find((s) => s.name === 'demo-skill');
      expect(skill?.description).toContain('CLI discovery');
    });
  });

  describe('Flow 5 — migration', () => {
    it('imports CLAUDE.md sections into memory', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      writeFileSync(
        join(root, 'CLAUDE.md'),
        `## Intro\n\nMigrate intro body UNIQUE_MIGRATE_ALPHA\n\n## Details\n\nSecond section UNIQUE_MIGRATE_BETA\n`,
        'utf8',
      );

      const cfg = loadSherpaConfig(root);
      const dbPath = join(root, cfg.memory.databasePath);
      const before = new MemoryRepository(dbPath);
      const countBefore = before.countEntries();
      before.close();

      const migrateJson = await runSherpaCaptureStdout(root, ['--json', 'migrate', '--from', 'claude-code']);
      const report = JSON.parse(migrateJson.trim()) as { entriesCreated: number };
      expect(report.entriesCreated).toBeGreaterThanOrEqual(2);

      const after = new MemoryRepository(dbPath);
      try {
        expect(after.countEntries()).toBeGreaterThanOrEqual(countBefore + report.entriesCreated);
        const rows = after
          .getDatabase()
          .prepare(`SELECT body FROM MEMORY_ENTRIES WHERE body LIKE '%UNIQUE_MIGRATE_%'`)
          .all() as Array<{ body: string }>;
        const blob = rows.map((r) => r.body).join('\n');
        expect(blob).toContain('UNIQUE_MIGRATE_ALPHA');
        expect(blob).toContain('UNIQUE_MIGRATE_BETA');
      } finally {
        after.close();
      }
    });
  });

  describe('Flow 6 — secret scanner', () => {
    it('blocks AWS-key-shaped content then accepts clean bodies', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      const cfg = loadSherpaConfig(root);
      const dbPath = join(root, cfg.memory.databasePath);
      const memory = new MemoryRepository(dbPath);
      const audit = new AuditService(memory.getDatabase(), root);
      const svc = new MemoryService(memory.getDatabase(), audit);

      expect(() =>
        svc.createMemoryEntry({
          type: 'secret-test',
          title: 'bad',
          body: 'Use key AKIAIOSFODNN7EXAMPLE for nothing.',
          classification: 'internal',
        }),
      ).toThrow(/Secret scanning rejected/);

      const entry = svc.createMemoryEntry({
        type: 'secret-test',
        title: 'good',
        body: 'Routine documentation without credential-like strings.',
        classification: 'internal',
      });
      expect(entry.id).toHaveLength(36);

      memory.close();
    });
  });

  describe('Flow 7 — audit chain', () => {
    it('chains hashes across create, update, and archive', async () => {
      const root = tempProject();
      await createSherpaProgram().parseAsync(sherpaArgv(root, ['init']), { from: 'user' });

      const cfg = loadSherpaConfig(root);
      const dbPath = join(root, cfg.memory.databasePath);
      const memory = new MemoryRepository(dbPath);
      const audit = new AuditService(memory.getDatabase(), root);
      const svc = new MemoryService(memory.getDatabase(), audit);

      const entry = svc.createMemoryEntry({
        type: 'audit-flow',
        title: 'audit-target',
        body: 'Initial revision.',
        classification: 'internal',
      });

      svc.updateMemoryEntry(entry.id, { body: 'Second revision.' });
      svc.archiveMemoryEntry(entry.id);

      const verification = audit.verify();
      expect(verification.valid).toBe(true);
      expect(verification.errors).toHaveLength(0);

      const rows = memory
        .getDatabase()
        .prepare(`SELECT checksum, prev_checksum FROM AUDIT_EVENTS ORDER BY created_at ASC`)
        .all() as Array<{ checksum: string; prev_checksum: string }>;
      expect(rows.length).toBeGreaterThanOrEqual(3);

      let prev = '';
      for (const row of rows) {
        expect(row.prev_checksum).toBe(prev);
        expect(row.checksum.length).toBe(64);
        prev = row.checksum;
      }

      memory.close();
    });
  });
});
