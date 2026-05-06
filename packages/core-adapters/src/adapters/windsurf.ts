import { BaseAdapter } from '../base-adapter.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput } from '../types.js';

export class WindsurfAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'windsurf',
    outputFile: '.windsurfrules',
    description: 'Windsurf IDE rules',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const skills =
      context.skills.length === 0
        ? ''
        : context.skills.map((s) => `[skill:${s.name}] ${s.description}`).join('\n');

    const content = `${this.formatHeader(`Sherpa / ${context.projectName}`)}
Project: ${context.projectDescription}

[coding-conventions]
${context.conventions || 'none'}

[architecture-decisions]
${context.decisions.join('\n') || 'none'}

[skills]
${skills || 'none'}
`;

    this.enforceSoftCap(content, warnings);
    return { content, filePath: this.metadata.outputFile, warnings };
  }
}
