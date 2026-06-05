import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runAdapt } from './adapt.js';
import { runDiff } from './diff.js';
import { runInit } from './init.js';

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

function parseJsonLine(output: string): unknown {
  const line = output
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('{') && l.endsWith('}'));
  if (!line) {
    throw new Error(`Expected JSON line in output:\n${output}`);
  }
  return JSON.parse(line);
}

describe('runDiff', () => {
  it('shows pending changes before adapt and none after adapt', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-diff-'));
    await runInit({ projectRoot: tmp, force: false, template: 'library', verbose: false, json: true });

    const beforeAdapt = await captureStdout(() =>
      runDiff({ projectRoot: tmp, verbose: false, json: false, stat: true }),
    );
    expect(beforeAdapt).toContain('Pending changes');
    expect(beforeAdapt).toContain('CLAUDE.md');

    await runAdapt({ projectRoot: tmp, verbose: false, json: true });

    const afterAdapt = await captureStdout(() =>
      runDiff({ projectRoot: tmp, verbose: false, json: false, stat: true }),
    );
    expect(afterAdapt).toContain('No pending adapter changes');
  });

  it('detects convention edits as modified agent output', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-diff-edit-'));
    await runInit({ projectRoot: tmp, force: false, template: 'library', verbose: false, json: true });
    await runAdapt({ projectRoot: tmp, verbose: false, json: true });

    const convPath = path.join(tmp, '.sherpa', 'conventions.md');
    fs.writeFileSync(convPath, `${fs.readFileSync(convPath, 'utf8')}\n\nDIFF_MARKER_UNIQUE\n`, 'utf8');

    const jsonOut = await captureStdout(() =>
      runDiff({ projectRoot: tmp, verbose: false, json: true, stat: true }),
    );
    const parsed = parseJsonLine(jsonOut) as {
      summary: { changed: number };
      results: Array<{ status: string; filePath: string }>;
    };
    expect(parsed.summary.changed).toBeGreaterThan(0);
    expect(parsed.results.some((r) => r.filePath === 'CLAUDE.md' && r.status === 'modified')).toBe(true);
  });

  it('supports single-agent filtering', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-diff-agent-'));
    await runInit({ projectRoot: tmp, force: false, template: 'library', verbose: false, json: true });

    const jsonOut = await captureStdout(() =>
      runDiff({ projectRoot: tmp, agent: 'claude-code', verbose: false, json: true, stat: true }),
    );
    const parsed = parseJsonLine(jsonOut) as { results: Array<{ agent: string }> };
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.agent).toBe('claude-code');
  });
});
