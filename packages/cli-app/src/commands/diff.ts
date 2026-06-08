import fs from 'node:fs';
import path from 'node:path';

import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir } from '@sherpa/core-config';
import { planAdapterOutputs } from '../lib/adapter-plan.js';
import { diffText, type DiffStatus } from '../lib/text-diff.js';
import { withTelemetry } from '../telemetry.js';

export interface DiffCommandOptions extends LoggerOptions {
  projectRoot: string;
  agent?: string;
  stat?: boolean;
  check?: boolean;
}

export interface AdapterDiffResult {
  agent: string;
  filePath: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  valid: boolean;
  warnings: string[];
  unified?: string;
}

function readCurrentFile(projectRoot: string, filePath: string): string | null {
  const target = path.join(projectRoot, filePath);
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target, 'utf8');
}

function summarizeSources(sherpaDir: string): string[] {
  const sources: string[] = [];
  const conventions = path.join(sherpaDir, 'conventions.md');
  if (fs.existsSync(conventions)) sources.push('.sherpa/conventions.md');

  const decisionsDir = path.join(sherpaDir, 'decisions');
  if (fs.existsSync(decisionsDir)) {
    for (const file of fs.readdirSync(decisionsDir).filter((f) => f.endsWith('.md'))) {
      sources.push(`.sherpa/decisions/${file}`);
    }
  }

  const skillsDir = path.join(sherpaDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const dir of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      if (fs.existsSync(path.join(skillsDir, dir.name, 'SKILL.md'))) {
        sources.push(`.sherpa/skills/${dir.name}/SKILL.md`);
      }
    }
  }

  return sources;
}

export async function runDiff(opts: DiffCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'diff', async () => {
    return await _runDiff(opts);
  });
}

async function _runDiff(opts: DiffCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('diff', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);

  if (!fs.existsSync(sherpaDir)) {
    throw new Error('Sherpa workspace not initialized. Run `sherpa init` first.');
  }

  const { planned, agents, disabledAdapters } = planAdapterOutputs(opts.projectRoot, opts.agent, (agent) => {
    logger.warn(
      'diff.disabled',
      `Adapter ${agent} is disabled in config but was explicitly requested — diffing anyway`,
    );
  });
  const results: AdapterDiffResult[] = [];

  for (const plan of planned) {
    const current = readCurrentFile(opts.projectRoot, plan.filePath);
    const diff = diffText(current, plan.content, plan.filePath);
    results.push({
      agent: plan.agent,
      filePath: plan.filePath,
      status: diff.status,
      additions: diff.additions,
      deletions: diff.deletions,
      valid: plan.valid,
      warnings: plan.warnings,
      unified: diff.unified || undefined,
    });
  }

  const changed = results.filter((r) => r.status !== 'unchanged');
  const sources = summarizeSources(sherpaDir);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({
        sources,
        results: results.map(({ unified, ...rest }) => ({
          ...rest,
          unified: opts.stat ? undefined : unified,
        })),
        summary: {
          total: results.length,
          changed: changed.length,
          unchanged: results.length - changed.length,
        },
      })}\n`,
    );
  } else {
    process.stdout.write('Sherpa sources:\n');
    for (const source of sources) {
      process.stdout.write(`  ${source}\n`);
    }
    process.stdout.write('\n');

    if (!changed.length) {
      process.stdout.write('No pending adapter changes — agent files match `sherpa adapt` output.\n');
    } else {
      process.stdout.write(`Pending changes (${changed.length} file(s)):\n`);
      for (const row of results) {
        if (row.status === 'unchanged') {
          process.stdout.write(`  ${row.filePath.padEnd(40)} unchanged\n`);
          continue;
        }
        const label =
          row.status === 'added'
            ? `new file (+${row.additions} lines)`
            : `modified (+${row.additions} / -${row.deletions} lines)`;
        process.stdout.write(`  ${row.filePath.padEnd(40)} ${label}  [${row.agent}]\n`);
        if (row.warnings.length) {
          for (const warning of row.warnings) {
            logger.warn('diff.warning', `${row.filePath}: ${warning}`);
          }
        }
      }

      if (!opts.stat) {
        process.stdout.write('\n');
        for (const row of changed) {
          if (row.unified) {
            process.stdout.write(`${row.unified}\n\n`);
          }
        }
      } else {
        process.stdout.write('\nRun without --stat to view unified diffs.\n');
      }
    }
  }

  if (opts.check && changed.length > 0) {
    process.exitCode = 1;
  }

  logger.info('diff.summary', 'Adapter diff complete', {
    total: results.length,
    changed: changed.length,
  });

  return {
    adaptersDiffed: results.length,
    changed: changed.length,
    unchanged: results.length - changed.length,
    sourceCount: sources.length,
    agents,
    disabledAdapters,
    stat: Boolean(opts.stat),
    check: Boolean(opts.check),
    checkFailed: Boolean(opts.check && changed.length > 0),
    validCount: results.filter((r) => r.valid).length,
    warningCount: results.reduce((sum, r) => sum + r.warnings.length, 0),
    ...(opts.agent ? { agentFilter: opts.agent } : {}),
  };
}
