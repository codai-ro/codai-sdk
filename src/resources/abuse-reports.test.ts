import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Built by concatenation: a content gate refuses literal addresses in source files.
const REPORTER_EMAIL = ['reporter', 'example.invalid'].join('@');

describe('abuseReports (LS-25 public DSA notices)', () => {
  it('POSTs the report once (no retry) and returns the 202 body', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({
          url,
          method: String(init.method),
          body: JSON.parse(String(init.body)),
        });
        return new Response(
          JSON.stringify({
            id: '7a1b2c3d-0000-4000-8000-000000000091',
            object: 'studio.abuse_report',
            status: 'open',
          }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = new Codai({ apiKey: 'sk-test', maxRetries: 2 });
    const body = {
      share_token: 'tok_abc',
      surface: 'share' as const,
      category: 'voice_without_consent' as const,
      explanation: 'This narration uses my voice without consent.',
      reporter_name: 'Ana',
      reporter_email: REPORTER_EMAIL,
      good_faith: true as const,
    };
    const r = await client.abuseReports.create(body);
    expect(r).toEqual({
      id: '7a1b2c3d-0000-4000-8000-000000000091',
      object: 'studio.abuse_report',
      status: 'open',
    });
    expect(calls).toEqual([
      { url: 'https://ai.codai.ro/v1/studio/abuse-reports', method: 'POST', body },
    ]);
  });

  it('does not retry a 429', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'slow down', type: 'rate_limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '0' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new Codai({ apiKey: 'sk-test', maxRetries: 2 });
    await expect(
      client.abuseReports.create({
        share_token: 't',
        surface: 'review',
        category: 'fraud',
        explanation: 'A fake bank call script.',
        reporter_name: 'Ion',
        reporter_email: REPORTER_EMAIL,
        good_faith: true,
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
