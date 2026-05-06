import fs from 'node:fs';
import path from 'node:path';
import type { Skill, SkillMetadata, ValidationResult } from './types.js';
import { parseSkillFile } from './parser.js';

export type { Skill, SkillMetadata, ValidationResult } from './types.js';
export { parseSkillFile } from './parser.js';

function skillsRoot(sherpaDir: string): string {
  return path.join(sherpaDir, 'skills');
}

function readSkillMd(skillDir: string): string | null {
  const p = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function skillFromParsed(skillDir: string, fm: Record<string, unknown>, body: string): Skill {
  const name = String(fm.name ?? path.basename(skillDir));
  return {
    name,
    description: String(fm.description ?? ''),
    version: String(fm.version ?? '1.0.0'),
    tags: toStringArray(fm.tags),
    triggers: toStringArray(fm.triggers),
    instructions: body,
    scripts: toStringArray(fm.scripts),
    references: toStringArray(fm.references),
    assets: toStringArray(fm.assets ?? fm.assets_paths ?? fm['assets-paths']),
  };
}

export function validateSkill(skillDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const contents = readSkillMd(skillDir);
  if (!contents) {
    errors.push('SKILL.md missing');
    return { valid: false, errors, warnings };
  }
  const parsed = parseSkillFile(contents);
  const fm = parsed.frontmatter;
  if (!fm.description) {
    errors.push('frontmatter.description is required');
  }
  if (!fm.name) {
    errors.push('frontmatter.name is required');
  }
  if (fm.version !== undefined && typeof fm.version !== 'string' && typeof fm.version !== 'number') {
    warnings.push('frontmatter.version should be a string or number');
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Loads every skill directory under `.sherpa/skills`. */
export function loadSkills(sherpaDir: string): Skill[] {
  const root = skillsRoot(sherpaDir);
  if (!fs.existsSync(root)) return [];
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  const out: Skill[] = [];
  for (const d of dirs) {
    const skillDir = path.join(root, d.name);
    const contents = readSkillMd(skillDir);
    if (!contents) continue;
    const { frontmatter, body } = parseSkillFile(contents);
    out.push(skillFromParsed(skillDir, frontmatter, body));
  }
  return out;
}

export function listSkills(sherpaDir: string): SkillMetadata[] {
  return loadSkills(sherpaDir).map((s) => ({
    name: s.name,
    description: s.description,
    version: s.version,
    tags: s.tags,
    triggers: s.triggers,
  }));
}

export function getSkill(sherpaDir: string, name: string): Skill | null {
  const skills = loadSkills(sherpaDir);
  return skills.find((s) => s.name === name) ?? null;
}

export function importSkill(sourcePath: string, sherpaDir: string): void {
  const validation = validateSkill(sourcePath);
  if (!validation.valid) {
    throw new Error(`Invalid skill: ${validation.errors.join('; ')}`);
  }
  const destRoot = skillsRoot(sherpaDir);
  fs.mkdirSync(destRoot, { recursive: true });
  const destName = path.basename(sourcePath);
  const dest = path.join(destRoot, destName);
  fs.cpSync(sourcePath, dest, { recursive: true });
}
