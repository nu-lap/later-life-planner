import { describe, expect, it } from 'vitest';
import { GET } from '@/app/.well-known/microsoft-identity-association.json/route';

describe('microsoft identity association well-known route', () => {
  it('returns the expected associatedApplications payload', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = await response.json() as unknown;
    expect(body).toEqual({
      associatedApplications: [
        { applicationId: '1bad3129-83bf-4d79-8cac-1ab7410ea7ec' },
      ],
    });
  });
});

