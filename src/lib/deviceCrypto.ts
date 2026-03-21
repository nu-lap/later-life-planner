import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256, Aes256Gcm } from '@hpke/core';
import {
  base64ToBytes,
  bytesToBase64,
} from '@/lib/crypto';
import { idbGet, idbSet } from '@/lib/indexedDbKv';

const DEVICE_ID_KEY_PREFIX = 'llp.deviceId.';
const USER_KEK_KEY_PREFIX = 'llp.userKek.';
const DEVICE_KEYPAIR_KEY_PREFIX = 'llp.deviceKeypair.';
const USER_DEK_KEY_PREFIX = 'llp.userDek.';

export interface HpkeDeviceKeyPair {
  privateKeyB64: string;
  publicKeyB64: string;
}

export interface DeviceApprovalRequest {
  requestId: string;
  expiresAt: string;
}

interface EncryptedSecretV1 {
  v: 1;
  ivB64: string;
  ciphertextB64: string;
}

interface StoredHpkeDeviceKeyPairV1 {
  v: 1;
  publicKeyB64: string;
  privateKey: EncryptedSecretV1;
}

function normalizeHpkeBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

export async function publicKeyFingerprintB64(publicKeyB64: string): Promise<string> {
  const bytes = Uint8Array.from(base64ToBytes(publicKeyB64));
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64(new Uint8Array(digest));
}

async function getOrCreateUserKek(userId: string): Promise<CryptoKey> {
  const key = `${USER_KEK_KEY_PREFIX}${userId}`;
  const existing = await idbGet<CryptoKey>(key);
  if (existing) return existing;

  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }

  const created = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await idbSet(key, created);
  return created;
}

async function encryptSecretForUser(userId: string, plaintext: Uint8Array): Promise<EncryptedSecretV1> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }
  const kek = await getOrCreateUserKek(userId);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    Uint8Array.from(plaintext),
  );
  return {
    v: 1,
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptSecretForUser(userId: string, wrapped: EncryptedSecretV1): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }
  const kek = await getOrCreateUserKek(userId);
  const iv = Uint8Array.from(base64ToBytes(wrapped.ivB64));
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kek,
    Uint8Array.from(base64ToBytes(wrapped.ciphertextB64)),
  );
  return new Uint8Array(plaintext);
}

export function hpkeSuite() {
  return new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes256Gcm(),
  });
}

