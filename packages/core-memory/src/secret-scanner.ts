export interface SecretMatch {
  ruleId: string;
  /** Short excerpt around the match for logs or UX (redacted where practical). */
  snippet: string;
}

export interface ScanResult {
  /** True when at least one suspicious pattern matched. */
  found: boolean;
  matches: SecretMatch[];
}

const RULES: { id: string; regex: RegExp }[] = [
  {
    id: 'aws_access_key_id',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'private_key_block',
    regex: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g,
  },
  {
    id: 'password_assignment',
    regex: /\bpassword\s*=\s*([^\s;'"`]{3,})/gi,
  },
  {
    id: 'api_key_assignment',
    regex: /\bapi_key\s*=\s*([^\s;'"`]{3,})/gi,
  },
  {
    id: 'json_secret',
    regex: /["'](?:password|passwd|pwd|secret|token|api_key|apikey|auth_token|dbpsw)["']\s*[:=]\s*["']([^"']{3,})["']/gi,
  },
  {
    id: 'mongodb_uri',
    regex: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@/gi,
  },
  {
    id: 'github_pat',
    regex: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g,
  },
  {
    id: 'generic_bearer',
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}=*/gi,
  },
  {
    id: 'high_entropy_hex',
    regex: /["'][0-9a-fA-F]{32,}["']/g,
  },
];

function clipSnippet(text: string, start: number, end: number, radius = 24): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  const slice = text.slice(s, e).replace(/\s+/g, ' ');
  return slice.length > 120 ? `${slice.slice(0, 117)}…` : slice;
}

/**
 * Pattern-based secret detection suitable for blocking risky persistence paths.
 * This is heuristic and should be complemented by dedicated secret managers and scanning in CI.
 */
export function scanForSecrets(content: string): ScanResult {
  const matches: SecretMatch[] = [];

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(content)) !== null) {
      matches.push({
        ruleId: rule.id,
        snippet: clipSnippet(content, m.index, m.index + m[0].length),
      });
      // Avoid infinite loops on zero-length matches
      if (m[0].length === 0) {
        rule.regex.lastIndex++;
      }
    }
  }

  return { found: matches.length > 0, matches };
}
