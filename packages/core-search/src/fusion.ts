/** Reciprocal Rank Fusion score contribution for a single ranked list position (1-based rank). */
export function reciprocalRankContribution(rank: number, k = 60): number {
  if (rank <= 0) {
    throw new Error(`RRF rank must be >= 1; received ${rank}.`);
  }
  return 1 / (k + rank);
}

/**
 * Fuses multiple ordered identifier lists using RRF (k=60 by default).
 * Higher scores mean stronger consensus across retrievers.
 */
export function reciprocalRankFusion(rankedLists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((id, index) => {
      const rank = index + 1;
      const contribution = reciprocalRankContribution(rank, k);
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    });
  }

  return scores;
}

export function sortIdsByScore(scoreMap: Map<string, number>): string[] {
  return [...scoreMap.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
