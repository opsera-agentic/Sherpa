const TOKEN = /[a-z0-9]+/g;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN) ?? [];
}

function bucket(token: string, dim: number): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % dim;
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/** Local hashing TF-IDF embedder — deterministic without network I/O. */
export class TfIdfEmbeddingProvider {
  readonly dimensions: number;

  constructor(dimensions = 512) {
    if (!Number.isFinite(dimensions) || dimensions <= 0) {
      throw new Error('TfIdfEmbeddingProvider requires a positive dimensionality.');
    }
    this.dimensions = dimensions;
  }

  embed(text: string): number[] {
    return this.embedBatch([text])[0] ?? new Array(this.dimensions).fill(0);
  }

  embedBatch(texts: string[]): number[][] {
    if (!texts.length) return [];

    const tokenized = texts.map(tokenize);
    const df = new Map<string, number>();
    for (const tokens of tokenized) {
      const seen = new Set(tokens);
      for (const t of seen) {
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }

    const n = texts.length;
    const dim = this.dimensions;

    return tokenized.map((tokens) => {
      const vec = new Array(dim).fill(0);
      const tf = new Map<string, number>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
      }

      for (const [term, freq] of tf.entries()) {
        const docFreq = df.get(term) ?? 1;
        const idf = Math.log((1 + n) / (1 + docFreq)) + 1;
        const weight = freq * idf;
        const idx = bucket(term, dim);
        vec[idx] += weight;
      }

      return normalize(vec);
    });
  }
}
