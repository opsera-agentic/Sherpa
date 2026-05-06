import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir } from '@sherpa/core-config';
import { getSkill, importSkill, listSkills } from '@sherpa/core-skills';

export interface SkillsCommandOptions extends LoggerOptions {
  projectRoot: string;
  action: 'list' | 'show' | 'import';
  name?: string;
  source?: string;
}

export async function runSkills(opts: SkillsCommandOptions): Promise<void> {
  const logger = createLogger('skills', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);

  if (opts.action === 'list') {
    const rows = listSkills(sherpaDir);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ skills: rows })}\n`);
      return;
    }
    for (const row of rows) {
      process.stdout.write(`${row.name}@${row.version} — ${row.description}\n`);
    }
    logger.debug('skills.list', `count:${rows.length}`);
    return;
  }

  if (opts.action === 'show') {
    if (!opts.name) {
      logger.error('skills.show', '--name is required');
      throw new Error('missing name');
    }
    const skill = getSkill(sherpaDir, opts.name);
    if (!skill) {
      logger.error('skills.show', `Skill ${opts.name} not found`);
      throw new Error('skill missing');
    }
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ skill })}\n`);
      return;
    }
    process.stdout.write(`${skill.name} (${skill.version})\n${skill.instructions}\n`);
    return;
  }

  if (opts.action === 'import') {
    if (!opts.source) {
      logger.error('skills.import', '--from path is required');
      throw new Error('missing source');
    }
    const resolved = path.resolve(opts.projectRoot, opts.source);
    importSkill(resolved, sherpaDir);
    logger.info('skills.import', `Imported ${resolved}`);
    if (!opts.json) {
      process.stdout.write(`Imported skill from ${resolved}\n`);
    }
  }
}
