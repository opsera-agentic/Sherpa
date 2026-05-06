import type { EmbeddingProvider } from './types.js';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly opts: {
      readonly baseUrl: string;
      readonly model: string;
    },
  ) {}

  async embed(text: string): Promise<number[]> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/api/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.opts.model, prompt: text }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama embeddings failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as { embedding?: number[] };
    const embedding = payload.embedding;
    if (!embedding?.length) {
      throw new Error('Ollama embeddings response missing vector data.');
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
