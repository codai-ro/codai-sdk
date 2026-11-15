import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

const BASE = 'https://ai.codai.ro/v1/studio';
const CREATIVE = '3f2b8c1e-0000-4000-8000-000000000001';
const RENDER = '6d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6';

function stub(replies: Array<{ status?: number; body: unknown }>) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] =
    [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        method: init.method ?? 'GET',
        url: String(url),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      const r = replies[Math.min(i++, replies.length - 1)]!;
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const lyrics = {
  object: 'studio.lyrics',
  title: 'Vară',
  language: 'ro',
  rhyme_scheme: 'AABB',
  syllables_per_line: 8,
  sections: [
    {
      kind: 'verse',
      lines: [{ text: 'Soarele răsare iar', syllables: 7, rhyme: 'ar', letter: 'A', off: false }],
    },
  ],
  text: '[verse]\nSoarele răsare iar',
  report: { lines: 1, off_lines: 0, off_ratio: 0, pairs: 0, rhymed: 0, repair_ratio: 0 },
  repaired: false,
  cost_micro_usd: '1200',
};

describe('lyrics (MU-06)', () => {
  it('write posts the brief with the Idempotency-Key and returns the checked lyrics', async () => {
    const calls = stub([{ body: lyrics }]);
    const c = new Codai({ apiKey: 'sk-test' });
    const r = await c.lyrics.write(
      { brief: 'o vară la mare', language: 'ro', rhyme_scheme: 'AABB', syllables_per_line: 8 },
      { idempotencyKey: 'ly-1' },
    );
    expect(r.sections[0]!.lines[0]!.letter).toBe('A');
    expect(r.report.off_lines).toBe(0);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/lyrics`,
      body: {
        brief: 'o vară la mare',
        language: 'ro',
        rhyme_scheme: 'AABB',
        syllables_per_line: 8,
      },
    });
    expect(calls[0]!.headers['idempotency-key']).toBe('ly-1');
  });

  it('align posts to /lyrics/align and returns timed lines + LRC', async () => {
    const calls = stub([
      {
        body: {
          object: 'studio.lyrics_alignment',
          creative_id: CREATIVE,
          clip_id: 'vox1',
          applied: true,
          seq: 5,
          doc_hash: 'h',
          lines: [{ startMs: 1200, endMs: 3400, text: 'Soarele răsare iar', sectionId: 'v1' }],
          lrc: '[00:01.20]Soarele răsare iar',
          match_ratio: 0.92,
          cached: true,
          cost_micro_usd: '0',
        },
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const r = await c.lyrics.align({
      creative_id: CREATIVE,
      clip_id: 'vox1',
      lyrics_text: '[verse]\nSoarele răsare iar',
    });
    expect(r.lrc).toContain('[00:01.20]');
    expect(r.cached).toBe(true);
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${BASE}/lyrics/align` });
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
  });

  it('402 insufficient_funds surfaces as an error', async () => {
    stub([
      {
        status: 402,
        body: {
          error: {
            message: 'Not enough credit.',
            type: 'insufficient_funds',
            code: 'insufficient_funds',
          },
        },
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test', maxRetries: 0 });
    await expect(c.lyrics.write({ brief: 'abc', language: 'en' })).rejects.toThrow(/credit/i);
  });
});

describe('creatives.renderAudio (MU-05)', () => {
  it('posts the audio body to /render and returns the queued mixdown', async () => {
    const calls = stub([
      {
        status: 202,
        body: {
          render_id: RENDER,
          id: RENDER,
          object: 'studio.render',
          status: 'queued',
          target: 'audio',
          model: 'codai-render',
          creative_id: CREATIVE,
          seq: 3,
          formats: ['wav', 'flac'],
          stems: true,
          lrc: true,
          target_lufs: -16,
          true_peak_db: -1,
          duration_seconds: 62.5,
          outputs: [
            { kind: 'mix', format: 'wav', track_id: null, mime_type: 'audio/wav' },
            { kind: 'mix', format: 'flac', track_id: null, mime_type: 'audio/flac' },
            { kind: 'stem', format: 'wav', track_id: 'vox', mime_type: 'audio/wav' },
            { kind: 'lrc', format: 'lrc', track_id: null, mime_type: 'application/x-lrc' },
          ],
          quote_micro_usd: '94500',
          price_micro_usd_per_second: '1000',
          minimum_micro_usd: '10000',
          stems_surcharge_pct: 50,
          cached: false,
        },
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const r = await c.creatives.renderAudio(
      CREATIVE,
      { formats: ['wav', 'flac'], stems: true, loudness: 'podcast' },
      { idempotencyKey: 'mix-1' },
    );
    expect(r.target).toBe('audio');
    expect(r.outputs.map((o) => o.kind)).toEqual(['mix', 'mix', 'stem', 'lrc']);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/creatives/${CREATIVE}/render`,
      body: { formats: ['wav', 'flac'], stems: true, loudness: 'podcast' },
    });
    expect(calls[0]!.headers['idempotency-key']).toBe('mix-1');
  });
});
