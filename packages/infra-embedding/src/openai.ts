import type { EmbeddingProvider } from './types.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly opts: {
      readonly apiKey: string;
      readonly model: string;
      readonly baseUrl: string;
    },
  ) {}

  async embed(text: string): Promise<number[]> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ model: this.opts.model, input: text }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI embeddings failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    if (!embedding?.length) {
      throw new Error('OpenAI embeddings response missing vector data.');
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
