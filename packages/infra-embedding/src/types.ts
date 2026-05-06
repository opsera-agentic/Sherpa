/** Contracts implemented by local and remote embedding backends. */
export interface EmbeddingProvider {
  embed(text: string): number[] | Promise<number[]>;
  embedBatch(texts: string[]): number[][] | Promise<number[][]>;
}

export interface EmbeddingProviderConfig {
  readonly provider: 'tfidf' | 'openai' | 'ollama';
  readonly dimensions?: number;
  readonly openai?: {
    readonly apiKey?: string;
    readonly model?: string;
    readonly baseUrl?: string;
  };
  readonly ollama?: {
    readonly baseUrl?: string;
    readonly model?: string;
  };
}
