import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto';
import { hpkeSuite, hpkeSealForRecipient, hpkeOpenAsRecipient } from '@/lib/deviceCrypto';

describe('deviceCrypto HPKE', () => {
  it('round-trips plaintext with matching AAD', async () => {
    const suite = hpkeSuite();
    const kp = await suite.kem.generateKeyPair();
    const recipientPublicKeyB64 = bytesToBase64(await suite.kem.serializePublicKey(kp.publicKey));
    const recipientPrivateKeyB64 = bytesToBase64(await suite.kem.serializePrivateKey(kp.privateKey));

    const plaintext = new TextEncoder().encode('secret');
    const aad = new TextEncoder().encode('aad');

    const sealed = await hpkeSealForRecipient({ recipientPublicKeyB64, plaintext, aad });
    const opened = await hpkeOpenAsRecipient({
      recipientPrivateKeyB64,
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
    const recipientPrivateKeyB64 = bytesToBase64(await suite.kem.serializePrivateKey(kp.privateKey));

    const plaintext = base64ToBytes(bytesToBase64(new TextEncoder().encode('secret')));
    const sealed = await hpkeSealForRecipient({
      recipientPublicKeyB64,
      plaintext,
      aad: new TextEncoder().encode('aad-1'),
    });

    await expect(hpkeOpenAsRecipient({
      recipientPrivateKeyB64,
      encB64: sealed.encB64,
      ciphertextB64: sealed.ciphertextB64,
      aad: new TextEncoder().encode('aad-2'),
    })).rejects.toBeInstanceOf(Error);
  });
});

