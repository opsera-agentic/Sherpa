import { createHash } from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import type { SystemInfo } from './types.js';

/**
 * Generate a stable, anonymous machine identifier.
 *
 * Uses SHA-256 hash of (hostname + username + home directory) so it is:
 * - Deterministic across sessions on the same machine
 * - Not reversible back to PII
 * - Unique enough to distinguish machines without identifying users
 */
export function generateAnonymousId(): string {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const homeDir = os.homedir();
  const raw = `${hostname}:${username}:${homeDir}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Collect anonymous system metadata for telemetry events.
 *
 * Captures: Node version, OS platform/arch/version, CLI version,
 * IDE environment, install source, and timezone.
 * No IP addresses, file paths, or user-identifiable data.
 */
export function getSystemInfo(cliVersion?: string): SystemInfo {
  const resolvedVersion = cliVersion ?? readCliVersion();
  return {
    anonymousId: generateAnonymousId(),
    nodeVersion: process.version,
    osPlatform: process.platform,
    osArch: process.arch,
    osVersion: getOsVersion(),
    cliVersion: resolvedVersion,
    ide: detectIde(),
    installSource: detectInstallSource(),
    timezone: getTimezone(),
  };
}

/**
 * Detect which IDE/editor is running Sherpa.
 *
 * Checks environment variables that IDEs set when spawning terminals.
 * Returns the IDE name or "terminal" if run from a standalone shell.
 */
function detectIde(): string {
  const env = process.env;

  // VS Code sets TERM_PROGRAM and VSCODE_* vars in its integrated terminal
  if (env.VSCODE_PID || env.VSCODE_CWD || env.TERM_PROGRAM === 'vscode') {
    return 'vscode';
  }

  // Cursor (fork of VS Code) sets its own env vars
  if (env.CURSOR_TRACE_ID || env.TERM_PROGRAM === 'cursor') {
    return 'cursor';
  }

  // JetBrains IDEs (IntelliJ, WebStorm, PyCharm, etc.)
  if (env.JETBRAINS_IDE || env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') {
    return 'jetbrains';
  }

  // Windsurf (Codeium's IDE)
  if (env.WINDSURF_PID || env.TERM_PROGRAM === 'windsurf') {
    return 'windsurf';
  }

  // Zed editor
  if (env.ZED_TERM) {
    return 'zed';
  }

  // Neovim
  if (env.NVIM || env.NVIM_LISTEN_ADDRESS) {
    return 'neovim';
  }

  // Vim
  if (env.VIM || env.VIMRUNTIME) {
    return 'vim';
  }

  // Emacs
  if (env.INSIDE_EMACS || env.EMACS) {
    return 'emacs';
  }

  // Sublime Text
  if (env.SUBLIME_TEXT) {
    return 'sublime';
  }

  // Common terminal emulators
  const termProgram = env.TERM_PROGRAM?.toLowerCase() ?? '';
  if (termProgram === 'iterm.app') return 'iterm';
  if (termProgram === 'apple_terminal') return 'terminal.app';
  if (termProgram === 'hyper') return 'hyper';
  if (termProgram === 'alacritty') return 'alacritty';
  if (termProgram === 'wezterm') return 'wezterm';
  if (termProgram === 'kitty') return 'kitty';
  if (termProgram === 'tmux') return 'tmux';

  // Windows Terminal
  if (env.WT_SESSION) return 'windows-terminal';

  // GitHub Codespaces / Gitpod
  if (env.CODESPACES === 'true') return 'codespaces';
  if (env.GITPOD_WORKSPACE_ID) return 'gitpod';

  // CI environments (not really IDEs, but useful to know)
  if (env.CI === 'true' || env.CI === '1') return 'ci';
  if (env.GITHUB_ACTIONS === 'true') return 'github-actions';

  return 'terminal';
}

/**
 * Detect how Sherpa was installed.
 *
 * Checks the npm_config_user_agent env var which npm/yarn/pnpm set
 * when running scripts. Falls back to checking common paths.
 */
function detectInstallSource(): string {
  const userAgent = process.env.npm_config_user_agent ?? '';

  if (userAgent.startsWith('pnpm/')) return 'pnpm';
  if (userAgent.startsWith('yarn/')) return 'yarn';
  if (userAgent.startsWith('bun/')) return 'bun';
  if (userAgent.includes('npx')) return 'npx';
  if (userAgent.startsWith('npm/')) return 'npm';

  // Check if running via Homebrew
  const execPath = process.argv[1] ?? '';
  if (execPath.includes('/homebrew/') || execPath.includes('/Cellar/')) return 'homebrew';

  // Check if globally installed
  if (execPath.includes('/lib/node_modules/')) return 'npm-global';

  return 'unknown';
}

/**
 * Get the user's IANA timezone.
 *
 * Uses Intl.DateTimeFormat which is available in all modern Node.js versions.
 * Returns a timezone like "America/New_York" — useful for understanding
 * regional adoption patterns without tracking location.
 */
function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'unknown';
  }
}

/**
 * Get the OS version string.
 *
 * Returns the kernel/OS release version (e.g. "14.5.0" on macOS,
 * "6.5.0-44-generic" on Linux). Useful for compatibility tracking.
 */
function getOsVersion(): string {
  return os.release();
}

/** Read CLI version from the nearest cli-app package.json. */
function readCliVersion(): string {
  try {
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'packages', 'cli-app', 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
        return pkg.version ?? '0.0.0';
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fall through
  }
  return '0.0.0';
}
