import { BaseAdapter } from '../base-adapter.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput } from '../types.js';

export class CodexCliAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'codex-cli',
    outputFile: 'AGENTS.md',
    description: 'Codex CLI agent guidance',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const content = `# Agent Instructions — ${context.projectName}

> Codex operates in a sandboxed environment. Keep instructions actionable and terminal-focused.
> Managed by Sherpa — edit \`.sherpa/conventions.md\` and run \`sherpa adapt\`.

## Project Overview

${context.projectDescription}

## Coding Conventions

${context.conventions || '_Pending sync from Sherpa._'}

## Architecture Decisions

${context.decisions.map((d) => `- ${d}`).join('\n') || '- _None recorded yet._'}

## Available Skills

${this.renderSkills(context)}
`;

    this.enforceSoftCap(content, warnings);
    return { content, filePath: this.metadata.outputFile, warnings };
  }

  private renderSkills(context: AdapterContext): string {
    if (!context.skills.length) return '_No skills available._';
    return context.skills
      .map((skill) => `- **${skill.name}** (${skill.tags.join(', ') || 'untagged'}): ${skill.description}`)
      .join('\n');
  }
}
