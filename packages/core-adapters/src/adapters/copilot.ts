import { BaseAdapter } from '../base-adapter.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput } from '../types.js';

export class CopilotAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'copilot',
    outputFile: '.github/copilot-instructions.md',
    description: 'GitHub Copilot workspace instructions',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const content = `<!-- sherpa:generated -->
<!-- Copilot reads this file for workspace-level context. Keep it under 8KB for best results. -->
<!-- Managed by Sherpa — edit .sherpa/conventions.md and run \`sherpa adapt\`. -->

## Project Overview

${context.projectDescription}

## Coding Conventions

${context.conventions || '_Define conventions in Sherpa and run `sherpa sync`._'}

## Architecture Decisions

${context.decisions.map((d) => `- ${d}`).join('\n') || '- _None yet._'}

## Available Skills

${this.renderSkills(context)}
`;

    this.enforceSoftCap(content, warnings);
    return { content, filePath: this.metadata.outputFile, warnings };
  }

  private renderSkills(context: AdapterContext): string {
    if (!context.skills.length) return '_No skills yet._';
    return context.skills.map((s) => `- \`${s.name}\`: ${s.description}`).join('\n');
  }
}
