import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSherpaDir } from '@sherpa/core-config';

interface TelemetryCall {
  projectRoot: string;
  command: string;
  metadata: Record<string, unknown> | void;
}

const telemetryCalls = vi.hoisted((): TelemetryCall[] => []);

vi.mock('../telemetry.js', () => ({
  withTelemetry: vi.fn(
    async (
      projectRoot: string,
      command: string,
      fn: () => Promise<Record<string, unknown> | void>,
    ): Promise<void> => {
      const metadata = await fn();
      telemetryCalls.push({ projectRoot, command, metadata });
    },
  ),
}));

import { runAdapt } from './adapt.js';
import { runInit } from './init.js';
import { runInspect } from './inspect.js';

interface InspectJson {
  sources: {
    conventions: { estimatedTokens: number; exists: boolean };
    decisions: { count: number };
    skills: { count: number; names: string[] };
  };
  agents: Array<{
    agent: string;
    filePath: string;
    exists: boolean;
    generatedBySherpa: boolean;
    stale: boolean;
    manualEditsDetected: boolean;
    status: string;
    estimatedTokens: number;
    updatedAt: string | null;
    sourceCoverage: { conventionsIncluded: boolean };
  }>;
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
}

describe('runInspect', () => {
  const roots: string[] = [];

  function tempProject(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-inspect-'));
    roots.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    telemetryCalls.splice(0);
    vi.restoreAllMocks();
  });

  it('reports source and generated agent metrics as JSON', async () => {
    const root = tempProject();
    await captureStdout(() => runInit({ projectRoot: root, force: false, template: 'cli-tool', verbose: false, json: true }));
    await captureStdout(() => runAdapt({ projectRoot: root, verbose: false, json: true }));

    const out = await captureStdout(() => runInspect({ projectRoot: root, verbose: false, json: true }));
    const parsed = JSON.parse(out.trim()) as InspectJson;
    const cursor = parsed.agents.find((agent) => agent.agent === 'cursor');

    expect(parsed.sources.conventions.exists).toBe(true);
    expect(parsed.sources.conventions.estimatedTokens).toBeGreaterThan(0);
    expect(parsed.sources.skills.names).toEqual(expect.arrayContaining(['cli-exit-codes', 'cli-help-ergonomics']));
    expect(parsed.agents.length).toBeGreaterThanOrEqual(6);
    expect(cursor?.filePath).toBe('.cursorrules');
    expect(cursor?.exists).toBe(true);
    expect(cursor?.generatedBySherpa).toBe(true);
    expect(cursor?.estimatedTokens).toBeGreaterThan(0);
    expect(cursor?.updatedAt).toBeTruthy();
    expect(cursor?.sourceCoverage.conventionsIncluded).toBe(true);
  });

  it('records anonymous aggregate metrics for inspect telemetry', async () => {
    const root = tempProject();
    await captureStdout(() => runInit({ projectRoot: root, force: false, template: 'cli-tool', verbose: false, json: true }));
    await captureStdout(() => runAdapt({ projectRoot: root, verbose: false, json: true }));

    await captureStdout(() => runInspect({ projectRoot: root, agent: 'cursor', verbose: false, json: true }));

    const inspectCall = telemetryCalls.filter((call) => call.command === 'inspect').at(-1);
    const metadata = inspectCall?.metadata as Record<string, unknown>;

    expect(inspectCall?.projectRoot).toBe(root);
    expect(metadata).toMatchObject({
      inspectScope: 'single-agent',
      sourcesOnly: false,
      singleAgent: true,
      conventionsPresent: true,
      agentsInspected: 1,
      missingAgents: 0,
      staleAgents: 0,
      manualEditAgents: 0,
      sourceSecretsDetected: false,
      generatedBySherpaAgents: 1,
      sourceCoverageConventionsIncluded: 1,
    });
    expect(metadata.sourceTokens).toBeGreaterThan(0);
    expect(metadata.skillCount).toBeGreaterThan(0);
    expect(metadata.agentTokens).toBeGreaterThan(0);
    expect(metadata).not.toHaveProperty('filePath');
    expect(metadata).not.toHaveProperty('agent');
    expect(metadata).not.toHaveProperty('skillNames');
  });

  it('marks generated agent files stale when conventions change after adapt', async () => {
    const root = tempProject();
    await captureStdout(() => runInit({ projectRoot: root, force: false, template: 'cli-tool', verbose: false, json: true }));
    await captureStdout(() => runAdapt({ projectRoot: root, verbose: false, json: true }));

    const conventionsPath = path.join(getSherpaDir(root), 'conventions.md');
    fs.appendFileSync(conventionsPath, '\n\nINSPECT_STALE_MARKER\n', 'utf8');

    const out = await captureStdout(() =>
      runInspect({ projectRoot: root, agent: 'cursor', verbose: false, json: true }),
    );
    const parsed = JSON.parse(out.trim()) as InspectJson;

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0]?.agent).toBe('cursor');
    expect(parsed.agents[0]?.stale).toBe(true);
  });

  it('detects direct edits to generated agent files', async () => {
    const root = tempProject();
    await captureStdout(() => runInit({ projectRoot: root, force: false, template: 'cli-tool', verbose: false, json: true }));
    await captureStdout(() => runAdapt({ projectRoot: root, verbose: false, json: true }));

    fs.appendFileSync(
      path.join(root, 'CLAUDE.md'),
      '\n\n## Manual Test Note\n\nThis was added directly to the generated file.\n',
      'utf8',
    );

    const out = await captureStdout(() =>
      runInspect({ projectRoot: root, agent: 'claude-code', verbose: false, json: true }),
    );
    const parsed = JSON.parse(out.trim()) as InspectJson;

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0]?.agent).toBe('claude-code');
    expect(parsed.agents[0]?.manualEditsDetected).toBe(true);
    expect(parsed.agents[0]?.status).toBe('manual_edit');
  });

  it('prints detailed human diagnostics and summary', async () => {
    const root = tempProject();
    await captureStdout(() => runInit({ projectRoot: root, force: false, template: 'cli-tool', verbose: false, json: true }));
    await captureStdout(() => runAdapt({ projectRoot: root, verbose: false, json: true }));

    const out = await captureStdout(() => runInspect({ projectRoot: root, agent: 'cursor', verbose: false, json: false }));

    expect(out).toContain('skill_names: cli-exit-codes, cli-help-ergonomics');
    expect(out).toContain('generated_by_sherpa: yes');
    expect(out).toContain('source_coverage:');
    expect(out).toContain('    conventions: yes');
    expect(out).toContain('secrets_detected: no');
    expect(out).toContain('estimated_tokens:');
    expect(out).toContain('updated:');
    expect(out).toContain('Summary:');
    expect(out).toContain('agents inspected: 1');
  });
});
