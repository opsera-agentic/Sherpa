import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AuditEventRepository, type SqliteDatabase } from '@sherpa/infra-sqlite';

/** Persisted audit fact including tamper-evident hash-chain fields. */
export interface AuditEvent {
  readonly id: string;
  readonly actor: string;
  readonly operation: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details: Record<string, unknown>;
  readonly checksum: string;
  readonly prev_checksum: string;
  readonly created_at: number;
}

export type AuditLogInput = {
  readonly operation: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details?: Record<string, unknown>;
};

/** How the mirrored JSONL audit files are split over time. */
export type JsonlRotation = 'monthly' | 'daily' | 'none';

/** Filename stem (no extension) for the JSONL mirror given a rotation policy. */
export function jsonlRotationKey(createdAtMs: number, rotation: JsonlRotation): string {
  const iso = new Date(createdAtMs).toISOString();
  switch (rotation) {
    case 'daily':
      return iso.slice(0, 10); // YYYY-MM-DD
    case 'none':
      return 'audit'; // single rolling file
    case 'monthly':
    default:
      return iso.slice(0, 7); // YYYY-MM
  }
}

/** MCP-facing telemetry payloads routed through {@link AuditService}. */
export interface AuditTrailEvent {
  readonly module: string;
  readonly operation: string;
  readonly payload?: Record<string, unknown>;
}

/** Narrow audit recorder surface for transports that cannot construct full {@link AuditService} chains. */
export interface AuditTrail {
  record(event: AuditTrailEvent): void;
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function chainMaterial(row: {
  readonly actor: string;
  readonly operation: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details: Record<string, unknown>;
  readonly created_at: number;
}): string {
  return stableStringify({
    actor: row.actor,
    operation: row.operation,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    details: row.details,
    created_at: row.created_at,
  });
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function checksumFrom(previousChecksum: string, row: Parameters<typeof chainMaterial>[0]): string {
  return sha256Hex(previousChecksum + chainMaterial(row));
}

/** Writes immutable audit rows into SQLite plus mirrored JSONL (UTC monthly filenames). */
export class AuditService implements AuditTrail {
  private readonly repo: AuditEventRepository;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly projectRoot: string,
    private readonly rotation: JsonlRotation = 'monthly',
  ) {
    this.repo = new AuditEventRepository(db);
  }

  log(event: AuditLogInput): void {
    const actor = os.userInfo().username;
    const created_at = Date.now();
    const details = event.details ?? {};
    const prev_checksum = this.repo.latestChecksum() ?? '';
    const body = {
      actor,
      operation: event.operation,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      details,
      created_at,
    };
    const checksum = checksumFrom(prev_checksum, body);
    const id = randomUUID();

    this.repo.insert({
      id,
      actor,
      operation: event.operation,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      details: JSON.stringify(details),
      checksum,
      prev_checksum,
      created_at,
    });

    const auditDir = path.join(this.projectRoot, '.sherpa', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const fileKey = jsonlRotationKey(created_at, this.rotation);
    const jsonlPath = path.join(auditDir, `${fileKey}.jsonl`);
    fs.appendFileSync(
      jsonlPath,
      `${JSON.stringify({
        id,
        actor,
        operation: event.operation,
        resource_type: event.resource_type,
        resource_id: event.resource_id,
        details,
        prev_checksum,
        checksum,
        created_at,
      })}\n`,
      'utf8',
    );
  }

  record(event: AuditTrailEvent): void {
    this.log({
      operation: `${event.module}.${event.operation}`,
      resource_type: 'mcp.telemetry',
      resource_id: event.module,
      details: event.payload ?? {},
    });
  }

  /** Recomputes SHA-256 links across persisted SQLite rows. */
  verify(): VerificationResult {
    const errors: string[] = [];
    const rows = this.repo.listOrderedByCreatedAt();
    let previousChecksum = '';

    for (const row of rows) {
      let details: Record<string, unknown>;
      try {
        details = JSON.parse(row.details) as Record<string, unknown>;
      } catch {
        errors.push(`event ${row.id}: details JSON is malformed`);
        continue;
      }

      if (row.prev_checksum !== previousChecksum) {
        errors.push(`event ${row.id}: prev_checksum mismatch (expected ${previousChecksum}, stored ${row.prev_checksum})`);
      }

      const body = {
        actor: row.actor,
        operation: row.operation,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        details,
        created_at: row.created_at,
      };
      const expected = checksumFrom(row.prev_checksum, body);
      if (expected !== row.checksum) {
        errors.push(`event ${row.id}: checksum recomputation failed`);
      }

      previousChecksum = row.checksum;
    }

    return { valid: errors.length === 0, errors };
  }
}
