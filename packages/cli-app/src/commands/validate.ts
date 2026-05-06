import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir } from '@sherpa/core-config';

export interface ValidateCommandOptions extends LoggerOptions {
  projectRoot: string;
}

export async function runValidate(opts: ValidateCommandOptions): Promise<void> {
  const logger = createLogger('validate', opts);
  const conventionsPath = path.join(getSherpaDir(opts.projectRoot), 'conventions.md');
  const errors: string[] = [];

  if (!fs.existsSync(conventionsPath)) {
    errors.push('conventions.md missing');
  } else if (!fs.readFileSync(conventionsPath, 'utf8').trim()) {
    errors.push('conventions.md empty');
  }

  const ok = errors.length === 0;

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ valid: ok, errors })}\n`);
    return;
  }

  if (!ok) {
    errors.forEach((err) => logger.error('validate.failed', err));
    throw new Error('validation failed');
  }

  logger.info('validate.success', 'Convention documents look healthy');
}
