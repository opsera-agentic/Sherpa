import { getDefaultConfig } from './defaults.js';

export interface AdapterToggle {
  readonly enabled: boolean;
}

export interface AdaptersConfig {
  readonly filesystem: AdapterToggle;
  readonly git: AdapterToggle;
  readonly ide: AdapterToggle;
  readonly terminal: AdapterToggle;
  readonly http: AdapterToggle;
}

export interface MemoryConfigSection {
  readonly databasePath: string;
  readonly workspaceIsolation: boolean;
}

export interface SearchConfigSection {
  readonly provider: string;
  readonly maxResults: number;
}

export interface SkillsConfigSection {
  readonly roots: readonly string[];
  readonly autoDiscover: boolean;
}

export interface EmbeddingOpenAiSection {
  readonly model: string;
  readonly baseUrl: string;
}

export interface EmbeddingOllamaSection {
  readonly baseUrl: string;
  readonly model: string;
}

export interface EmbeddingConfigSection {
  readonly provider: string;
  readonly dimensions: number;
  readonly openai: EmbeddingOpenAiSection;
  readonly ollama: EmbeddingOllamaSection;
}

export interface McpConfigSection {
  readonly enabled: boolean;
  readonly transport: 'stdio' | 'http';
  readonly port: number;
}

export interface AuditConfigSection {
  readonly enabled: boolean;
  readonly jsonlRotation: 'monthly' | 'daily' | 'none';
  readonly integrityChecksOnStartup: boolean;
}

export interface PrivacyConfigSection {
  readonly redactSecrets: boolean;
  readonly allowTelemetry: boolean;
}

export interface SecurityConfigSection {
  readonly requireTlsForRemoteProviders: boolean;
  readonly allowedHosts: readonly string[];
}

export interface SherpaConfig {
  readonly adapters: AdaptersConfig;
  readonly memory: MemoryConfigSection;
  readonly search: SearchConfigSection;
  readonly skills: SkillsConfigSection;
  readonly embedding: EmbeddingConfigSection;
  readonly mcp: McpConfigSection;
  readonly audit: AuditConfigSection;
  readonly privacy: PrivacyConfigSection;
  readonly security: SecurityConfigSection;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function str(value: unknown): value is string {
  return typeof value === 'string';
}

function num(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function strArr(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function validateAdapterToggle(path: string, value: unknown, issues: ValidationIssue[]): AdapterToggle {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be object with enabled: boolean' });
    return { enabled: true };
  }
  if (!bool(value.enabled)) {
    issues.push({ path: `${path}.enabled`, message: 'must be boolean' });
    return { enabled: true };
  }
  return { enabled: value.enabled };
}

/** Validates merged configuration objects prior to runtime use. */
export function validateConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(config)) {
    return { ok: false, issues: [{ path: '', message: 'root config must be an object' }] };
  }

  const adaptersRaw = config.adapters;
  if (!isRecord(adaptersRaw)) {
    issues.push({ path: 'adapters', message: 'must be an object' });
  } else {
    validateAdapterToggle('adapters.filesystem', adaptersRaw.filesystem ?? { enabled: true }, issues);
    validateAdapterToggle('adapters.git', adaptersRaw.git ?? { enabled: true }, issues);
    validateAdapterToggle('adapters.ide', adaptersRaw.ide ?? { enabled: true }, issues);
    validateAdapterToggle('adapters.terminal', adaptersRaw.terminal ?? { enabled: true }, issues);
    validateAdapterToggle('adapters.http', adaptersRaw.http ?? { enabled: true }, issues);
  }

  const memoryRaw = config.memory;
  if (!isRecord(memoryRaw)) {
    issues.push({ path: 'memory', message: 'must be an object' });
  } else {
    if (memoryRaw.databasePath !== undefined && !str(memoryRaw.databasePath)) {
      issues.push({ path: 'memory.databasePath', message: 'must be string' });
    }
    if (memoryRaw.workspaceIsolation !== undefined && !bool(memoryRaw.workspaceIsolation)) {
      issues.push({ path: 'memory.workspaceIsolation', message: 'must be boolean' });
    }
  }

