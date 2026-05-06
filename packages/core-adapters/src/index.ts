import { AdapterRegistry } from './registry.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { CursorAdapter } from './adapters/cursor.js';
import { CodexCliAdapter } from './adapters/codex-cli.js';
import { GeminiCliAdapter } from './adapters/gemini-cli.js';
import { CopilotAdapter } from './adapters/copilot.js';
import { WindsurfAdapter } from './adapters/windsurf.js';

export type {
  AdapterContext,
  AdapterMetadata,
  AdapterOutput,
  SkillSummary,
  ValidationResult,
} from './types.js';
export {
  contextFromSectionDoc,
  emptySectionDoc,
  sectionDocFromContext,
  type SectionDoc,
} from './section-doc.js';
export { BaseAdapter } from './base-adapter.js';
export { AdapterRegistry } from './registry.js';
export { ClaudeCodeAdapter } from './adapters/claude-code.js';
export { CursorAdapter } from './adapters/cursor.js';
export { CodexCliAdapter } from './adapters/codex-cli.js';
export { GeminiCliAdapter } from './adapters/gemini-cli.js';
export { CopilotAdapter } from './adapters/copilot.js';
export { WindsurfAdapter } from './adapters/windsurf.js';

/** Registers all bundled adapters under their canonical ids. */
export function createDefaultAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register('claude-code', new ClaudeCodeAdapter());
  registry.register('cursor', new CursorAdapter());
  registry.register('codex-cli', new CodexCliAdapter());
  registry.register('gemini-cli', new GeminiCliAdapter());
  registry.register('copilot', new CopilotAdapter());
  registry.register('windsurf', new WindsurfAdapter());
  return registry;
}
