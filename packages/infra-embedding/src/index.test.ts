import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  TfIdfEmbeddingProvider,
  cosineSimilarity,
  createEmbeddingProvider,
} from './index.js';

describe('infra-embedding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('TfIdfEmbeddingProvider produces normalized vectors', () => {
    const provider = new TfIdfEmbeddingProvider(128);
    const v = provider.embed('hello world sherpa embedding');
    expect(v.length).toBe(128);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('TfIdf embedBatch respects corpus statistics', () => {
    const provider = new TfIdfEmbeddingProvider(64);
    const vectors = provider.embedBatch(['alpha beta', 'alpha gamma', 'delta']);
    expect(vectors.length).toBe(3);
    expect(cosineSimilarity(vectors[0]!, vectors[1]!)).toBeGreaterThan(0);
  });

  it('cosineSimilarity handles orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1, 5);
  });

  it('createEmbeddingProvider defaults to tf-idf', async () => {
    const provider = createEmbeddingProvider({ provider: 'tfidf', dimensions: 32 });
    const vec = await Promise.resolve(provider.embed('local inference'));
    expect(vec.length).toBe(32);
  });

  it('OpenAIEmbeddingProvider calls REST endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
      })) as unknown as typeof fetch,
    );

    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
      baseUrl: 'https://api.openai.com/v1',
    });
    await expect(provider.embed('ping')).resolves.toEqual([1, 0, 0]);
  });

  it('OllamaEmbeddingProvider parses embedding arrays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ embedding: [0, 1, 1] }),
      })) as unknown as typeof fetch,
    );

    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'nomic-embed-text',
    });
    await expect(provider.embed('local-model')).resolves.toEqual([0, 1, 1]);
  });
});
