export interface AdapterMetadata {
  name: string;
  outputFile: string;
  description: string;
}

export interface AdapterContext {
  conventions: string;
  preferences: Record<string, string>;
  skills: SkillSummary[];
  decisions: string[];
  projectName: string;
  projectDescription: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  tags: string[];
}

export interface AdapterOutput {
  content: string;
  filePath: string;
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
