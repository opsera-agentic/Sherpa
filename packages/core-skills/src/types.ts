export interface Skill {
  name: string;
  description: string;
  version: string;
  tags: string[];
  triggers: string[];
  instructions: string;
  scripts: string[];
  references: string[];
  assets: string[];
}

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  tags: string[];
  triggers: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
