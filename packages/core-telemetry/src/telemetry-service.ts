import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

import { TelemetryRepository } from './telemetry-repository.js';
import { getSystemInfo } from './identity.js';
import type { TelemetryConfig, TelemetryEvent, SystemInfo, UsageStats } from './types.js';

// Re-export Database type from infra-sqlite so callers don't need the direct dep
import type { SqliteDatabase } from '@sherpa/infra-sqlite';

/**
 * Central telemetry service for Sherpa CLI.
 *
 * Design principles:
 * 1. **Opt-in only** — no data is collected unless the user explicitly enables telemetry
 * 2. **Anonymous** — machine ID is a truncated SHA-256 hash, no PII ever leaves the machine
 * 3. **Local-first** — events are always stored in the local SQLite DB first
 * 4. **Batched flush** — events are sent to the remote endpoint in batches, failures are silent
 * 5. **Non-blocking** — remote sends are fire-and-forget, never delaying the CLI
 * 6. **Transparent** — `sherpa stats` shows exactly what is collected, `sherpa telemetry status` shows config
 *
 * Data collected per event:
 * - Command name (e.g. "sync", "adapt")
 * - Success/failure boolean
 * - Duration in milliseconds
 * - CLI version, Node version, OS platform, OS arch
 * - Optional metadata (e.g. adapter count, entry count — never file contents or paths)
 *
 * Data NEVER collected:
 * - File paths, project names, or directory structures
 * - File contents, memory entries, or convention text
 * - IP addresses (not logged server-side)
 * - Usernames, hostnames, or any PII
 */
export class TelemetryService {
  private readonly repo: TelemetryRepository;
  private readonly config: TelemetryConfig;
  private readonly systemInfo: SystemInfo;

  constructor(db: SqliteDatabase, config: TelemetryConfig, cliVersion?: string) {
    this.repo = new TelemetryRepository(db);
    this.config = config;
    this.systemInfo = getSystemInfo(cliVersion);
  }

  /**
   * Record a CLI command execution as a telemetry event.
   *
   * This is the primary entry point — called by each command handler
   * after execution completes (or fails).
   */
  recordCommand(command: string, success: boolean, durationMs: number, metadata: Record<string, unknown> = {}): void {
    if (!this.config.enabled) return;

    const event: TelemetryEvent = {
      id: randomUUID(),
      anonymous_id: this.systemInfo.anonymousId,
      command,
      success,
      duration_ms: Math.round(durationMs),
      cli_version: this.systemInfo.cliVersion,
      node_version: this.systemInfo.nodeVersion,
      os_platform: this.systemInfo.osPlatform,
      os_arch: this.systemInfo.osArch,
      os_version: this.systemInfo.osVersion,
      ide: this.systemInfo.ide,
      install_source: this.systemInfo.installSource,
      timezone: this.systemInfo.timezone,
      metadata,
      created_at: Date.now(),
    };

    this.repo.insert(event);

    // Auto-flush if we've accumulated enough events
    if (this.repo.pendingCount() >= this.config.batchSize) {
      this.flush().catch(() => {
        // Silent failure — telemetry must never break the CLI
      });
    }
  }

  /**
   * Flush pending events to the remote endpoint (PostHog-compatible).
   *
   * Uses the PostHog /capture/batch API format. Events that fail to send
   * remain in local storage and will be retried on the next flush.
   *
   * This method is async but designed to be fire-and-forget. Callers
   * should not await it in the critical path.
   */
  async flush(): Promise<{ sent: number; failed: boolean }> {
    if (!this.config.enabled || !this.config.endpoint || !this.config.apiKey) {
      return { sent: 0, failed: false };
    }

    const events = this.repo.getUnflushed(this.config.batchSize);
    if (events.length === 0) return { sent: 0, failed: false };

    // Transform to PostHog batch format
    const batch = events.map((e) => ({
      event: `sherpa_${e.command}`,
      distinct_id: e.anonymous_id,
      timestamp: new Date(e.created_at).toISOString(),
      properties: {
        command: e.command,
        success: e.success,
        duration_ms: e.duration_ms,
        cli_version: e.cli_version,
        node_version: e.node_version,
        os_platform: e.os_platform,
        os_arch: e.os_arch,
        os_version: e.os_version,
        ide: e.ide,
        install_source: e.install_source,
        $timezone: e.timezone,
        ...e.metadata,
        $lib: 'sherpa-cli',
        $lib_version: e.cli_version,
      },
    }));

    const payload = JSON.stringify({
      api_key: this.config.apiKey,
      batch,
    });

    try {
      await this.postJson(this.config.endpoint, payload);
      this.repo.markFlushed(events.map((e) => e.id));
      return { sent: events.length, failed: false };
    } catch {
      // Network failure — events stay in local DB for next attempt
      return { sent: 0, failed: true };
    }
  }

  /** Get local usage statistics for `sherpa stats`. */
  getUsageStats(): UsageStats {
    return this.repo.getUsageStats();
  }

  /** Check whether telemetry is currently enabled. */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Get the anonymous machine identifier. */
  getAnonymousId(): string {
    return this.systemInfo.anonymousId;
  }

  /** Get count of events pending remote flush. */
  getPendingCount(): number {
    return this.repo.pendingCount();
  }

  /** Purge local telemetry data older than the given number of days. */
  purge(olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    return this.repo.purgeOlderThan(cutoff);
  }

  /**
   * POST JSON payload to the given URL.
   *
   * Uses Node.js built-in http/https modules to avoid adding any
   * external dependencies. Timeout is set to 5 seconds — telemetry
   * should never slow down the CLI.
   */
  private postJson(url: string, body: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const transport = parsed.protocol === 'https:' ? https : http;

      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 5000,
        },
        (res) => {
          // Drain response body to free the socket
          res.resume();
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.write(body);
      req.end();
    });
  }
}

/**
 * Check if this is the first time Sherpa is being run and print the telemetry notice.
 *
 * Called once from the CLI entry point. The notice file (.sherpa/.telemetry-notice-shown)
 * ensures the message is only displayed once per project.
 */
export function showFirstRunTelemetryNotice(projectRoot: string): void {
  const sherpaDir = path.join(projectRoot, '.sherpa');
  if (!fs.existsSync(sherpaDir)) return;

  const noticeFile = path.join(sherpaDir, '.telemetry-notice-shown');
  if (fs.existsSync(noticeFile)) return;

  process.stderr.write(
    '\n' +
    '  Sherpa can collect anonymous usage metrics to help improve the tool.\n' +
    '  Telemetry is OFF by default — nothing is collected unless you opt in.\n' +
    '  No file contents, paths, or personal data are ever collected.\n' +
    '\n' +
    '  To opt in:   sherpa telemetry enable\n' +
    '  To see what would be collected: sherpa telemetry status\n' +
    '  Learn more:  https://github.com/opsera-public/sherpa/blob/main/docs/telemetry.md\n' +
    '\n',
  );

  try {
    fs.writeFileSync(noticeFile, new Date().toISOString(), 'utf8');
  } catch {
    // Non-critical — if we can't write the notice file, we'll show the notice again next time
  }
}
