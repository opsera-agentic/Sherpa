import { BaseAdapter } from '../base-adapter.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput } from '../types.js';

export class GeminiCliAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'gemini-cli',
    outputFile: 'GEMINI.md',
    description: 'Gemini CLI workspace guidance',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const prefs =
      Object.keys(context.preferences).length === 0
        ? ''
        : `## Preferences\n\n${Object.entries(context.preferences)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')}\n`;

    const content = `# GEMINI.md — ${context.projectName}

## Project Overview

${context.projectDescription}

## Coding Conventions

${context.conventions || '_(none)_'}

## Architecture Decisions

${context.decisions.map((d) => `- ${d}`).join('\n') || '- _(none)_'}

${prefs}## Available Skills

${this.renderSkills(context)}
`;

    this.enforceSoftCap(content, warnings);
    return { content, filePath: this.metadata.outputFile, warnings };
  }

  private renderSkills(context: AdapterContext): string {
    if (!context.skills.length) return '_(none)_';
    return context.skills.map((s) => `### ${s.name}\n${s.description}`).join('\n\n');
  }
}
