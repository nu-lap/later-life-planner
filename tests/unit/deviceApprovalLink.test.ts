import { describe, expect, test } from 'vitest';
import {
  buildDeviceApprovalLink,
  extractApprovalCodeJson,
} from '@/lib/deviceApprovalLink';

describe('deviceApprovalLink', () => {
  test('buildDeviceApprovalLink uses a fragment payload and can be extracted', () => {
    const origin = 'https://example.com';
    const json = JSON.stringify({
      v: 1,
      deviceId: 'device-1234',
      requestId: 'request-5678',
      expiresAt: '2026-03-22T07:50:32.592Z',
      publicKeyFingerprint: 'fingerprint',
    });

    const link = buildDeviceApprovalLink(origin, json);
    expect(link).toContain('/account/devices/approve#code=');

    const extracted = extractApprovalCodeJson(link);
    expect(extracted).toEqual(json);
  });

  test('extractApprovalCodeJson accepts raw JSON', () => {
    const json = '{"v":1,"deviceId":"a","requestId":"b","expiresAt":"c","publicKeyFingerprint":"d"}';
    expect(extractApprovalCodeJson(json)).toEqual(json);
  });

  test('extractApprovalCodeJson accepts a raw fragment', () => {
    const origin = 'https://example.com';
    const json = '{"v":1,"deviceId":"a","requestId":"b","expiresAt":"c","publicKeyFingerprint":"d"}';
    const link = buildDeviceApprovalLink(origin, json);
    const fragment = link.split('#')[1];
    expect(extractApprovalCodeJson(`#${fragment}`)).toEqual(json);
    expect(extractApprovalCodeJson(fragment)).toEqual(json);
  });
});

