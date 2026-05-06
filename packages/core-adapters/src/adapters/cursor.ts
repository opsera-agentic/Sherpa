import { BaseAdapter } from '../base-adapter.js';
import { stripFormatHeader } from '../parse-helpers.js';
import { emptySectionDoc, type SectionDoc } from '../section-doc.js';
import type { AdapterContext, AdapterMetadata, AdapterOutput, SkillSummary } from '../types.js';

const PROJECT_TITLE_PREFIX = 'Project: ';
const SECTION_LABELS = [
  'Summary',
  'Coding conventions',
  'Architecture decisions',
  'Preferences',
  'Available skills',
] as const;

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

  parse(content: string): SectionDoc {
    const doc = emptySectionDoc();
    const { title, rest } = stripFormatHeader(content);
    if (title.startsWith(PROJECT_TITLE_PREFIX)) {
      doc.projectName = title.slice(PROJECT_TITLE_PREFIX.length).trim();
    }

    const sections = splitLabeledSections(rest);

    doc.projectDescription = (sections.get('Summary') ?? '').trim();

    const conventionsBody = (sections.get('Coding conventions') ?? '').trim();
    doc.conventions = conventionsBody === '(none)' ? '' : conventionsBody;

    doc.decisions = parseCursorBulletList(sections.get('Architecture decisions') ?? '');
    doc.preferences = parseCursorPreferences(sections.get('Preferences') ?? '');
    doc.skills = parseCursorSkills(sections.get('Available skills') ?? '');

    return doc;
  }
}

function splitLabeledSections(body: string): Map<string, string> {
  const labelSet = new Set<string>(SECTION_LABELS as readonly string[]);
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
    const match = line.match(/^([A-Z][^:]*?):\s*$/);
    if (match && labelSet.has(match[1] ?? '')) {
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

function parseCursorBulletList(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed || trimmed === '(none)') return [];
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.match(/^- (.*)$/)?.[1]?.trim())
    .filter((d): d is string => !!d && d.length > 0);
}

function parseCursorPreferences(body: string): Record<string, string> {
  const trimmed = body.trim();
  if (!trimmed || trimmed === '(none)') return {};
  const prefs: Record<string, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    prefs[(match[1] ?? '').trim()] = (match[2] ?? '').trim();
  }
  return prefs;
}

function parseCursorSkills(body: string): SkillSummary[] {
  const trimmed = body.trim();
  if (!trimmed || trimmed === '(none)') return [];
  const skills: SkillSummary[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^- (.+?) — (.*)$/);
    if (!match) continue;
    skills.push({ name: (match[1] ?? '').trim(), tags: [], description: (match[2] ?? '').trim() });
  }
  return skills;
}
