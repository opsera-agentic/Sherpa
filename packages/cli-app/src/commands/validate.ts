import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir } from '@sherpa/core-config';
import { scanForSecrets } from '@sherpa/core-memory';
import { withTelemetry } from '../telemetry.js';

export interface ValidateCommandOptions extends LoggerOptions {
  projectRoot: string;
}

export async function runValidate(opts: ValidateCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'validate', async () => {
    return await _runValidate(opts);
  });
}

async function _runValidate(opts: ValidateCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('validate', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);
  const conventionsPath = path.join(sherpaDir, 'conventions.md');
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(conventionsPath)) {
    errors.push('conventions.md missing');
  } else {
    const content = fs.readFileSync(conventionsPath, 'utf8');
    if (!content.trim()) {
      errors.push('conventions.md empty');
    } else {
      // Check for duplicate import blocks
      const importStarts = content.match(/<!-- sherpa:import:[^:]+:start -->/g) ?? [];
      const seen = new Set<string>();
      for (const marker of importStarts) {
        if (seen.has(marker)) {
          errors.push(`Duplicate import block: ${marker}`);
        }
        seen.add(marker);
      }

      // Secret scanning
      const secretScan = scanForSecrets(content);
      if (secretScan.found) {
        const rules = [...new Set(secretScan.matches.map((m) => m.ruleId))].join(', ');
        warnings.push(`conventions.md may contain secrets (rules: ${rules})`);
      }

      // Size soft cap
      const byteLength = new TextEncoder().encode(content).length;
      if (byteLength > 64 * 1024) {
        warnings.push(`conventions.md is ${Math.round(byteLength / 1024)}KB — consider splitting (64KB soft cap)`);
      }
    }
  }

  // Validate decision files are non-empty
  const decisionsDir = path.join(sherpaDir, 'decisions');
  if (fs.existsSync(decisionsDir)) {
    const files = fs.readdirSync(decisionsDir).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(decisionsDir, f), 'utf8');
      if (!content.trim()) {
        warnings.push(`decisions/${f} is empty`);
      }
    }
  }

  // Validate skill directories have SKILL.md
  const skillsDir = path.join(sherpaDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of dirs) {
      const skillPath = path.join(skillsDir, d.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        warnings.push(`Skill "${d.name}" is missing SKILL.md`);
      }
    }
  }

  const ok = errors.length === 0;

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ valid: ok, errors, warnings })}\n`);
    return { valid: ok, errorCount: errors.length, warningCount: warnings.length };
  }

  warnings.forEach((w) => logger.warn('validate.warning', w));

  if (!ok) {
    errors.forEach((err) => logger.error('validate.failed', err));
    throw new Error('validation failed');
  }

  logger.info('validate.success', 'Convention documents look healthy');

  return { valid: ok, errorCount: errors.length, warningCount: warnings.length };
}
