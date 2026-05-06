import { BaseAdapter } from '../base-adapter.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput } from '../types.js';

export class CursorAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'cursor',
    outputFile: '.cursorrules',
    description: 'Cursor IDE rules file',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const prefs =
      Object.keys(context.preferences).length === 0
        ? '(none)'
        : Object.entries(context.preferences)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');

    const skills =
      context.skills.length === 0
        ? '(none)'
        : context.skills.map((s) => `- ${s.name} — ${s.description}`).join('\n');

    const decisions =
      context.decisions.length === 0 ? '(none)' : context.decisions.map((d) => `- ${d}`).join('\n');

    const content = `${this.formatHeader(`Project: ${context.projectName}`)}
Summary:
${context.projectDescription}

Coding conventions:
${context.conventions || '(none)'}

Architecture decisions:
${decisions}

Preferences:
${prefs}

Available skills:
${skills}
`.trimStart();

    this.enforceSoftCap(content, warnings);
    return { content, filePath: this.metadata.outputFile, warnings };
  }
}
