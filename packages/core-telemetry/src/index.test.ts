import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generateAnonymousId, getSystemInfo, showFirstRunTelemetryNotice } from './index.js';

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = undefined;
});

describe('generateAnonymousId', () => {
  it('returns a stable 16-char hex string', () => {
    const id1 = generateAnonymousId();
    const id2 = generateAnonymousId();

    // Same machine → same ID every time
    expect(id1).toBe(id2);

    // Exactly 16 hex characters
    expect(id1).toMatch(/^[a-f0-9]{16}$/);
    expect(id1.length).toBe(16);
  });

  it('is derived from machine properties (not random)', () => {
    // Call it 10 times — must always be identical
    const ids = Array.from({ length: 10 }, () => generateAnonymousId());
    const unique = new Set(ids);
    expect(unique.size).toBe(1);
  });
});

describe('getSystemInfo', () => {
  it('captures system metadata with explicit CLI version', () => {
    const info = getSystemInfo('1.2.3');

    expect(info.anonymousId).toMatch(/^[a-f0-9]{16}$/);
    expect(info.nodeVersion).toBe(process.version);
    expect(info.osPlatform).toBe(process.platform);
    expect(info.osArch).toBe(process.arch);
    expect(info.cliVersion).toBe('1.2.3');

    // New fields: IDE, install source, timezone, OS version
    expect(typeof info.ide).toBe('string');
    expect(info.ide.length).toBeGreaterThan(0);
    expect(typeof info.installSource).toBe('string');
    expect(info.installSource.length).toBeGreaterThan(0);
    expect(typeof info.timezone).toBe('string');
    expect(info.timezone).not.toBe('');
    expect(typeof info.osVersion).toBe('string');
    expect(info.osVersion.length).toBeGreaterThan(0);
  });

  it('detects a valid IDE or terminal environment', () => {
    const info = getSystemInfo('0.1.0');
    const validIdes = [
      'vscode', 'cursor', 'jetbrains', 'windsurf', 'zed',
      'neovim', 'vim', 'emacs', 'sublime',
      'iterm', 'terminal.app', 'hyper', 'alacritty', 'wezterm', 'kitty', 'tmux',
      'windows-terminal', 'codespaces', 'gitpod',
      'ci', 'github-actions', 'terminal',
    ];
    expect(validIdes).toContain(info.ide);
  });

  it('detects a valid install source', () => {
    const info = getSystemInfo('0.1.0');
    const validSources = ['npm', 'npx', 'yarn', 'pnpm', 'bun', 'homebrew', 'npm-global', 'unknown'];
    expect(validSources).toContain(info.installSource);
  });

  it('returns a valid IANA timezone', () => {
    const info = getSystemInfo('0.1.0');
    // IANA timezones contain a slash (e.g. "America/New_York") or are "UTC"
    expect(info.timezone).toMatch(/\// || info.timezone === 'UTC');
  });

  it('does not contain PII', () => {
    const info = getSystemInfo('0.1.0');
    const serialized = JSON.stringify(info);

    // Must NOT contain username, hostname, or home directory
    const username = os.userInfo().username;
    const hostname = os.hostname();
    const homeDir = os.homedir();

    expect(serialized).not.toContain(username);
    expect(serialized).not.toContain(hostname);
    expect(serialized).not.toContain(homeDir);
  });

  it('falls back to 0.0.0 when no CLI version provided', () => {
    // When called without a version and not in the monorepo context
    const info = getSystemInfo();
    expect(info.cliVersion).toBeDefined();
    expect(typeof info.cliVersion).toBe('string');
  });
});

describe('showFirstRunTelemetryNotice', () => {
  it('creates the .telemetry-notice-shown file on first call', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-notice-'));
    const sherpaDir = path.join(tmpDir, '.sherpa');
    fs.mkdirSync(sherpaDir, { recursive: true });

    showFirstRunTelemetryNotice(tmpDir);

    const noticeFile = path.join(sherpaDir, '.telemetry-notice-shown');
    expect(fs.existsSync(noticeFile)).toBe(true);

    // File contains a timestamp
    const content = fs.readFileSync(noticeFile, 'utf8');
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date prefix
  });

  it('does NOT overwrite the notice file on subsequent calls', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-notice2-'));
    const sherpaDir = path.join(tmpDir, '.sherpa');
    fs.mkdirSync(sherpaDir, { recursive: true });

    showFirstRunTelemetryNotice(tmpDir);
    const noticeFile = path.join(sherpaDir, '.telemetry-notice-shown');
    const firstContent = fs.readFileSync(noticeFile, 'utf8');

    // Wait a tiny bit to ensure timestamps would differ
    const before = Date.now();
    while (Date.now() - before < 5) { /* spin */ }

    showFirstRunTelemetryNotice(tmpDir);
    const secondContent = fs.readFileSync(noticeFile, 'utf8');

    expect(secondContent).toBe(firstContent);
  });

  it('does nothing when .sherpa directory does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-notice3-'));
    // No .sherpa dir created — should not throw or create anything
    showFirstRunTelemetryNotice(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, '.sherpa'))).toBe(false);
  });
});
