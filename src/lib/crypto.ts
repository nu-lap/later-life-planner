const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const PLANNER_SCHEMA_VERSION = 1;
export const AES_GCM_IV_BYTE_LENGTH = 12;
export const DATA_ENCRYPTION_KEY_LENGTH_BITS = 256;
export const MAX_CIPHERTEXT_BYTES = 1024 * 1024;
export const MAX_WRAPPED_KEY_BYTES = 1024;

export interface CipherPayload {
  iv: string;
  ciphertext: string;
}

export type AdditionalAuthenticatedData = Record<string, string | number>;

function isNodeBufferAvailable(): boolean {
  return typeof Buffer !== 'undefined';
}

function encodeBytesBase64(bytes: Uint8Array): string {
  if (isNodeBufferAvailable()) {
    return Buffer.from(bytes).toString('base64');
  }

  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is unavailable in this runtime.');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64Bytes(value: string): Uint8Array {
  if (!isValidBase64(value)) {
    throw new Error('Invalid base64 value.');
  }

  if (isNodeBufferAvailable()) {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  if (typeof atob !== 'function') {
    throw new Error('Base64 decoding is unavailable in this runtime.');
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const cloned = Uint8Array.from(bytes);
  return cloned.buffer;
}

function getSubtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }
  return globalThis.crypto.subtle;
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }
  return globalThis.crypto;
}

function encodeAadBytes(aad?: AdditionalAuthenticatedData): ArrayBuffer | undefined {
  if (!aad) return undefined;
  const stablePairs = Object.entries(aad).sort(([left], [right]) => left.localeCompare(right));
  return toArrayBuffer(new TextEncoder().encode(JSON.stringify(stablePairs)));
}

export function bytesToBase64(bytes: Uint8Array): string {
  return encodeBytesBase64(bytes);
}

export function base64ToBytes(value: string): Uint8Array {
  return decodeBase64Bytes(value);
}

export function isValidBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && BASE64_PATTERN.test(value);
}

export function isExpectedBase64ByteLength(value: string, expectedBytes: number): boolean {
  if (!isValidBase64(value)) return false;
  try {
    return decodeBase64Bytes(value).byteLength === expectedBytes;
  } catch {
    return false;
  }
}

export function getBase64ByteLength(value: string): number | null {
  if (!isValidBase64(value)) return null;
  try {
    return decodeBase64Bytes(value).byteLength;
  } catch {
    return null;
  }
}

export function isCiphertextWithinSizeLimit(value: string, maxBytes = MAX_CIPHERTEXT_BYTES): boolean {
  const size = getBase64ByteLength(value);
  return size !== null && size > 0 && size <= maxBytes;
}

export async function generateDataEncryptionKey(): Promise<CryptoKey> {
  return getSubtleCrypto().generateKey(
    { name: 'AES-GCM', length: DATA_ENCRYPTION_KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportDataEncryptionKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await getSubtleCrypto().exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importDataEncryptionKeyFromBase64(rawKeyBase64: string): Promise<CryptoKey> {
  const rawKeyBytes = base64ToBytes(rawKeyBase64);
  return getSubtleCrypto().importKey(
    'raw',
    toArrayBuffer(rawKeyBytes),
    { name: 'AES-GCM', length: DATA_ENCRYPTION_KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPlannerPayload(
  plaintext: string,
  key: CryptoKey,
  aad?: AdditionalAuthenticatedData,
): Promise<CipherPayload> {
  const ivBytes = getWebCrypto().getRandomValues(new Uint8Array(AES_GCM_IV_BYTE_LENGTH));
  const iv = toArrayBuffer(ivBytes);
  const plaintextBytes = toArrayBuffer(new TextEncoder().encode(plaintext));
  const additionalData = encodeAadBytes(aad);

  const encrypted = await getSubtleCrypto().encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: 128,
    },
    key,
    plaintextBytes,
  );

  return {
    iv: bytesToBase64(ivBytes),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptPlannerPayload(
  payload: CipherPayload,
  key: CryptoKey,
  aad?: AdditionalAuthenticatedData,
): Promise<string> {
  const iv = toArrayBuffer(base64ToBytes(payload.iv));
  const ciphertext = toArrayBuffer(base64ToBytes(payload.ciphertext));
  const additionalData = encodeAadBytes(aad);

  const decrypted = await getSubtleCrypto().decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: 128,
    },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

export async function encryptPlannerState<T>(
  value: T,
  key: CryptoKey,
  aad?: AdditionalAuthenticatedData,
): Promise<CipherPayload> {
  return encryptPlannerPayload(JSON.stringify(value), key, aad);
}

export async function decryptPlannerState<T>(
  payload: CipherPayload,
  key: CryptoKey,
  aad?: AdditionalAuthenticatedData,
): Promise<T> {
  const plaintext = await decryptPlannerPayload(payload, key, aad);
  return JSON.parse(plaintext) as T;
}
