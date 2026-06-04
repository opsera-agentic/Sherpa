import type { SherpaConfig } from './schema.js';

/** Baseline configuration merged under user-provided values from YAML. */
export function getDefaultConfig(): SherpaConfig {
  return {
    adapters: {
      filesystem: { enabled: true },
      git: { enabled: true },
      ide: { enabled: true },
      terminal: { enabled: true },
      http: { enabled: true },
      disabled: [],
    },
    sync: {
      indexSourceFiles: false,
    },
    memory: {
      databasePath: '.sherpa/memory.sqlite',
      workspaceIsolation: true,
    },
    search: {
      provider: 'bm25',
      maxResults: 50,
    },
    skills: {
      roots: ['.sherpa/skills'],
      autoDiscover: true,
    },
    embedding: {
      provider: 'tfidf',
      dimensions: 512,
      openai: {
        model: 'text-embedding-3-small',
        baseUrl: 'https://api.openai.com/v1',
      },
      ollama: {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'nomic-embed-text',
      },
    },
    mcp: {
      enabled: false,
      transport: 'stdio',
      port: 8787,
    },
    audit: {
      enabled: true,
      jsonlRotation: 'monthly',
      integrityChecksOnStartup: false,
    },
    telemetry: {
      enabled: true,
      endpoint: 'https://us.i.posthog.com/batch',
      apiKey: '',
      batchSize: 25,
      flushIntervalSeconds: 300,
    },
    privacy: {
      redactSecrets: true,
      allowTelemetry: false,
    },
    security: {
      requireTlsForRemoteProviders: true,
      allowedHosts: [],
    },
  };
}
