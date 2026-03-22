import { createHash } from 'node:crypto';

// Minimal audit log helper. Intended for server-side routes only.
// Never include planner plaintext, DEKs, device private keys, or ciphertext payloads.
export function auditLog(event: string, details: Record<string, unknown>): void {
  try {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...details,
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

