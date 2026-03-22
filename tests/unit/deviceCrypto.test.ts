import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto';
import { hpkeSuite, hpkeSealForRecipient, hpkeOpenAsRecipient, plannerDekWrapAad } from '@/lib/deviceCrypto';

describe('deviceCrypto HPKE', () => {
  it('round-trips plaintext with matching AAD', async () => {
    const suite = hpkeSuite();
    const kp = await suite.kem.generateKeyPair();
    const recipientPublicKeyB64 = bytesToBase64(await suite.kem.serializePublicKey(kp.publicKey));

    const plaintext = new TextEncoder().encode('secret');
    const aad = new TextEncoder().encode('aad');

    const sealed = await hpkeSealForRecipient({ recipientPublicKeyB64, plaintext, aad });
    const opened = await hpkeOpenAsRecipient({
      recipientPrivateKey: kp.privateKey,
      encB64: sealed.encB64,
      ciphertextB64: sealed.ciphertextB64,
      aad,
    });

    expect(new TextDecoder().decode(opened)).toBe('secret');
  });

  it('fails to open when AAD differs', async () => {
    const suite = hpkeSuite();
    const kp = await suite.kem.generateKeyPair();
    const recipientPublicKeyB64 = bytesToBase64(await suite.kem.serializePublicKey(kp.publicKey));

    const plaintext = base64ToBytes(bytesToBase64(new TextEncoder().encode('secret')));
    const sealed = await hpkeSealForRecipient({
      recipientPublicKeyB64,
      plaintext,
      aad: new TextEncoder().encode('aad-1'),
    });

    await expect(hpkeOpenAsRecipient({
      recipientPrivateKey: kp.privateKey,
      encB64: sealed.encB64,
      ciphertextB64: sealed.ciphertextB64,
      aad: new TextEncoder().encode('aad-2'),
    })).rejects.toBeInstanceOf(Error);
  });

  it('fails to open with the wrong recipient private key', async () => {
    const suite = hpkeSuite();
    const kp1 = await suite.kem.generateKeyPair();
    const kp2 = await suite.kem.generateKeyPair();
    const recipientPublicKeyB64 = bytesToBase64(await suite.kem.serializePublicKey(kp1.publicKey));

    const plaintext = new TextEncoder().encode('secret');
    const aad = new TextEncoder().encode('aad');
    const sealed = await hpkeSealForRecipient({ recipientPublicKeyB64, plaintext, aad });

    await expect(hpkeOpenAsRecipient({
      recipientPrivateKey: kp2.privateKey,
      encB64: sealed.encB64,
      ciphertextB64: sealed.ciphertextB64,
      aad,
    })).rejects.toBeInstanceOf(Error);
  });

  it('rejects tampered ciphertext', async () => {
    const suite = hpkeSuite();
    const kp = await suite.kem.generateKeyPair();
    const recipientPublicKeyB64 = bytesToBase64(await suite.kem.serializePublicKey(kp.publicKey));

    const plaintext = new TextEncoder().encode('secret');
    const aad = new TextEncoder().encode('aad');
    const sealed = await hpkeSealForRecipient({ recipientPublicKeyB64, plaintext, aad });

    const ciphertext = Buffer.from(base64ToBytes(sealed.ciphertextB64));
    ciphertext[0] ^= 0xff;

    await expect(hpkeOpenAsRecipient({
      recipientPrivateKey: kp.privateKey,
      encB64: sealed.encB64,
      ciphertextB64: ciphertext.toString('base64'),
      aad,
    })).rejects.toBeInstanceOf(Error);
  });

  it('round-trips a 32-byte DEK payload', async () => {
    const suite = hpkeSuite();
    const kp = await suite.kem.generateKeyPair();
    const recipientPublicKeyB64 = bytesToBase64(await suite.kem.serializePublicKey(kp.publicKey));

    const dek = new Uint8Array(32);
    dek.fill(9);
    const aad = new TextEncoder().encode('dek');
    const sealed = await hpkeSealForRecipient({ recipientPublicKeyB64, plaintext: dek, aad });
    const opened = await hpkeOpenAsRecipient({
      recipientPrivateKey: kp.privateKey,
      encB64: sealed.encB64,
      ciphertextB64: sealed.ciphertextB64,
      aad,
    });

    expect(Buffer.from(opened)).toEqual(Buffer.from(dek));
  });

  it('plannerDekWrapAad is stable for the same inputs', () => {
    const input = {
      userId: 'user_123',
      deviceId: 'device_abc',
      requestId: 'req_123',
      schemaVersion: 1,
      expiresAt: '2026-03-22T00:00:00.000Z',
    };
    const a = plannerDekWrapAad(input);
    const b = plannerDekWrapAad(input);
    expect(Buffer.from(a)).toEqual(Buffer.from(b));

    const c = plannerDekWrapAad({ ...input, requestId: 'req_456' });
    expect(Buffer.from(a)).not.toEqual(Buffer.from(c));
  });
});
