import { describe, expect, test } from 'vitest';
import {
  AES_GCM_IV_BYTE_LENGTH,
  base64ToBytes,
  bytesToBase64,
  decryptPlannerState,
  encryptPlannerState,
  exportDataEncryptionKeyToBase64,
  generateDataEncryptionKey,
  importDataEncryptionKeyFromBase64,
  isCiphertextWithinSizeLimit,
  isExpectedBase64ByteLength,
  isValidBase64,
  validateCipherPayload,
  MAX_CIPHERTEXT_BYTES,
} from '@/lib/crypto';

describe('crypto helpers', () => {
  test('round-trips bytes with base64 conversion helpers', () => {
    const input = new Uint8Array([1, 2, 3, 4, 200, 255]);
    const encoded = bytesToBase64(input);
    const decoded = base64ToBytes(encoded);

    expect(Array.from(decoded)).toEqual(Array.from(input));
    expect(isValidBase64(encoded)).toBe(true);
  });

  test('validates expected iv size and ciphertext payload limits', () => {
    const iv = Buffer.alloc(AES_GCM_IV_BYTE_LENGTH, 1).toString('base64');
    const validCiphertext = Buffer.alloc(512, 7).toString('base64');
    const oversizedCiphertext = Buffer.alloc(1024 * 1024 + 1, 9).toString('base64');

    expect(isExpectedBase64ByteLength(iv, AES_GCM_IV_BYTE_LENGTH)).toBe(true);
    expect(isCiphertextWithinSizeLimit(validCiphertext)).toBe(true);
    expect(isCiphertextWithinSizeLimit(oversizedCiphertext)).toBe(false);
  });

  test('encrypts and decrypts planner state with aad', async () => {
    const key = await generateDataEncryptionKey();
    const input = {
      mode: 'single',
      lifeVision: 'Spend more time in nature.',
      fiAge: 64,
    };
    const aad = {
      userId: 'user_123',
      schemaVersion: 1,
      revision: 3,
    };

    const encrypted = await encryptPlannerState(input, key, aad);
    const decrypted = await decryptPlannerState<typeof input>(encrypted, key, aad);

    expect(decrypted).toEqual(input);
  });

  test('round-trips key export/import and decrypts with imported key', async () => {
    const sourceKey = await generateDataEncryptionKey();
    const serializedKey = await exportDataEncryptionKeyToBase64(sourceKey);
    const importedKey = await importDataEncryptionKeyFromBase64(serializedKey);

    const input = {
      mode: 'single',
      lifeVision: 'Read and volunteer weekly.',
      fiAge: 63,
    };
    const aad = {
      userId: 'user_123',
      schemaVersion: 1,
      revision: 8,
    };

    const encrypted = await encryptPlannerState(input, sourceKey, aad);
    const decrypted = await decryptPlannerState<typeof input>(encrypted, importedKey, aad);

    expect(decrypted).toEqual(input);
  });

  test('rejects decrypt when aad does not match', async () => {
    const key = await generateDataEncryptionKey();
    const input = { mode: 'single', lifeVision: 'Mismatched aad test.' };
    const aad = { userId: 'user_123', schemaVersion: 1, revision: 3 };
    const wrongAad = { userId: 'user_123', schemaVersion: 1, revision: 4 };

    const encrypted = await encryptPlannerState(input, key, aad);

    await expect(
      decryptPlannerState<typeof input>(encrypted, key, wrongAad),
    ).rejects.toBeInstanceOf(Error);
  });

  test('validates cipher payloads before decrypt', () => {
    const validIv = Buffer.alloc(AES_GCM_IV_BYTE_LENGTH, 1).toString('base64');
    const validCiphertext = Buffer.alloc(32, 2).toString('base64');
    const oversizedCiphertext = Buffer.alloc(MAX_CIPHERTEXT_BYTES + 1, 3).toString('base64');

    expect(validateCipherPayload({ iv: validIv, ciphertext: validCiphertext }).ok).toBe(true);
    expect(validateCipherPayload({ iv: 'bad', ciphertext: validCiphertext })).toEqual({
      ok: false,
      reason: 'invalid_iv',
    });
    expect(validateCipherPayload({ iv: Buffer.alloc(8, 1).toString('base64'), ciphertext: validCiphertext })).toEqual({
      ok: false,
      reason: 'invalid_iv_length',
    });
    expect(validateCipherPayload({ iv: validIv, ciphertext: 'bad' })).toEqual({
      ok: false,
      reason: 'invalid_ciphertext',
    });
    expect(validateCipherPayload({ iv: validIv, ciphertext: oversizedCiphertext })).toEqual({
      ok: false,
      reason: 'ciphertext_size',
    });
  });
});