export async function getOrCreateDeviceId(userId: string): Promise<string> {
  const key = `${DEVICE_ID_KEY_PREFIX}${userId}`;
  const existing = await idbGet<string>(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await idbSet(key, created);
  return created;
}

export async function getOrCreateDeviceKeyPair(userId: string): Promise<HpkeDeviceKeyPair> {
  const key = `${DEVICE_KEYPAIR_KEY_PREFIX}${userId}`;
  const existing = await idbGet<StoredHpkeDeviceKeyPairV1 | HpkeDeviceKeyPair>(key);
  if (existing) {
    if (
      typeof (existing as StoredHpkeDeviceKeyPairV1).v === 'number' &&
      (existing as StoredHpkeDeviceKeyPairV1).v === 1
    ) {
      const stored = existing as StoredHpkeDeviceKeyPairV1;
      const privateKeyRaw = await decryptSecretForUser(userId, stored.privateKey);
      return { privateKeyB64: bytesToBase64(privateKeyRaw), publicKeyB64: stored.publicKeyB64 };
    }

    const legacy = existing as HpkeDeviceKeyPair;
    if (legacy.privateKeyB64 && legacy.publicKeyB64) {
      const wrapped = await encryptSecretForUser(userId, base64ToBytes(legacy.privateKeyB64));
      const upgraded: StoredHpkeDeviceKeyPairV1 = {
        v: 1,
        publicKeyB64: legacy.publicKeyB64,
        privateKey: wrapped,
      };
      await idbSet(key, upgraded);
      return legacy;
    }
  }

  const suite = hpkeSuite();
  const kp = await suite.kem.generateKeyPair();
  const privRaw = new Uint8Array(await suite.kem.serializePrivateKey(kp.privateKey));
  const pubB64 = bytesToBase64(new Uint8Array(await suite.kem.serializePublicKey(kp.publicKey)));
  const wrapped = await encryptSecretForUser(userId, privRaw);

  const stored: StoredHpkeDeviceKeyPairV1 = { v: 1, publicKeyB64: pubB64, privateKey: wrapped };
  await idbSet(key, stored);
  return { privateKeyB64: bytesToBase64(privRaw), publicKeyB64: pubB64 };
}

export function createApprovalRequest(ttlMs: number): DeviceApprovalRequest {
  const requestId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return { requestId, expiresAt };
}

export async function getUserDekB64(userId: string): Promise<string | null> {
  const key = `${USER_DEK_KEY_PREFIX}${userId}`;
  const existing = await idbGet<EncryptedSecretV1 | string>(key);
  if (!existing) return null;

  if (typeof existing === 'string') {
    const wrapped = await encryptSecretForUser(userId, base64ToBytes(existing));
    await idbSet(key, wrapped);
    return existing;
  }

  if (existing.v !== 1) {
    throw new Error('Unsupported DEK storage version.');
  }

  const plaintext = await decryptSecretForUser(userId, existing);
  return bytesToBase64(plaintext);
}

export async function setUserDekB64(userId: string, dekB64: string): Promise<void> {
  const key = `${USER_DEK_KEY_PREFIX}${userId}`;
  const wrapped = await encryptSecretForUser(userId, base64ToBytes(dekB64));
  await idbSet(key, wrapped);
}

export function plannerDekWrapAad(input: {
  userId: string;
  deviceId: string;
  requestId: string;
  schemaVersion: number;
  expiresAt: string;
}): Uint8Array {
  const payload = JSON.stringify({
    scope: 'planner-dek-wrap',
    userId: input.userId,
    deviceId: input.deviceId,
    requestId: input.requestId,
    schemaVersion: input.schemaVersion,
    expiresAt: input.expiresAt,
  });
  return new TextEncoder().encode(payload);
}

export async function hpkeSealForRecipient(input: {
  recipientPublicKeyB64: string;
  plaintext: Uint8Array;
  aad?: Uint8Array;
}): Promise<{ encB64: string; ciphertextB64: string }> {
  const suite = hpkeSuite();
  const recipientPublicKey = await suite.kem.deserializePublicKey(
    Uint8Array.from(base64ToBytes(input.recipientPublicKeyB64)),
  );
  const sender = await suite.createSenderContext({ recipientPublicKey });
  const ciphertext = await sender.seal(input.plaintext, input.aad);
  return {
    encB64: bytesToBase64(normalizeHpkeBytes(sender.enc)),
    ciphertextB64: bytesToBase64(normalizeHpkeBytes(ciphertext)),
  };
}

export async function hpkeOpenAsRecipient(input: {
  recipientPrivateKeyB64: string;
  encB64: string;
  ciphertextB64: string;
  aad?: Uint8Array;
}): Promise<Uint8Array> {
  const suite = hpkeSuite();
  const recipientKey = await suite.kem.deserializePrivateKey(
    Uint8Array.from(base64ToBytes(input.recipientPrivateKeyB64)),
  );
  const recipient = await suite.createRecipientContext({
    recipientKey,
    enc: Uint8Array.from(base64ToBytes(input.encB64)),
  });
  const opened = await recipient.open(base64ToBytes(input.ciphertextB64), input.aad);
  return normalizeHpkeBytes(opened);
}

export async function unwrapDekToBase64(input: {
  recipientPrivateKeyB64: string;
  encB64: string;
  ciphertextB64: string;
  aad?: Uint8Array;
}): Promise<string> {
  const dekRaw = await hpkeOpenAsRecipient(input);
  return bytesToBase64(dekRaw);
}

export function dekBase64ToRawBytes(dekB64: string): Uint8Array {
  return base64ToBytes(dekB64);
}
