import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256, Aes256Gcm } from '@hpke/core';
import {
  base64ToBytes,
  bytesToBase64,
  exportDataEncryptionKeyToBase64,
  importDataEncryptionKeyFromBase64,
} from '@/lib/crypto';
import { idbGet, idbSet } from '@/lib/indexedDbKv';

const DEVICE_ID_KEY_PREFIX = 'llp.deviceId.';
const DEVICE_KEYPAIR_KEY_PREFIX = 'llp.deviceKeypair.';
const USER_DEK_KEY_PREFIX = 'llp.userDekB64.';

export interface HpkeDeviceKeyPair {
  privateKeyB64: string;
  publicKeyB64: string;
}

export interface DeviceApprovalRequest {
  requestId: string;
  expiresAt: string;
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
  const existing = await idbGet<HpkeDeviceKeyPair>(key);
  if (existing?.privateKeyB64 && existing.publicKeyB64) return existing;

  const suite = hpkeSuite();
  const kp = await suite.kem.generateKeyPair();
  const priv = bytesToBase64(await suite.kem.serializePrivateKey(kp.privateKey));
  const pub = bytesToBase64(await suite.kem.serializePublicKey(kp.publicKey));
  const created: HpkeDeviceKeyPair = { privateKeyB64: priv, publicKeyB64: pub };
  await idbSet(key, created);
  return created;
}

export function createApprovalRequest(ttlMs: number): DeviceApprovalRequest {
  const requestId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return { requestId, expiresAt };
}

export async function getUserDekB64(userId: string): Promise<string | null> {
  return idbGet<string>(`${USER_DEK_KEY_PREFIX}${userId}`);
}

export async function setUserDekB64(userId: string, dekB64: string): Promise<void> {
  await idbSet(`${USER_DEK_KEY_PREFIX}${userId}`, dekB64);
}

export async function importUserDek(userId: string): Promise<CryptoKey | null> {
  const dekB64 = await getUserDekB64(userId);
  if (!dekB64) return null;
  return importDataEncryptionKeyFromBase64(dekB64);
}

export async function exportDekToBase64(key: CryptoKey): Promise<string> {
  return exportDataEncryptionKeyToBase64(key);
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

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function hpkeSealForRecipient(input: {
  recipientPublicKeyB64: string;
  plaintext: Uint8Array;
  aad?: Uint8Array;
}): Promise<{ encB64: string; ciphertextB64: string }> {
  const suite = hpkeSuite();
  const recipientPublicKey = await suite.kem.deserializePublicKey(base64ToArrayBuffer(input.recipientPublicKeyB64));
  const sender = await suite.createSenderContext({ recipientPublicKey });
  const ciphertext = await sender.seal(input.plaintext, input.aad);
  return {
    encB64: bytesToBase64(sender.enc),
    ciphertextB64: bytesToBase64(ciphertext),
  };
}

export async function hpkeOpenAsRecipient(input: {
  recipientPrivateKeyB64: string;
  encB64: string;
  ciphertextB64: string;
  aad?: Uint8Array;
}): Promise<Uint8Array> {
  const suite = hpkeSuite();
  const recipientKey = await suite.kem.deserializePrivateKey(base64ToArrayBuffer(input.recipientPrivateKeyB64));
  const recipient = await suite.createRecipientContext({
    recipientKey,
    enc: base64ToArrayBuffer(input.encB64),
  });
  return recipient.open(base64ToBytes(input.ciphertextB64), input.aad);
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
