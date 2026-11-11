import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string; body: unknown };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: String(init.method ?? 'GET'),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return replies.shift()!;
    }),
  );
  return calls;
}

const ID = '7a1b2c3d-0000-4000-8000-000000000040';
const BASE = `https://ai.codai.ro/v1/studio/creatives/${ID}`;
const edit = { seq: 4, doc_hash: 'h', changed: ['captions'], warnings: [], rebased: false };

describe('creatives captions / adapt / lint fix / controls (E-11a)', () => {
  it('captions POSTs only the given fields and returns the captions details', async () => {
    const result = {
      ...edit,
      node_id: 'captions',
      words: 42,
      cached: false,
      corrected: true,
      cost_micro_usd: 6000,
    };
    const calls = stub([json(result), json({ ...result, cached: true, cost_micro_usd: 0 })]);
    const c = mk();
    expect(
      await c.creatives.captions(ID, {
        preset: 'karaoke-pop',
        script: 'Salut, lume!',
        clip_id: undefined,
      }),
    ).toEqual(result);
    expect((await c.creatives.captions(ID)).cached).toBe(true);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/captions`],
      ['POST', `${BASE}/captions`],
    ]);
    expect(calls[0]!.body).toEqual({ preset: 'karaoke-pop', script: 'Salut, lume!' });
    expect(calls[1]!.body).toEqual({});
  });

  it('captionsSrt / captionsVtt return the file text with node_id and seq in the query', async () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,200\nSalut lume\n';
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:01.200\nSalut lume\n';
    const calls = stub([
      new Response(srt, { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
      new Response(vtt, { headers: { 'content-type': 'text/vtt; charset=utf-8' } }),
    ]);
    const c = mk();
    expect(await c.creatives.captionsSrt(ID, { node_id: 'captions', seq: 3 })).toBe(srt);
    expect(await c.creatives.captionsVtt(ID)).toBe(vtt);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', `${BASE}/captions.srt?node_id=captions&seq=3`],
      ['GET', `${BASE}/captions.vtt`],
    ]);
  });

  it('captionsSrt surfaces 404 No captions. as a CodaiError', async () => {
    stub([
      json(
        { error: { message: 'No captions.', type: 'invalid_request_error', code: 'not_found' } },
        404,
      ),
    ]);
    const err = await mk()
      .creatives.captionsSrt(ID)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(404);
  });

  it('adapt POSTs the platforms and focal mode', async () => {
    const result = {
      ...edit,
      formats: [{ platform: 'feed-portrait', format_id: '4x5', width: 1080, height: 1350 }],
      focal: { bg: { x: 0.4, y: 0.3 } },
    };
    const calls = stub([json(result)]);
    const r = await mk().creatives.adapt(ID, {
      platforms: ['tiktok', 'feed-portrait'],
      focal: 'vision',
    });
    expect(r.formats[0]!.format_id).toBe('4x5');
    expect(calls[0]!.url).toBe(`${BASE}/adapt`);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ platforms: ['tiktok', 'feed-portrait'], focal: 'vision' });
  });

  it('lintFix POSTs codes / agent and returns fixed + remaining', async () => {
    const result = {
      ...edit,
      fixed: [{ code: 'text_too_small', target: 'title' }],
      remaining: [],
      agent: null,
    };
    const calls = stub([
      json(result),
      json({ ...result, agent: { ops: 2, cost_micro_usd: 1200 } }),
    ]);
    const c = mk();
    expect((await c.creatives.lintFix(ID, { codes: ['text_too_small'] })).fixed).toHaveLength(1);
    expect((await c.creatives.lintFix(ID, { agent: true, base_seq: 4 })).agent?.ops).toBe(2);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/lint/fix`],
      ['POST', `${BASE}/lint/fix`],
    ]);
    expect(calls[0]!.body).toEqual({ codes: ['text_too_small'] });
    expect(calls[1]!.body).toEqual({ agent: true, base_seq: 4 });
  });

  it('controls GETs the tweak panel model', async () => {
    const panel = {
      head_seq: 3,
      controls: [
        {
          key: 'accent',
          label: 'Accent',
          control: { kind: 'color' },
          value: '#e6b731',
          type: 'color',
          locked: false,
        },
      ],
    };
    const calls = stub([json(panel)]);
    const r = await mk().creatives.controls(ID);
    expect(r.controls[0]!.control.kind).toBe('color');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe(`${BASE}/controls`);
  });
});
