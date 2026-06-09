import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { planAdapterOutputs } from '../lib/adapter-plan.js';
import { withTelemetry } from '../telemetry.js';

export interface AdaptCommandOptions extends LoggerOptions {
  projectRoot: string;
  agent?: string;
}

export async function runAdapt(opts: AdaptCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'adapt', async () => {
    return await _runAdapt(opts);
  });
}

async function _runAdapt(opts: AdaptCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('adapt', opts);
  const { planned, agents, disabledAdapters } = planAdapterOutputs(opts.projectRoot, opts.agent, (agent) => {
    logger.warn(
      'adapt.disabled',
      `Adapter ${agent} is disabled in config but was explicitly requested — generating anyway`,
    );
  });
  const report: Array<{ agent: string; filePath: string; valid: boolean; warnings: string[] }> = [];

  for (const plan of planned) {
    const target = path.join(opts.projectRoot, plan.filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, plan.content, 'utf8');
    report.push({
      agent: plan.agent,
      filePath: plan.filePath,
      valid: plan.valid,
      warnings: plan.warnings,
    });
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ results: report })}\n`);
  } else {
    logger.info('adapt.summary', `Generated ${report.length} adapter targets`);
    for (const row of report) {
      process.stdout.write(`${row.agent} -> ${row.filePath} (valid=${row.valid})\n`);
    }
  }

  return {
    adaptersGenerated: report.length,
    agents,
    disabledAdapters,
    validCount: report.filter((r) => r.valid).length,
    warningCount: report.reduce((sum, r) => sum + r.warnings.length, 0),
  };
}
