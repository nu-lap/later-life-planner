import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

import React from 'react';
import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';

// next/image relies on Next.js runtime internals which are not available in vitest.
// Render a plain img element for component tests.
vi.mock('next/image', () => {
  return {
    __esModule: true,
    default: function NextImage(props: { src: string; alt: string } & Record<string, unknown>) {
      const { src, alt, ...rest } = props;
      const {
        fill,
        priority,
        loader,
        quality,
        placeholder,
        blurDataURL,
        unoptimized,
        onLoadingComplete,
        ...imgProps
      } = rest;
      return React.createElement('img', { src, alt, ...imgProps });
    },
  };
});

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
