import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

const RESULT = {
  media_type: 'audio/wav',
  findings: [
    {
      kind: 'riff_info',
      present: true,
      ai_marked: true,
      codai: true,
      details: { comment: 'AI-generated (cloned voice) codai-studio' },
    },
  ],
  codai_generated: true,
  synthid_checked: false,
  signature_verified: false,
};

function stub() {
  const calls: { url: string; method: string; type: string | null; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: String(init.method),
        type: new Headers(init.headers).get('content-type'),
        body: init.body,
      });
      return new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

describe('provenance.check (LS-28 public checker)', () => {
  it('POSTs a Blob as the raw body with its own type, once (no retry)', async () => {
    const calls = stub();
    const client = new Codai({ apiKey: 'sk-test', maxRetries: 2 });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const r = await client.provenance.check(blob);
    expect(r.codai_generated).toBe(true);
    expect(r.synthid_checked).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'https://ai.codai.ro/v1/public/provenance/check',
      method: 'POST',
      type: 'audio/wav',
    });
    expect(calls[0]!.body).toBe(blob);
  });

  it('sends raw bytes as octet-stream unless contentType is given', async () => {
    const calls = stub();
    const client = new Codai({ apiKey: 'sk-test' });
    await client.provenance.check(new Uint8Array([0xff, 0xd8, 0xff]));
    await client.provenance.check(new Uint8Array([0xff, 0xd8, 0xff]), {
      contentType: 'image/jpeg',
    });
    expect(calls.map((c) => c.type)).toEqual(['application/octet-stream', 'image/jpeg']);
  });
});
