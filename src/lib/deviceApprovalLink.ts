function b64EncodeAscii(value: string): string {
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(value);
  return Buffer.from(value, 'utf8').toString('base64');
}

function b64DecodeAscii(value: string): string {
  if (typeof globalThis.atob === 'function') return globalThis.atob(value);
  return Buffer.from(value, 'base64').toString('utf8');
}

export function encodeApprovalCodeToFragment(codeJson: string): string {
  // JSON payload is ASCII; btoa/atob are safe and keep dependencies minimal.
  return encodeURIComponent(b64EncodeAscii(codeJson));
}

export function decodeApprovalCodeFromFragment(encoded: string): string | null {
  try {
    return b64DecodeAscii(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

export function buildDeviceApprovalLink(origin: string, codeJson: string): string {
  const encoded = encodeApprovalCodeToFragment(codeJson);
  return `${origin}/account/devices/approve#code=${encoded}`;
}

export function extractApprovalCodeJson(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw JSON payload (fallback path).
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  // Full link or fragment-based payload.
  try {
    const url = new URL(trimmed);
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const params = new URLSearchParams(hash);
    const encoded = params.get('code');
    if (!encoded) return null;
    return decodeApprovalCodeFromFragment(encoded);
  } catch {
    // Not a valid URL; attempt to parse as a raw fragment
    const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const params = new URLSearchParams(raw);
    const encoded = params.get('code');
    if (!encoded) return null;
    return decodeApprovalCodeFromFragment(encoded);
  }
}
