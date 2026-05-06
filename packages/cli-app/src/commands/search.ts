import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { MemoryRepository } from '@sherpa/core-memory';
import { SearchService } from '@sherpa/core-search';
import { loadSkills } from '@sherpa/core-skills';

export interface SearchCommandOptions extends LoggerOptions {
  projectRoot: string;
  query: string;
  type?: string;
  tags?: string;
  limit?: string;
  mode?: 'hybrid' | 'bm25' | 'vector';
}

export async function runSearch(opts: SearchCommandOptions): Promise<void> {
  const logger = createLogger('search', opts);
  const config = loadSherpaConfig(opts.projectRoot);
  const dbPath = pathFromRoot(opts.projectRoot, config.memory.databasePath);
  const memory = new MemoryRepository(dbPath);

  try {
    const service = new SearchService(memory.getDatabase());
    const hits = await service.search(opts.query, {
      limit: opts.limit ? Number(opts.limit) : config.search.maxResults,
      mode: opts.mode ?? 'hybrid',
      filters: {
        workspace_id: 'default',
        type: opts.type ? opts.type.split(',')[0]!.trim() : undefined,
        tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined,
      },
    });

    logger.debug('search.complete', `hits:${hits.length}`);

    // Match query against skill triggers
    const skills = loadSkills(getSherpaDir(opts.projectRoot));
    const queryLower = opts.query.toLowerCase();
    const matchedSkills = skills.filter(
      (s) =>
        s.triggers.some((t) => queryLower.includes(t.toLowerCase())) ||
        queryLower.includes(s.name.toLowerCase()),
    );

    if (opts.json) {
      const skillSummaries = matchedSkills.map((s) => ({ name: s.name, description: s.description, triggers: s.triggers }));
      process.stdout.write(`${JSON.stringify({ hits, skills: skillSummaries })}\n`);
      return;
    }

    const rows = hits.map((h) => ({
      title: h.title,
      snippet: h.snippet.replace(/\s+/g, ' ').slice(0, 120),
      score: Number(h.score).toFixed(3),
      type: h.type,
    }));

    const widths = {
      title: Math.min(32, Math.max(10, ...rows.map((r) => r.title.length), 5)),
      snippet: 48,
      score: 8,
      type: Math.min(20, Math.max(8, ...rows.map((r) => r.type.length), 4)),
    };

    const header = `${pad('title', widths.title)} | ${pad('snippet', widths.snippet)} | ${pad('score', widths.score)} | ${pad('type', widths.type)}`;
    const sep = '-'.repeat(header.length);
    process.stdout.write(`${header}\n${sep}\n`);
    for (const row of rows) {
      process.stdout.write(
        `${pad(row.title, widths.title)} | ${pad(row.snippet, widths.snippet)} | ${pad(row.score, widths.score)} | ${pad(row.type, widths.type)}\n`,
      );
    }

    if (matchedSkills.length > 0) {
      process.stdout.write(`\nRelevant skills:\n`);
      for (const skill of matchedSkills) {
        process.stdout.write(`  ${skill.name} — ${skill.description}\n`);
      }
    }
  } finally {
    memory.close();
  }
}

function pad(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width, ' ');
  return `${value.slice(0, width - 1)}…`;
}

function pathFromRoot(root: string, relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(root, relative);
}
