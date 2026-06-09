import { describe, expect, it } from 'vitest';

import { diffText } from './text-diff.js';

describe('diffText', () => {
  it('reports unchanged when content matches', () => {
    const result = diffText('alpha\nbeta', 'alpha\nbeta', 'rules.md');
    expect(result.status).toBe('unchanged');
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.unified).toBe('');
  });

  it('reports added when file does not exist yet', () => {
    const result = diffText(null, 'line one\nline two', 'CLAUDE.md');
    expect(result.status).toBe('added');
    expect(result.additions).toBe(2);
    expect(result.unified).toContain('+++ CLAUDE.md (would write)');
    expect(result.unified).toContain('+line one');
  });

  it('reports modified with line counts and unified diff', () => {
    const result = diffText('keep\nold line\nfooter', 'keep\nnew line\nfooter', '.cursorrules');
    expect(result.status).toBe('modified');
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.unified).toContain('--- .cursorrules (current)');
    expect(result.unified).toContain('-old line');
    expect(result.unified).toContain('+new line');
  });
});