  const searchRaw = config.search;
  if (!isRecord(searchRaw)) {
    issues.push({ path: 'search', message: 'must be an object' });
  } else {
    if (searchRaw.provider !== undefined && !str(searchRaw.provider)) {
      issues.push({ path: 'search.provider', message: 'must be string' });
    }
    if (searchRaw.maxResults !== undefined && !num(searchRaw.maxResults)) {
      issues.push({ path: 'search.maxResults', message: 'must be finite number' });
    }
  }

  const skillsRaw = config.skills;
  if (!isRecord(skillsRaw)) {
    issues.push({ path: 'skills', message: 'must be an object' });
  } else {
    if (skillsRaw.roots !== undefined && !strArr(skillsRaw.roots)) {
      issues.push({ path: 'skills.roots', message: 'must be string[]' });
    }
    if (skillsRaw.autoDiscover !== undefined && !bool(skillsRaw.autoDiscover)) {
      issues.push({ path: 'skills.autoDiscover', message: 'must be boolean' });
    }
  }

  const embeddingRaw = config.embedding;
  if (!isRecord(embeddingRaw)) {
    issues.push({ path: 'embedding', message: 'must be an object' });
  } else {
    if (embeddingRaw.provider !== undefined && !str(embeddingRaw.provider)) {
      issues.push({ path: 'embedding.provider', message: 'must be string' });
    }
    if (embeddingRaw.dimensions !== undefined && !num(embeddingRaw.dimensions)) {
      issues.push({ path: 'embedding.dimensions', message: 'must be finite number' });
    }
    const oai = embeddingRaw.openai;
    if (oai !== undefined) {
      if (!isRecord(oai)) {
        issues.push({ path: 'embedding.openai', message: 'must be object' });
      } else {
        if (oai.model !== undefined && !str(oai.model)) issues.push({ path: 'embedding.openai.model', message: 'string required' });
        if (oai.baseUrl !== undefined && !str(oai.baseUrl)) issues.push({ path: 'embedding.openai.baseUrl', message: 'string required' });
      }
    }
    const oll = embeddingRaw.ollama;
    if (oll !== undefined) {
      if (!isRecord(oll)) {
        issues.push({ path: 'embedding.ollama', message: 'must be object' });
      } else {
        if (oll.baseUrl !== undefined && !str(oll.baseUrl)) issues.push({ path: 'embedding.ollama.baseUrl', message: 'string required' });
        if (oll.model !== undefined && !str(oll.model)) issues.push({ path: 'embedding.ollama.model', message: 'string required' });
      }
    }
  }

  const mcpRaw = config.mcp;
  if (!isRecord(mcpRaw)) {
    issues.push({ path: 'mcp', message: 'must be an object' });
  } else {
    if (mcpRaw.enabled !== undefined && !bool(mcpRaw.enabled)) issues.push({ path: 'mcp.enabled', message: 'must be boolean' });
    if (mcpRaw.transport !== undefined && mcpRaw.transport !== 'stdio' && mcpRaw.transport !== 'http') {
      issues.push({ path: 'mcp.transport', message: 'must be stdio | http' });
    }
    if (mcpRaw.port !== undefined && !num(mcpRaw.port)) issues.push({ path: 'mcp.port', message: 'must be finite number' });
  }

