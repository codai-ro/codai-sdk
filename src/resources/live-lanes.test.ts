import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });

describe('audio.speechStream', () => {
  it('posts to /v1/audio/speech/stream with codai-tts-ro and yields decoded events until done', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        const text =
          'event: start\ndata: {"type":"start","model":"codai-tts-ro","voice":"ro-RO-AlinaNeural","format":"pcm","content_type":"audio/pcm","sample_rate":24000}\n\n' +
          'event: audio\ndata: {"type":"audio","delta":"AAEC"}\n\n' +
          'event: viseme\ndata: {"type":"viseme","id":4,"offsetMs":50}\n\n' +
          'event: word\ndata: {"type":"word","text":"Salut","offsetMs":50,"durationMs":300}\n\n' +
          'event: done\ndata: {"type":"done","audio_ms":400,"audioBytes":3,"visemes":1,"words":1}\n\n';
        return new Response(new Blob([text]).stream(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
    const events = [];
    for await (const ev of mk().audio.speechStream({ input: 'Salut', voice: 'alina' }))
      events.push(ev);
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/audio/speech/stream');
    expect(calls[0]!.body).toEqual({ input: 'Salut', voice: 'alina', model: 'codai-tts-ro' });
    expect(events.map((e) => e.type)).toEqual(['start', 'audio', 'viseme', 'word', 'done']);
    const audio = events[1] as { audio: Uint8Array };
    expect([...audio.audio]).toEqual([0, 1, 2]);
    expect(events[2]).toEqual({ type: 'viseme', id: 4, offsetMs: 50 });
  });
});

describe('systemOne', () => {
  it('batch() sends items + questions + fallback and returns items[]', async () => {
    let sent: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            model: 'codai-s1',
            items: [{ id: 'a', answers: { q: { type: 'noul', noul: 0.9 } } }],
            usage: { input_tokens: 1, output_tokens: 1 },
            latency_ms: 5,
          }),
          { status: 200 },
        );
      }),
    );
    const res = await mk().systemOne.batch({
      items: [{ id: 'a', state: 'salut' }],
      questions: { q: { type: 'noul', instructions: 'Greeting?' } },
      timeout_ms: 800,
      fallback: 'codai-fast',
    });
    expect(sent).toMatchObject({
      items: [{ id: 'a', state: 'salut' }],
      timeout_ms: 800,
      fallback: 'codai-fast',
    });
    expect(res.items[0]!.answers.q).toEqual({ type: 'noul', noul: 0.9 });
  });
});

describe('tokens', () => {
  it("accepts the 'live' scope", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              token: ['codai_eph_v1', 'a', 'b'].join('.'),
              expires_at: 'x',
              scope: 'live',
            }),
            {
              status: 200,
            },
          ),
      ),
    );
    expect((await mk().tokens.create('live', 600)).scope).toBe('live');
  });
});
