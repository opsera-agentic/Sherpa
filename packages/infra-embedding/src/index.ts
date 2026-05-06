import type { EmbeddingProvider, EmbeddingProviderConfig } from './types.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { OllamaEmbeddingProvider } from './ollama.js';
import { TfIdfEmbeddingProvider } from './tfidf.js';

export type { SqliteDatabase } from '@sherpa/infra-sqlite';

export type { EmbeddingProvider, EmbeddingProviderConfig } from './types.js';

export { TfIdfEmbeddingProvider } from './tfidf.js';
export { OpenAIEmbeddingProvider } from './openai.js';
export { OllamaEmbeddingProvider } from './ollama.js';

/** Cosine similarity for dense numeric vectors (higher is closer). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Factory used by CLI/runtime wiring — defaults to {@link TfIdfEmbeddingProvider}. */
export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'openai': {
      const apiKey = config.openai?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
      if (!apiKey) {
        throw new Error('OpenAI embeddings require apiKey or OPENAI_API_KEY.');
      }
      return new OpenAIEmbeddingProvider({
        apiKey,
        model: config.openai?.model ?? 'text-embedding-3-small',
        baseUrl: config.openai?.baseUrl ?? 'https://api.openai.com/v1',
      });
    }
    case 'ollama':
      return new OllamaEmbeddingProvider({
        baseUrl: config.ollama?.baseUrl ?? 'http://127.0.0.1:11434',
        model: config.ollama?.model ?? 'nomic-embed-text',
      });
    default:
      return new TfIdfEmbeddingProvider(config.dimensions ?? 512);
  }
}