  const auditRaw = config.audit;
  if (!isRecord(auditRaw)) {
    issues.push({ path: 'audit', message: 'must be an object' });
  } else {
    if (auditRaw.enabled !== undefined && !bool(auditRaw.enabled)) issues.push({ path: 'audit.enabled', message: 'must be boolean' });
    if (
      auditRaw.jsonlRotation !== undefined &&
      auditRaw.jsonlRotation !== 'monthly' &&
      auditRaw.jsonlRotation !== 'daily' &&
      auditRaw.jsonlRotation !== 'none'
    ) {
      issues.push({ path: 'audit.jsonlRotation', message: 'must be monthly | daily | none' });
    }
    if (auditRaw.integrityChecksOnStartup !== undefined && !bool(auditRaw.integrityChecksOnStartup)) {
      issues.push({ path: 'audit.integrityChecksOnStartup', message: 'must be boolean' });
    }
  }

  const privacyRaw = config.privacy;
  if (!isRecord(privacyRaw)) {
    issues.push({ path: 'privacy', message: 'must be an object' });
  } else {
    if (privacyRaw.redactSecrets !== undefined && !bool(privacyRaw.redactSecrets)) {
      issues.push({ path: 'privacy.redactSecrets', message: 'must be boolean' });
    }
    if (privacyRaw.allowTelemetry !== undefined && !bool(privacyRaw.allowTelemetry)) {
      issues.push({ path: 'privacy.allowTelemetry', message: 'must be boolean' });
    }
  }

