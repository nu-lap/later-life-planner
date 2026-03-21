import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

import { webcrypto } from 'node:crypto';

// Ensure a consistent WebCrypto implementation for UI tests (jsdom).
// Some dependencies rely on Node's WebCrypto type checks.
try {
  const cryptoObject = globalThis.crypto as unknown as Record<string, unknown>;
  Object.defineProperty(cryptoObject, 'subtle', { value: webcrypto.subtle, configurable: true });
  Object.defineProperty(cryptoObject, 'getRandomValues', {
    value: webcrypto.getRandomValues.bind(webcrypto),
    configurable: true,
  });
  Object.defineProperty(cryptoObject, 'randomUUID', {
    value: webcrypto.randomUUID.bind(webcrypto),
    configurable: true,
  });
} catch {
  // If the runtime prevents patching, crypto-dependent UI tests will fail loudly.
}
