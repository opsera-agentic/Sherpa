import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import {
  getSherpaDir,
  getSherpaConfigPath,
  serializeSherpaConfig,
  mergeWithDefaults,
} from '@sherpa/core-config';
import { MemoryRepository } from '@sherpa/core-memory';
import { parseAgentConfig, type ParsedMemoryDraft } from '@sherpa/core-migration';

import { getStarterTemplate, skillToMarkdown, type StarterTemplateId } from '../templates/index.js';
import { withTelemetry } from '../telemetry.js';

export interface InitCommandOptions extends LoggerOptions {
  force?: boolean;
  template?: StarterTemplateId;
  projectRoot: string;
}

const AGENT_FILES = [
  { agent: 'cursor', file: '.cursorrules' },
  { agent: 'claude-code', file: 'CLAUDE.md' },
  { agent: 'codex-cli', file: 'AGENTS.md' },
  { agent: 'gemini-cli', file: 'GEMINI.md' },
  { agent: 'copilot', file: path.join('.github', 'copilot-instructions.md') },
  { agent: 'windsurf', file: '.windsurfrules' },
];

function detectProjectType(projectRoot: string): StarterTemplateId {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.workspaces) return 'monorepo';
      if (pkg.bin) return 'cli-tool';
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps);
      const webFrameworks = [
        'react', 'vue', 'next', 'nuxt', 'svelte', '@angular/core',
        'express', 'fastify', 'koa', 'hono', 'nest', '@nestjs/core',
      ];
      if (depNames.some((d) => webFrameworks.includes(d))) return 'web-app';
    } catch {
      /* fall through */
    }
  }

  // Non-JS project detection
  const jvmIndicators = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
  if (jvmIndicators.some((f) => fs.existsSync(path.join(projectRoot, f)))) return 'web-app';

  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      if (/(?:flask|django|fastapi|starlette)/i.test(content)) return 'web-app';
    } catch {
      /* ignore */
    }
    return 'library';
  }
  if (fs.existsSync(path.join(projectRoot, 'setup.py'))) return 'library';

  return 'library';
}

function skillDirectoryName(skillName: string): string {
  const slug = skillName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'skill';
}

export async function runInit(opts: InitCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'init', async () => {
    return await _runInit(opts);
  });
}

async function _runInit(opts: InitCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('init', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);

  if (fs.existsSync(sherpaDir)) {
    if (!opts.force) {
      logger.error('init', `${sherpaDir} already exists (pass --force to recreate structured scaffolding)`);
      throw new Error('sherpa already initialized');
    }
    fs.rmSync(sherpaDir, { recursive: true, force: true });
  }

  fs.mkdirSync(sherpaDir, { recursive: true });
  for (const sub of ['skills', 'decisions', 'adapters', 'audit']) {
    fs.mkdirSync(path.join(sherpaDir, sub), { recursive: true });
  }

  const templateId = opts.template ?? detectProjectType(opts.projectRoot);
  const starter = getStarterTemplate(templateId);

  const mergedConfig = mergeWithDefaults(starter.config);
  const dbPath = path.join(opts.projectRoot, mergedConfig.memory.databasePath);
  const memory = new MemoryRepository(dbPath);
  memory.close();

  fs.writeFileSync(path.join(sherpaDir, 'conventions.md'), starter.conventions.trimEnd() + '\n', 'utf8');

  const skillsRoot = path.join(sherpaDir, 'skills');
  for (const skill of starter.skills) {
    const dir = path.join(skillsRoot, skillDirectoryName(skill.name));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillToMarkdown(skill), 'utf8');
  }

  fs.writeFileSync(getSherpaConfigPath(opts.projectRoot), serializeSherpaConfig(mergedConfig), 'utf8');

  const detected = AGENT_FILES.filter(({ file }) => fs.existsSync(path.join(opts.projectRoot, file)));

  if (detected.length > 0) {
    const conventionsPath = path.join(sherpaDir, 'conventions.md');
    let appended = 0;

    for (const { agent, file } of detected) {
      const filePath = path.join(opts.projectRoot, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        if (!raw) continue;

        const drafts = parseAgentConfig(agent, raw);
        if (!drafts.length) continue;

        const block = [
          `\n\n## Imported from ${file}\n`,
          ...drafts.map((d: ParsedMemoryDraft) => `### ${d.title}\n\n${d.content}`),
        ].join('\n\n');

        fs.appendFileSync(conventionsPath, block + '\n', 'utf8');
        appended += 1;
        logger.info('init.import', `Imported existing ${file} into conventions.md`);
      } catch {
        logger.warn('init.import', `Could not read ${filePath}, skipping`);
      }
    }

    if (appended > 0 && !opts.json) {
      process.stdout.write(
        `Imported ${appended} existing agent file(s) into .sherpa/conventions.md — review and edit as needed.\n`,
      );
    }
  }

  logger.warn(
    'security',
    'Do not store API keys or long-lived secrets in Sherpa-managed markdown files — rotate credentials stored accidentally.',
  );
  logger.info(
    'agents.detected',
    `Detected agent traces: ${detected.map((x) => x.agent).join(', ') || 'none'}`,
    { detected: detected.map((x) => x.agent) },
  );

  if (!opts.json) {
    process.stdout.write(`Sherpa initialized at ${sherpaDir}\n`);
  }

  return {
    projectType: templateId,
    detectedAgents: detected.map((x) => x.agent),
    detectedAgentCount: detected.length,
    skillsScaffolded: starter.skills.length,
  };
}
