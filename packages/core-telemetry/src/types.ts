/**
 * Telemetry event captured for each CLI command invocation.
 *
 * All fields are anonymous — no PII, file paths, project names, or user content
 * is ever collected. Only command names, durations, and system metadata.
 */
export interface TelemetryEvent {
  /** UUID v4 for this event */
  readonly id: string;
  /** Anonymous machine identifier (SHA-256 hash of hostname + username) */
  readonly anonymous_id: string;
  /** CLI command that was invoked (e.g. "sync", "adapt", "search") */
  readonly command: string;
  /** Whether the command completed without throwing */
  readonly success: boolean;
  /** Wall-clock duration of the command in milliseconds */
  readonly duration_ms: number;
  /** Sherpa CLI version (from package.json) */
  readonly cli_version: string;
  /** Node.js version */
  readonly node_version: string;
  /** Operating system platform (darwin, linux, win32) */
  readonly os_platform: string;
  /** OS architecture (x64, arm64) */
  readonly os_arch: string;
  /** OS version (e.g. "14.5.0" on macOS) */
  readonly os_version: string;
  /** Detected IDE/editor environment (e.g. "vscode", "cursor", "terminal") */
  readonly ide: string;
  /** Install source (e.g. "npm", "npx", "yarn", "pnpm") */
  readonly install_source: string;
  /** IANA timezone (e.g. "America/New_York") */
  readonly timezone: string;
  /** Optional metadata specific to the command (e.g. adapter count, entry count) */
  readonly metadata: Record<string, unknown>;
  /** Unix timestamp in milliseconds */
  readonly created_at: number;
}

/**
 * Telemetry configuration managed via sherpa.config.yaml.
 *
 * Telemetry is enabled by default. On first run, a notice is printed
 * informing the user how to opt out.
 */
export interface TelemetryConfig {
  /** Master switch — when false, no events are recorded or sent (default: false) */
  readonly enabled: boolean;
  /** Remote endpoint for batched event submission (PostHog-compatible) */
  readonly endpoint: string;
  /** PostHog project API key (public, safe to embed — identifies project, not user) */
  readonly apiKey: string;
  /** Maximum events to buffer locally before attempting a flush */
  readonly batchSize: number;
  /** Interval in seconds between automatic flush attempts */
  readonly flushIntervalSeconds: number;
}

/** System information collected once per session, all anonymous. */
export interface SystemInfo {
  readonly anonymousId: string;
  readonly nodeVersion: string;
  readonly osPlatform: string;
  readonly osArch: string;
  readonly cliVersion: string;
  /** Detected IDE/editor (e.g. "vscode", "cursor", "intellij", "terminal") */
  readonly ide: string;
  /** How Sherpa was installed (e.g. "npm", "npx", "yarn", "pnpm", "homebrew", "unknown") */
  readonly installSource: string;
  /** IANA timezone (e.g. "America/New_York") — for regional usage patterns, not location tracking */
  readonly timezone: string;
  /** OS version string (e.g. "14.5.0" on macOS, "6.5.0" on Linux) — for compatibility tracking */
  readonly osVersion: string;
}

/** Aggregated usage statistics for the local `sherpa stats` command. */
export interface UsageStats {
  /** Total events recorded locally */
  readonly totalEvents: number;
  /** Breakdown by command name */
  readonly commandBreakdown: readonly CommandStats[];
  /** Number of unique days with at least one event */
  readonly activeDays: number;
  /** Timestamp of the first recorded event */
  readonly firstEventAt: number | null;
  /** Timestamp of the most recent event */
  readonly lastEventAt: number | null;
  /** Overall success rate as a percentage (0-100) */
  readonly successRate: number;
  /** Average command duration in milliseconds */
  readonly avgDurationMs: number;
}

/** Per-command statistics for the stats dashboard. */
export interface CommandStats {
  readonly command: string;
  readonly count: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly avgDurationMs: number;
  readonly lastUsedAt: number;
}
