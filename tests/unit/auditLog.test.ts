import { afterEach, describe, expect, test, vi } from 'vitest';
import { auditLog } from '@/lib/auditLog';

describe('auditLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('logs normal metadata fields as-is', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    auditLog('device.registered', {
      userId: 'user_123',
      deviceId: 'device_abc',
      status: 'pending',
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.event).toBe('device.registered');
    expect(payload.userId).toBe('user_123');
    expect(payload.deviceId).toBe('device_abc');
    expect(payload.status).toBe('pending');
    expect(typeof payload.ts).toBe('string');
  });

  test('redacts sensitive planner and crypto fields', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    auditLog('planner.payloadCorrupt', {
      ciphertext: 'ZmFrZQ==',
      iv: 'ZmFrZQ==',
      wrappedKey: 'ZmFrZQ==',
      lifeVision: 'Travel more',
      nested: {
        plannerState: {
          incomeTotal: 1234,
        },
        requestId: 'req_123',
      },
    });

    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.ciphertext).toBe('[REDACTED]');
    expect(payload.iv).toBe('[REDACTED]');
    expect(payload.wrappedKey).toBe('[REDACTED]');
    expect(payload.lifeVision).toBe('[REDACTED]');

    const nested = payload.nested as Record<string, unknown>;
    expect(nested.requestId).toBe('req_123');
    expect(nested.plannerState).toBe('[REDACTED]');
  });

  test('redacts long free-text strings and circular references', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    auditLog('support.note', {
      note: 'x'.repeat(220),
      meta: circular,
    });

    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.note).toBe('[REDACTED_LONG_STRING]');
    expect((payload.meta as Record<string, unknown>).self).toBe('[REDACTED_CIRCULAR]');
  });
});

