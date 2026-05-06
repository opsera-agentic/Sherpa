import type { AdapterContext, AdapterMetadata, AdapterOutput, ValidationResult } from './types.js';

const SOFT_CAP_BYTES = 64 * 1024;

export abstract class BaseAdapter {
  abstract readonly metadata: AdapterMetadata;

  abstract generate(context: AdapterContext): AdapterOutput;

  protected formatHeader(title: string): string {
    const rule = '='.repeat(Math.min(72, Math.max(title.length + 8, 32)));
    return `${rule}\n${title}\n${rule}\n`;
  }

  protected enforceSoftCap(content: string, warnings: string[]): void {
    const encoder = new TextEncoder();
    if (encoder.encode(content).length > SOFT_CAP_BYTES) {
      warnings.push(`Generated output exceeds ${SOFT_CAP_BYTES} byte soft cap`);
    }
  }

  validate(output: AdapterOutput): ValidationResult {
    const errors: string[] = [];
    const warnings = [...output.warnings];
    if (!output.content.trim()) {
      errors.push('Adapter produced empty content');
    }
    if (!output.filePath.trim()) {
      errors.push('Adapter produced empty file path');
    }
    return { valid: errors.length === 0, errors, warnings };
  }
}
