import { describe, expect, it } from 'vitest';

import { finalizeChunks, parseFile } from './index.js';

describe('parseFile', () => {
  it('chunks TypeScript sources using heuristic boundaries', () => {
    const source = `
export class Greeter {
  greet(): string {
    return 'hello';
  }
}

export function standalone(): number {
  return 42;
}
`;

    const chunks = parseFile('/tmp/sample.ts', source, 'typescript');

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.metadata.file_path === '/tmp/sample.ts')).toBe(true);
  });

  it('throws for unsupported languages', () => {
    expect(() => parseFile('/tmp/sample.rb', 'puts 1', 'ruby')).toThrow(/Unsupported language/);
  });

  it('handles malformed braces gracefully by spanning to EOF', () => {
    const broken = `
export function broken() {
  console.log('missing closing brace')
`;

    const chunks = parseFile('/tmp/broken.ts', broken, 'typescript');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('materializes at least one chunk for sequential exports', () => {
    const snippet = `
export function a(){return 1;}
export function b(){return 2;}
`;

    const chunks = finalizeChunks(snippet, '/tmp/tiny.ts', 'typescript');
    expect(chunks.length).toBeGreaterThan(0);
  });
});
