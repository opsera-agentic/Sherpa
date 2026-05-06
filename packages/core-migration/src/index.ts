import fs from 'node:fs';
import path from 'node:path';
import { createDefaultAdapterRegistry } from '@sherpa/core-adapters';
import { MemoryRepository, sha256Hex } from '@sherpa/core-memory';
import { parseAgentConfig, resolveAgentSourcePath } from './parsers.js';

export type AgentSource = 'claude-code' | 'cursor' | 'codex-cli' | 'gemini-cli' | 'copilot' | 'windsurf';

export interface MigrateOptions {
  /** Absolute path to repository root containing legacy agent files. */
  projectRoot: string;
  from: AgentSource;
  dryRun?: boolean;
}

export interface MigrationReport {
  sourceFile: string;
  entriesCreated: number;
  checksumVerified: boolean;
  errors: string[];
}

export class MigrationService {
  constructor(private readonly memory: MemoryRepository) {}

  migrate(options: MigrateOptions): MigrationReport {
    const errors: string[] = [];
    const registry = createDefaultAdapterRegistry();
    const adapter = registry.get(options.from);
    if (!adapter) {
      errors.push(`Unknown agent adapter ${options.from}`);
      return {
        sourceFile: '',
        entriesCreated: 0,
        checksumVerified: false,
        errors,
      };
    }

    const sourceFile = resolveAgentSourcePath(projectRoot(options.projectRoot), adapter.metadata.outputFile);

    if (!fs.existsSync(sourceFile)) {
      errors.push(`Source file missing: ${sourceFile}`);
      return {
        sourceFile,
        entriesCreated: 0,
        checksumVerified: false,
        errors,
      };
    }

    let raw = '';
    try {
      raw = fs.readFileSync(sourceFile, 'utf8');
    } catch (err) {
      errors.push(`Failed to read ${sourceFile}: ${String(err)}`);
      return {
        sourceFile,
        entriesCreated: 0,
        checksumVerified: false,
        errors,
      };
    }

    const baselineChecksum = sha256Hex(raw);
    const drafts = parseAgentConfig(options.from, raw);

    if (!drafts.length) {
      errors.push('No migratable sections detected');
    }

    let entriesCreated = 0;
    if (!options.dryRun && drafts.length) {
      for (const draft of drafts) {
        this.memory.upsertEntry({
          workspace_id: 'default',
          title: `[${options.from}] ${draft.title}`,
          body: draft.content,
          type: draft.type,
          tags: ['migration', options.from],
          classification: 'internal',
        });
        entriesCreated += 1;
      }
    } else if (options.dryRun) {
      entriesCreated = drafts.length;
    }

    let checksumVerified = false;
    try {
      const rawAgain = fs.readFileSync(sourceFile, 'utf8');
      checksumVerified = sha256Hex(rawAgain) === baselineChecksum;
    } catch {
      checksumVerified = false;
    }

    return {
      sourceFile,
      entriesCreated,
      checksumVerified,
      errors,
    };
  }
}

function projectRoot(root: string): string {
  return path.resolve(root);
}
