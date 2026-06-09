export type DiffStatus = 'unchanged' | 'modified' | 'added';

export interface TextDiffResult {
  status: DiffStatus;
  additions: number;
  deletions: number;
  unified: string;
}

type DiffOp = { type: 'same' | 'add' | 'remove'; line: string };

function buildDiffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        lcs[i]![j] = lcs[i + 1]![j + 1]! + 1;
      } else {
        lcs[i]![j] = Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'same', line: oldLines[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: 'remove', line: oldLines[i]! });
      i += 1;
    } else {
      ops.push({ type: 'add', line: newLines[j]! });
      j += 1;
    }
  }
  while (i < m) {
    ops.push({ type: 'remove', line: oldLines[i]! });
    i += 1;
  }
  while (j < n) {
    ops.push({ type: 'add', line: newLines[j]! });
    j += 1;
  }
  return ops;
}

function formatUnifiedDiff(filePath: string, ops: DiffOp[]): string {
  const changedIndexes = ops
    .map((op, idx) => (op.type === 'same' ? -1 : idx))
    .filter((idx) => idx >= 0);
  if (!changedIndexes.length) return '';

  const lines: string[] = [`--- ${filePath} (current)`, `+++ ${filePath} (would write)`];
  const context = 3;
  let blockStart = 0;

  while (blockStart < ops.length) {
    const firstChange = ops.findIndex((op, idx) => idx >= blockStart && op.type !== 'same');
    if (firstChange === -1) break;

    const hunkStart = Math.max(0, firstChange - context);
    let hunkEnd = firstChange;
    while (hunkEnd < ops.length) {
      const windowEnd = Math.min(ops.length, hunkEnd + 1);
      const hasChange = ops.slice(hunkEnd, windowEnd).some((op) => op.type !== 'same');
      if (!hasChange && hunkEnd > firstChange) break;
      hunkEnd += 1;
      if (hunkEnd - firstChange > 40) break;
    }
    hunkEnd = Math.min(ops.length, hunkEnd + context);

    const slice = ops.slice(hunkStart, hunkEnd);
    const oldCount = slice.filter((op) => op.type !== 'add').length;
    const newCount = slice.filter((op) => op.type !== 'remove').length;
    lines.push(`@@ -${hunkStart + 1},${oldCount} +${hunkStart + 1},${newCount} @@`);
    for (const op of slice) {
      if (op.type === 'same') lines.push(` ${op.line}`);
      if (op.type === 'remove') lines.push(`-${op.line}`);
      if (op.type === 'add') lines.push(`+${op.line}`);
    }

    blockStart = hunkEnd;
  }

  return lines.length > 2 ? lines.join('\n') : '';
}

/** Compare on-disk text with proposed content; null current means the file would be created. */
export function diffText(current: string | null, proposed: string, filePath = 'file'): TextDiffResult {
  if (current === null) {
    const lines = proposed.split('\n');
    return {
      status: 'added',
      additions: lines.length,
      deletions: 0,
      unified: [`--- /dev/null`, `+++ ${filePath} (would write)`, ...lines.map((line) => `+${line}`)].join('\n'),
    };
  }

  if (current === proposed) {
    return { status: 'unchanged', additions: 0, deletions: 0, unified: '' };
  }

  const ops = buildDiffOps(current.split('\n'), proposed.split('\n'));
  return {
    status: 'modified',
    additions: ops.filter((op) => op.type === 'add').length,
    deletions: ops.filter((op) => op.type === 'remove').length,
    unified: formatUnifiedDiff(filePath, ops),
  };
}
