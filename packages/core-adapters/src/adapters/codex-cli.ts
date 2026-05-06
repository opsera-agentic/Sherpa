import { BaseAdapter } from '../base-adapter.js';
import {
  isSkillsEmptyPlaceholder,
  normalizeConventionsBody,
  parseDecisionList,
  splitH2Sections,
} from '../parse-helpers.js';
import { emptySectionDoc, type SectionDoc } from '../section-doc.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput, SkillSummary } from '../types.js';

const TITLE_PREFIX = '# Agent Instructions — ';

export class CodexCliAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'codex-cli',
    outputFile: 'AGENTS.md',
    description: 'Codex CLI agent guidance',
  };

  generate(context: AdapterContext): AdapterOutput {
    const warnings: string[] = [];
    const content = `# Agent Instructions — ${context.projectName}

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

  parse(content: string): SectionDoc {
    const doc = emptySectionDoc();
    const lines = content.split(/\r?\n/);
    let cursor = 0;

    while (cursor < lines.length && lines[cursor]?.trim() === '') cursor++;
    if (cursor < lines.length && lines[cursor]?.startsWith(TITLE_PREFIX)) {
      doc.projectName = (lines[cursor] ?? '').slice(TITLE_PREFIX.length).trim();
      cursor++;
    }

    const sections = splitH2Sections(lines.slice(cursor).join('\n'));

    doc.projectDescription = (sections.get('Project Overview') ?? '').trim();

    const conventions = sections.get('Coding Conventions');
    if (conventions !== undefined) {
      doc.conventions = normalizeConventionsBody(conventions);
    }

    const decisionsBody = sections.get('Architecture Decisions');
    if (decisionsBody !== undefined) {
      doc.decisions = parseDecisionList(decisionsBody);
    }

    const skillsBody = sections.get('Available Skills');
    if (skillsBody !== undefined) {
      doc.skills = parseCodexSkills(skillsBody);
    }

    return doc;
  }

  private renderSkills(context: AdapterContext): string {
    if (!context.skills.length) return '_No skills available._';
    return context.skills
      .map((skill) => `- **${skill.name}** (${skill.tags.join(', ') || 'untagged'}): ${skill.description}`)
      .join('\n');
  }
}

function parseCodexSkills(body: string): SkillSummary[] {
  if (isSkillsEmptyPlaceholder(body)) return [];
  const skills: SkillSummary[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^- \*\*(.+?)\*\* \(([^)]*)\): (.*)$/);
    if (!match) continue;
    const tagsRaw = match[2] ?? '';
    const tags = tagsRaw === 'untagged' ? [] : tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    skills.push({ name: match[1] ?? '', tags, description: match[3] ?? '' });
  }
  return skills;
}
