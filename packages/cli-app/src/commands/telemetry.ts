import fs from 'node:fs';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, getSherpaConfigPath, loadSherpaConfig } from '@sherpa/core-config';
import { generateAnonymousId } from '@sherpa/core-telemetry';
import yaml from 'js-yaml';

export interface TelemetryCommandOptions extends LoggerOptions {
  projectRoot: string;
  action: 'enable' | 'disable' | 'status';
}

/**
 * Handle `sherpa telemetry enable|disable|status`.
 *
 * - enable:  Sets telemetry.enabled = true in sherpa.config.yaml
 * - disable: Sets telemetry.enabled = false in sherpa.config.yaml
 * - status:  Shows current telemetry state, anonymous ID, and pending event count
 */
export async function runTelemetry(opts: TelemetryCommandOptions): Promise<void> {
  const logger = createLogger('telemetry', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);

  if (!fs.existsSync(sherpaDir)) {
    logger.error('telemetry', 'Sherpa not initialized — run `sherpa init` first');
    throw new Error('not initialized');
  }

  if (opts.action === 'status') {
    const config = loadSherpaConfig(opts.projectRoot);
    const anonymousId = generateAnonymousId();
    // Collection requires BOTH the operational toggle and the privacy switch.
    const effective = config.telemetry.enabled && config.privacy.allowTelemetry;

    const payload = {
      enabled: effective,
      telemetryEnabled: config.telemetry.enabled,
      allowTelemetry: config.privacy.allowTelemetry,
      anonymousId,
      endpoint: config.telemetry.endpoint,
      batchSize: config.telemetry.batchSize,
      flushIntervalSeconds: config.telemetry.flushIntervalSeconds,
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }

    process.stdout.write('\n');
    process.stdout.write(`  Telemetry:     ${effective ? 'ENABLED' : 'DISABLED'}\n`);
    process.stdout.write(`  Anonymous ID:  ${anonymousId}\n`);
    process.stdout.write(`  Endpoint:      ${config.telemetry.endpoint || '(none)'}\n`);
    process.stdout.write(`  Batch size:    ${config.telemetry.batchSize}\n`);
    process.stdout.write(`  Flush every:   ${config.telemetry.flushIntervalSeconds}s\n`);
    process.stdout.write('\n');
    process.stdout.write('  What we collect:\n');
    process.stdout.write('    - Command name (e.g. "sync", "adapt")\n');
    process.stdout.write('    - Success/failure and duration\n');
    process.stdout.write('    - CLI version, Node version, OS platform/arch\n');
    process.stdout.write('    - Anonymous machine hash (shown above)\n');
    process.stdout.write('\n');
    process.stdout.write('  What we NEVER collect:\n');
    process.stdout.write('    - File contents, paths, or project names\n');
    process.stdout.write('    - Memory entries or convention text\n');
    process.stdout.write('    - Usernames, hostnames, or any PII\n');
    process.stdout.write('\n');
    return;
  }

  // Enable or disable telemetry by updating the config file
  const configPath = getSherpaConfigPath(opts.projectRoot);
  let rawConfig: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    rawConfig = (yaml.load(content) as Record<string, unknown>) ?? {};
  }

  // Keep both switches in lockstep so they can never contradict each other:
  // enabling sets the operational toggle AND grants the privacy allowance;
  // disabling clears the operational toggle.
  const enable = opts.action === 'enable';
  const telemetrySection = (rawConfig.telemetry as Record<string, unknown>) ?? {};
  telemetrySection.enabled = enable;
  rawConfig.telemetry = telemetrySection;

  const privacySection = (rawConfig.privacy as Record<string, unknown>) ?? {};
  privacySection.allowTelemetry = enable;
  rawConfig.privacy = privacySection;

  fs.writeFileSync(configPath, yaml.dump(rawConfig, { lineWidth: 120, noRefs: true }), 'utf8');

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ enabled: enable })}\n`);
  } else {
    const state = opts.action === 'enable' ? 'enabled' : 'disabled';
    process.stdout.write(`Telemetry ${state}. Run \`sherpa telemetry status\` to see details.\n`);

    if (opts.action === 'enable') {
      process.stdout.write(`Thank you for helping improve Sherpa! Your anonymous ID: ${generateAnonymousId()}\n`);
    }
  }
}
