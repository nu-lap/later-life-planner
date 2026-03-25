import { createHash } from 'node:crypto';

// Minimal audit log helper. Intended for server-side routes only.
// Never include planner plaintext, DEKs, device private keys, or ciphertext payloads.
const REDACTED_VALUE = '[REDACTED]';
const REDACTED_LONG_STRING = '[REDACTED_LONG_STRING]';
const REDACTED_CIRCULAR = '[REDACTED_CIRCULAR]';
const REDACTED_DEPTH = '[REDACTED_DEPTH]';
const MAX_STRING_LOG_LENGTH = 180;
const MAX_LOG_DEPTH = 5;

const SENSITIVE_FIELD_TOKENS = [
  'plaintext',
  'decrypted',
  'ciphertext',
  'wrappedkey',
  'wrappeddek',
  'iv',
  'dek',
  'privatekey',
  'publickey',
  'passphrase',
  'plannerstate',
  'plannerpayload',
  'lifevision',
  'aspiration',
  'spending',
  'income',
  'asset',
  'assumption',
  'projection',
  'person1',
  'person2',
  'carereserve',
];

function normalizeFieldToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveField(fieldName: string): boolean {
  const normalizedField = normalizeFieldToken(fieldName);
  if (!normalizedField) return false;
  return SENSITIVE_FIELD_TOKENS.some((token) => normalizedField.includes(token));
}

function sanitizeAuditValue(
  value: unknown,
  fieldName: string,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (isSensitiveField(fieldName)) {
    return REDACTED_VALUE;
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LOG_LENGTH ? REDACTED_LONG_STRING : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (depth >= MAX_LOG_DEPTH) return REDACTED_DEPTH;
    return value.map((entry) => sanitizeAuditValue(entry, fieldName, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return REDACTED_CIRCULAR;
    if (depth >= MAX_LOG_DEPTH) return REDACTED_DEPTH;
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sanitizeAuditValue(nestedValue, key, depth + 1, seen);
    }
    return output;
  }

  return String(value);
}

function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    output[key] = sanitizeAuditValue(value, key, 0, seen);
  }
  return output;
}

export function auditLog(event: string, details: Record<string, unknown>): void {
  try {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...sanitizeAuditDetails(details),
    };
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(entry));
  } catch {
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({ ts: new Date().toISOString(), event }));
  }
}

export function sha256Base64FingerprintFromBase64Payload(payloadB64: string): string | null {
  try {
    const bytes = Buffer.from(payloadB64, 'base64');
    if (bytes.length === 0) return null;
    return createHash('sha256').update(bytes).digest('base64');
  } catch {
    return null;
  }
}
