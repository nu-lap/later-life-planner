import { describe, expect, test } from 'vitest';
import {
  AES_GCM_IV_BYTE_LENGTH,
  base64ToBytes,
  bytesToBase64,
  decryptPlannerState,
  encryptPlannerState,
  generateDataEncryptionKey,
  isCiphertextWithinSizeLimit,
  isExpectedBase64ByteLength,
  isValidBase64,
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
});
