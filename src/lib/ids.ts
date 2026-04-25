/**
 * Returns a UUID v4 string.
 *
 * Uses the Web Crypto API when available (all modern browsers and Node ≥18).
 * Falls back to a timestamp + random string for environments where the API is
 * absent (e.g. non-secure HTTP contexts or older runtimes) so callers never
 * throw at runtime.
 */
export function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
