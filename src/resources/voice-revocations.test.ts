import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('voiceRevocations (E-12b public takedown tickets)', () => {
  it('POSTs the ticket once (no retry) and returns the 202 body', async () => {
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
            id: '7a1b2c3d-0000-4000-8000-000000000090',
            object: 'studio.voice_revocation',
            status: 'open',
          }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = new Codai({ apiKey: 'sk-test', maxRetries: 2 });
    const r = await client.voiceRevocations.create({
      email: 'owner@example.com',
      voice_owner_name: 'Ana',
      details: 'Found my voice in a video.',
    });
    expect(r.status).toBe('open');
    expect(calls).toEqual([
      {
        url: 'https://ai.codai.ro/v1/studio/voice-revocations',
        method: 'POST',
        body: {
          email: 'owner@example.com',
          voice_owner_name: 'Ana',
          details: 'Found my voice in a video.',
        },
      },
    ]);
  });
});
