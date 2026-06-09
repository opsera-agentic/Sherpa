import { describe, expect, it } from 'vitest';
import { createSherpaProgram } from './index.js';

describe('cli-app', () => {
  it('registers required commands', () => {
    const program = createSherpaProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'init',
        'inspect',
        'sync',
        'search',
        'serve',
        'adapt',
        'migrate',
        'validate',
        'archive',
        'status',
        'skills',
      ]),
    );
  });
});
