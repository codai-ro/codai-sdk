import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

const VOICE = '7a1b2c3d-0000-4000-8000-0000000000a1';
const SESSION = '7a1b2c3d-0000-4000-8000-0000000000b2';

describe('voices (D37 voice passport singing consent, beta)', () => {
  it('addSingingConsent POSTs the session once (no retry); revokeSingingConsent DELETEs (204)', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({
          url,
          method: String(init.method),
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        if (init.method === 'DELETE') return new Response(null, { status: 204 });
        if (first) {
          first = false;
          return new Response(
            JSON.stringify({
              id: VOICE,
              object: 'studio.voice',
              label: 'Me',
              locale: 'ro-RO',
              kind: 'ai_clone',
              display_name: 'Custom (AI clone)',
              created_at: '2026-10-22T10:00:00.000Z',
              singing: {
                status: 'active',
                consented_at: '2026-10-22T10:05:00.000Z',
                revoked_at: null,
                quality: 'beta',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 500 });
      }),
    );
    const client = new Codai({ apiKey: 'sk-test', maxRetries: 2 });
    const v = await client.voices.addSingingConsent(VOICE, { session_id: SESSION });
    expect(v.singing).toMatchObject({ status: 'active', quality: 'beta' });
    await client.voices.revokeSingingConsent(VOICE);
    expect(calls).toEqual([
      {
        url: `https://ai.codai.ro/v1/studio/voices/${VOICE}/singing-consent`,
        method: 'POST',
        body: { session_id: SESSION },
      },
      {
        url: `https://ai.codai.ro/v1/studio/voices/${VOICE}/singing-consent`,
        method: 'DELETE',
        body: null,
      },
    ]);
  });
});
