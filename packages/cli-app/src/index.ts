#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}
import { Command, CommanderError, Option } from 'commander';

import { runAdapt } from './commands/adapt.js';
import { runArchive } from './commands/archive.js';
import { runInit } from './commands/init.js';
import { runMigrate } from './commands/migrate.js';
import { runPull } from './commands/pull.js';
import { runSearch } from './commands/search.js';
import { runServe } from './commands/serve.js';
import { runSkills } from './commands/skills.js';
import { runStatus } from './commands/status.js';
import { runSync } from './commands/sync.js';
import { runValidate } from './commands/validate.js';
import { runWatch } from './commands/watch.js';
import { createLogger } from './logger.js';

const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };

function resolveRoot(globalOpts: { projectRoot?: string }): string {
  return path.resolve(globalOpts.projectRoot ?? process.cwd());
}

/** Commander program wiring shared between the executable and tests. */
export function createSherpaProgram(): Command {
  const program = new Command();
  program
    .name('sherpa')
    .description('Sherpa portable AI context CLI')
    .version(pkgJson.version, '-V, --version', 'Show CLI version')
    .option('-v, --verbose', 'Enable verbose diagnostics')
    .option('--json', 'Emit structured JSON responses')
    .option('--project-root <path>', 'Repository root', process.cwd());

  program
    .command('init')
    .description('Initialize the local Sherpa workspace')
    .option('--force', 'Overwrite an existing workspace')
    .addOption(
      new Option('--template <template>', 'Scaffold template').choices([
        'web-app',
        'library',
        'cli-tool',
        'monorepo',
      ]),
    )
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runInit({
        projectRoot: resolveRoot(g),
        force: Boolean(opts.force),
        template: opts.template ?? 'library',
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('sync')
    .description('Replay Sherpa sources into memory and adapter snapshots')
    .action(async (_opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runSync({
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('search')
    .description('Search Sherpa memory chunks')
    .argument('<query>', 'Natural language query')
    .option('--type <types>', 'Comma-separated entry types')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--limit <n>', 'Maximum hits')
    .addOption(new Option('--mode <mode>').choices(['hybrid', 'bm25', 'vector']).default('hybrid'))
    .action(async (query, opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runSearch({
        query,
        type: opts.type,
        tags: opts.tags,
        limit: opts.limit,
        mode: opts.mode,
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('serve')
    .description('Start the Sherpa MCP server (stdio)')
    .option('--allow-write', 'Allow memory mutations via MCP tools')
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runServe({
        allowWrite: Boolean(opts.allowWrite),
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('adapt')
    .description('Generate agent-facing adapter files')
    .option('--agent <name>', 'Target a single adapter')
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runAdapt({
        agent: opts.agent,
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  const skills = program.command('skills').description('Inspect and import skills');

  skills
    .command('list')
    .description('List skill metadata')
    .action(async (_opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runSkills({
        action: 'list',
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  skills
    .command('show')
    .description('Show a skill definition')
    .requiredOption('--name <skill>', 'Skill name')
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runSkills({
        action: 'show',
        name: opts.name,
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  skills
    .command('import')
    .description('Import a skill folder into Sherpa')
    .requiredOption('--from <path>', 'Source skill directory')
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runSkills({
        action: 'import',
        source: opts.from,
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('migrate')
    .description('Import legacy agent instructions into Sherpa memory')
    .addOption(
      new Option('--from <agent>', 'Source agent').choices([
        'claude-code',
        'cursor',
        'codex-cli',
        'gemini-cli',
        'copilot',
        'windsurf',
      ]).makeOptionMandatory(),
    )
    .option('--dry-run', 'Parse without mutating the database')
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runMigrate({
        from: opts.from,
        dryRun: Boolean(opts.dryRun),
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('validate')
    .description('Validate Sherpa conventions on disk')
    .action(async (_opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runValidate({
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('archive')
    .description('Archive stale memory entries')
    .requiredOption('--older-than <duration>', 'Age threshold like 30d or 12h')
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runArchive({
        olderThan: opts.olderThan,
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('status')
    .description('Show Sherpa database statistics')
    .action(async (_opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runStatus({
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('pull')
    .description('Reverse-sync agent files back into conventions.md')
    .addOption(
      new Option('--from <agent>', 'Pull from a specific agent only').choices([
        'claude-code',
        'cursor',
        'codex-cli',
        'gemini-cli',
        'copilot',
        'windsurf',
      ]),
    )
    .action(async (opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runPull({
        from: opts.from,
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  program
    .command('watch')
    .description('Watch agent files and auto-sync changes into conventions.md')
    .action(async (_opts, cmd) => {
      const g = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean; projectRoot?: string };
      await runWatch({
        projectRoot: resolveRoot(g),
        verbose: Boolean(g.verbose),
        json: Boolean(g.json),
      });
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createSherpaProgram();
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err) {
    if (err instanceof CommanderError && ['commander.helpDisplayed', 'commander.versionDisplayed'].includes(err.code)) {
      return;
    }
    const opts = program.opts() as { verbose?: boolean; json?: boolean };
    const logger = createLogger('cli', { json: Boolean(opts.json), verbose: Boolean(opts.verbose) });
    const message = err instanceof Error ? err.message : String(err);
    logger.error('fatal', message);
    if (opts.verbose && err instanceof Error && err.stack) {
      process.stderr.write(`${err.stack}\n`);
    }
    throw err;
  }
}

const invoked =
  Boolean(process.argv[1]) &&
  safeRealpath(process.argv[1]!) === safeRealpath(fileURLToPath(import.meta.url));

if (invoked) {
  runCli(process.argv.slice(2)).catch(() => {
    process.exitCode = 1;
  });
}
