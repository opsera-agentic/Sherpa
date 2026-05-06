import { BaseAdapter } from '../base-adapter.js';
import {
  isSkillsEmptyPlaceholder,
  normalizeConventionsBody,
  parseDecisionList,
  splitH2Sections,
  stripFormatHeader,
} from '../parse-helpers.js';
import { emptySectionDoc, type SectionDoc } from '../section-doc.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput, SkillSummary } from '../types.js';

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

  parse(content: string): SectionDoc {
    const doc = emptySectionDoc();
    const { rest } = stripFormatHeader(content);
    const sections = splitH2Sections(rest);

    const overview = sections.get('Project Overview') ?? '';
    const overviewLines = overview.split(/\r?\n/);
    doc.projectName = (overviewLines[0] ?? '').trim();
    doc.projectDescription = overviewLines.slice(1).join('\n').trim();

    const conventions = sections.get('Coding Conventions');
    if (conventions !== undefined) {
      doc.conventions = normalizeConventionsBody(conventions);
    }

    const decisionsBody = sections.get('Architecture Decisions');
    if (decisionsBody !== undefined) {
      const trimmed = decisionsBody.trim();
      if (trimmed === '- None recorded yet.') {
        doc.decisions = [];
      } else {
        doc.decisions = parseDecisionList(decisionsBody);
      }
    }

    const skillsBody = sections.get('Available Skills');
    if (skillsBody !== undefined) {
      doc.skills = parseClaudeSkills(skillsBody);
    }

    return doc;
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

function parseClaudeSkills(body: string): SkillSummary[] {
  if (isSkillsEmptyPlaceholder(body)) return [];
  const skills: SkillSummary[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^- \*\*(.+?)\*\*(?: _\(tags: ([^)]+)\)_)?: (.*)$/);
    if (!match) continue;
    const tags = match[2] ? match[2].split(',').map((t) => t.trim()).filter(Boolean) : [];
    skills.push({ name: match[1] ?? '', tags, description: match[3] ?? '' });
  }
  return skills;
}
