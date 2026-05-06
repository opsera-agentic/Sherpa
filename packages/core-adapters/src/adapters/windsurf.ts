import { BaseAdapter } from '../base-adapter.js';
import { stripFormatHeader } from '../parse-helpers.js';
import { emptySectionDoc, type SectionDoc } from '../section-doc.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput, SkillSummary } from '../types.js';

const TITLE_PREFIX = 'Sherpa / ';
const PROJECT_LINE_PREFIX = 'Project: ';

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

  parse(content: string): SectionDoc {
    const doc = emptySectionDoc();
    const { title, rest } = stripFormatHeader(content);
    if (title.startsWith(TITLE_PREFIX)) {
      doc.projectName = title.slice(TITLE_PREFIX.length).trim();
    }

    const lines = rest.split(/\r?\n/);
    let cursor = 0;
    while (cursor < lines.length && lines[cursor]?.trim() === '') cursor++;

    if (cursor < lines.length && lines[cursor]?.startsWith(PROJECT_LINE_PREFIX)) {
      doc.projectDescription = (lines[cursor] ?? '').slice(PROJECT_LINE_PREFIX.length).trim();
      cursor++;
    }

    const sections = splitBracketSections(lines.slice(cursor).join('\n'));

    const conventions = (sections.get('coding-conventions') ?? '').trim();
    doc.conventions = conventions === 'none' ? '' : conventions;

    const decisionsBody = (sections.get('architecture-decisions') ?? '').trim();
    doc.decisions =
      decisionsBody === '' || decisionsBody === 'none'
        ? []
        : decisionsBody.split(/\r?\n/).map((d) => d.trim()).filter(Boolean);

    doc.skills = parseWindsurfSkills(sections.get('skills') ?? '');

    return doc;
  }
}

function splitBracketSections(body: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = body.split(/\r?\n/);
  let currentLabel: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentLabel !== null) {
      while (buffer.length > 0 && buffer[buffer.length - 1] === '') buffer.pop();
      map.set(currentLabel, buffer.join('\n'));
    }
  };

  for (const line of lines) {
    const match = line.match(/^\[([a-z][a-z0-9-]*)\]\s*$/);
    if (match) {
      flush();
      currentLabel = match[1] ?? '';
      buffer = [];
    } else if (currentLabel !== null) {
      buffer.push(line);
    }
  }

  flush();
  return map;
}

function parseWindsurfSkills(body: string): SkillSummary[] {
  const trimmed = body.trim();
  if (!trimmed || trimmed === 'none') return [];
  const skills: SkillSummary[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^\[skill:([^\]]+)\] (.*)$/);
    if (!match) continue;
    skills.push({ name: (match[1] ?? '').trim(), tags: [], description: (match[2] ?? '').trim() });
  }
  return skills;
}
