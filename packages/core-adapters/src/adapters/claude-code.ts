import { BaseAdapter } from '../base-adapter.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput } from '../types.js';

export class ClaudeCodeAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'claude-code',
    outputFile: 'CLAUDE.md',
    description: 'Instructions consumed by Claude Code',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const lines = [
      this.formatHeader('Sherpa Adapter Export'),
      this.section('Project Overview', `${context.projectName}\n\n${context.projectDescription}`),
      this.section('Coding Conventions', context.conventions || '(none documented yet)'),
      this.section(
        'Architecture Decisions',
        context.decisions.length ? context.decisions.map((d) => `- ${d}`).join('\n') : '- None recorded yet.',
      ),
      this.section('Available Skills', this.renderSkills(context)),
    ];

    const content = `${lines.join('\n\n').trim()}\n`;
    this.enforceSoftCap(content, warnings);
    return { content, filePath: this.metadata.outputFile, warnings };
  }

  private section(title: string, body: string): string {
    return `## ${title}\n\n${body.trim()}\n`;
  }

  private renderSkills(context: AdapterContext): string {
    if (!context.skills.length) return '_No skills published yet._';
    return context.skills
      .map((skill) => {
        const tags = skill.tags.length ? ` _(tags: ${skill.tags.join(', ')})_` : '';
        return `- **${skill.name}**${tags}: ${skill.description}`;
      })
      .join('\n');
  }
}
