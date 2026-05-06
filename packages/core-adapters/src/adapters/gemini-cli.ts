import { BaseAdapter } from '../base-adapter.js';
import {
  isSkillsEmptyPlaceholder,
  normalizeConventionsBody,
  parseDecisionList,
  splitH2Sections,
} from '../parse-helpers.js';
import { emptySectionDoc, type SectionDoc } from '../section-doc.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput, SkillSummary } from '../types.js';

const TITLE_PREFIX = '# GEMINI.md — ';

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

    const prefsBody = sections.get('Preferences');
    if (prefsBody !== undefined) {
      doc.preferences = parseGeminiPreferences(prefsBody);
    }

    const skillsBody = sections.get('Available Skills');
    if (skillsBody !== undefined) {
      doc.skills = parseGeminiSkills(skillsBody);
    }

    return doc;
  }

  private renderSkills(context: AdapterContext): string {
    if (!context.skills.length) return '_(none)_';
    return context.skills.map((s) => `### ${s.name}\n${s.description}`).join('\n\n');
  }
}

function parseGeminiPreferences(body: string): Record<string, string> {
  const prefs: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^- ([^:]+): (.*)$/);
    if (!match) continue;
    prefs[(match[1] ?? '').trim()] = (match[2] ?? '').trim();
  }
  return prefs;
}

function parseGeminiSkills(body: string): SkillSummary[] {
  if (isSkillsEmptyPlaceholder(body)) return [];
  const skills: SkillSummary[] = [];
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const headingMatch = lines[i]?.match(/^### (.+)$/);
    if (!headingMatch) {
      i++;
      continue;
    }
    const name = (headingMatch[1] ?? '').trim();
    i++;
    const descLines: string[] = [];
    while (i < lines.length && !lines[i]?.startsWith('### ')) {
      const line = lines[i] ?? '';
      if (line.trim() === '' && descLines.length > 0) {
        i++;
        break;
      }
      if (line.trim() !== '') descLines.push(line);
      i++;
    }
    skills.push({ name, tags: [], description: descLines.join('\n').trim() });
  }
  return skills;
}