  const securityRaw = config.security;
  if (!isRecord(securityRaw)) {
    issues.push({ path: 'security', message: 'must be an object' });
  } else {
    if (securityRaw.requireTlsForRemoteProviders !== undefined && !bool(securityRaw.requireTlsForRemoteProviders)) {
      issues.push({ path: 'security.requireTlsForRemoteProviders', message: 'must be boolean' });
    }
    if (securityRaw.allowedHosts !== undefined && !strArr(securityRaw.allowedHosts)) {
      issues.push({ path: 'security.allowedHosts', message: 'must be string[]' });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Validates raw YAML fragments before defaults merge catches structural mistakes early. */
export function validatePartialStructure(parsed: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (parsed === null || parsed === undefined) {
    return { ok: true, issues };
  }
  if (!isRecord(parsed)) {
    return { ok: false, issues: [{ path: '', message: 'YAML root must be a mapping' }] };
  }

  const sectionMustBeObject = (key: string) => {
    if (key in parsed && parsed[key] !== undefined && !isRecord(parsed[key])) {
      issues.push({ path: key, message: 'must be object when provided' });
    }
  };

  sectionMustBeObject('adapters');
  sectionMustBeObject('memory');
  sectionMustBeObject('search');
  sectionMustBeObject('skills');
  sectionMustBeObject('embedding');
  sectionMustBeObject('mcp');
  sectionMustBeObject('audit');
  sectionMustBeObject('privacy');
  sectionMustBeObject('security');

  return { ok: issues.length === 0, issues };
}

function mergeToggle(defaults: AdapterToggle, raw: unknown): AdapterToggle {
  if (isRecord(raw) && typeof raw.enabled === 'boolean') {
    return { enabled: raw.enabled };
  }
  return defaults;
}

function mergeTransport(raw: unknown): 'stdio' | 'http' {
  return raw === 'http' ? 'http' : 'stdio';
}

function mergeJsonlRotation(
  raw: unknown,
  fallback: AuditConfigSection['jsonlRotation'],
): AuditConfigSection['jsonlRotation'] {
  if (raw === 'daily' || raw === 'none' || raw === 'monthly') {
    return raw;
  }
  return fallback;
}

/** Deep-merges user YAML over defaults to produce a fully populated config object. */
export function mergeWithDefaults(partial: unknown): SherpaConfig {
  const defaults = getDefaultConfig();
  if (!isRecord(partial)) return defaults;

  const adaptersIn = isRecord(partial.adapters) ? partial.adapters : {};
  const memoryIn = isRecord(partial.memory) ? partial.memory : {};
  const searchIn = isRecord(partial.search) ? partial.search : {};
  const skillsIn = isRecord(partial.skills) ? partial.skills : {};
  const embeddingIn = isRecord(partial.embedding) ? partial.embedding : {};
  const openaiIn = isRecord(embeddingIn.openai) ? embeddingIn.openai : {};
  const ollamaIn = isRecord(embeddingIn.ollama) ? embeddingIn.ollama : {};
  const mcpIn = isRecord(partial.mcp) ? partial.mcp : {};
  const auditIn = isRecord(partial.audit) ? partial.audit : {};
  const privacyIn = isRecord(partial.privacy) ? partial.privacy : {};
  const securityIn = isRecord(partial.security) ? partial.security : {};

  return {
    adapters: {
      filesystem: mergeToggle(defaults.adapters.filesystem, adaptersIn.filesystem),
      git: mergeToggle(defaults.adapters.git, adaptersIn.git),
      ide: mergeToggle(defaults.adapters.ide, adaptersIn.ide),
      terminal: mergeToggle(defaults.adapters.terminal, adaptersIn.terminal),
      http: mergeToggle(defaults.adapters.http, adaptersIn.http),
    },
    memory: {
      databasePath: str(memoryIn.databasePath) ? memoryIn.databasePath : defaults.memory.databasePath,
      workspaceIsolation: bool(memoryIn.workspaceIsolation) ? memoryIn.workspaceIsolation : defaults.memory.workspaceIsolation,
    },
    search: {
      provider: str(searchIn.provider) ? searchIn.provider : defaults.search.provider,
      maxResults: num(searchIn.maxResults) ? searchIn.maxResults : defaults.search.maxResults,
    },
    skills: {
      roots: strArr(skillsIn.roots) ? [...skillsIn.roots] : [...defaults.skills.roots],
      autoDiscover: bool(skillsIn.autoDiscover) ? skillsIn.autoDiscover : defaults.skills.autoDiscover,
    },
    embedding: {
      provider: str(embeddingIn.provider) ? embeddingIn.provider : defaults.embedding.provider,
      dimensions: num(embeddingIn.dimensions) ? embeddingIn.dimensions : defaults.embedding.dimensions,
      openai: {
        model: str(openaiIn.model) ? openaiIn.model : defaults.embedding.openai.model,
        baseUrl: str(openaiIn.baseUrl) ? openaiIn.baseUrl : defaults.embedding.openai.baseUrl,
      },
      ollama: {
        baseUrl: str(ollamaIn.baseUrl) ? ollamaIn.baseUrl : defaults.embedding.ollama.baseUrl,
        model: str(ollamaIn.model) ? ollamaIn.model : defaults.embedding.ollama.model,
      },
    },
    mcp: {
      enabled: bool(mcpIn.enabled) ? mcpIn.enabled : defaults.mcp.enabled,
      transport: mergeTransport(mcpIn.transport),
      port: num(mcpIn.port) ? mcpIn.port : defaults.mcp.port,
    },
    audit: {
      enabled: bool(auditIn.enabled) ? auditIn.enabled : defaults.audit.enabled,
      jsonlRotation: mergeJsonlRotation(auditIn.jsonlRotation, defaults.audit.jsonlRotation),
      integrityChecksOnStartup: bool(auditIn.integrityChecksOnStartup)
        ? auditIn.integrityChecksOnStartup
        : defaults.audit.integrityChecksOnStartup,
    },
    privacy: {
      redactSecrets: bool(privacyIn.redactSecrets) ? privacyIn.redactSecrets : defaults.privacy.redactSecrets,
      allowTelemetry: bool(privacyIn.allowTelemetry) ? privacyIn.allowTelemetry : defaults.privacy.allowTelemetry,
    },
    security: {
      requireTlsForRemoteProviders: bool(securityIn.requireTlsForRemoteProviders)
        ? securityIn.requireTlsForRemoteProviders
        : defaults.security.requireTlsForRemoteProviders,
      allowedHosts: strArr(securityIn.allowedHosts) ? [...securityIn.allowedHosts] : [...defaults.security.allowedHosts],
    },
  };
}
