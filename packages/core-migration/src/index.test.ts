import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@sherpa/core-memory';
import { MigrationService } from './index.js';
import { parseCursorRules } from './parsers.js';

let tmp: string | undefined;
let memory: MemoryRepository | undefined;

afterEach(() => {
  // Close the DB before deleting tmp — Windows cannot unlink open files (EBUSY)
  memory?.close();
  memory = undefined;
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  tmp = undefined;
});

describe('core-migration', () => {
  it('imports markdown sections from CLAUDE.md', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-migrate-'));
    fs.writeFileSync(
      path.join(tmp, 'CLAUDE.md'),
      `## Intro\n\nHello\n\n## Details\n\nMore`,
      'utf8',
    );
    const dbPath = path.join(tmp, '.sherpa', 'memory.sqlite');
    memory = new MemoryRepository(dbPath);
    const svc = new MigrationService(memory);
    const report = svc.migrate({ projectRoot: tmp, from: 'claude-code' });
    expect(report.errors).toHaveLength(0);
    expect(report.entriesCreated).toBe(2);
    expect(report.checksumVerified).toBe(true);
    expect(memory.countEntries()).toBe(2);
  });

  it('supports dry runs without writing entries', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-migrate-dry-'));
    fs.writeFileSync(path.join(tmp, '.cursorrules'), 'Block one\n\nBlock two', 'utf8');
    const dbPath = path.join(tmp, '.sherpa', 'memory.sqlite');
    memory = new MemoryRepository(dbPath);
    const svc = new MigrationService(memory);
    const report = svc.migrate({ projectRoot: tmp, from: 'cursor', dryRun: true });
    expect(report.entriesCreated).toBeGreaterThan(0);
    expect(memory.countEntries()).toBe(0);
  });

  it('extracts meaningful titles from cursor rules blocks', () => {
    const drafts = parseCursorRules('Always use TypeScript strict mode.\n\nPrefer const over let.');
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.title).toBe('Always use TypeScript strict mode.');
    expect(drafts[1]!.title).toBe('Prefer const over let.');
  });

  it('falls back to generic title when block has no text', () => {
    const drafts = parseCursorRules('   \n\n   ');
    expect(drafts).toHaveLength(0);
  });

  it('records errors when source file missing', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-migrate-missing-'));
    const dbPath = path.join(tmp, '.sherpa', 'memory.sqlite');
    memory = new MemoryRepository(dbPath);
    const svc = new MigrationService(memory);
    const report = svc.migrate({ projectRoot: tmp, from: 'gemini-cli' });
    expect(report.entriesCreated).toBe(0);
    expect(report.errors.some((e) => e.includes('missing'))).toBe(true);
  });
});
