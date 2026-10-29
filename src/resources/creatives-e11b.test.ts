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

const ID = '7a1b2c3d-0000-4000-8000-000000000050';
const BASE = `https://ai.codai.ro/v1/studio/creatives/${ID}`;
const edit = { seq: 6, doc_hash: 'h', changed: ['doc'], warnings: [], rebased: false };

describe('creatives localisation (E-11b)', () => {
  it('locales GETs the status and passes locale / units / paging in the query', async () => {
    const status = {
      head_seq: 5,
      source: 'en',
      glossary: ['codai'],
      total: 2,
      locales: [{ locale: 'ro', tone: 'informal', translated: 1, missing: 1, stale: 0, voice: 0 }],
      units: [
        {
          key: 'title:spans.0',
          node_id: 'title',
          kind: 'text',
          text: 'Summer sale',
          max_chars: 24,
          translation: 'Reduceri de vară',
          by: 'agent',
          stale: false,
          locked: false,
        },
      ],
      units_total: 2,
    };
    const calls = stub([json(status), json({ ...status, units: undefined })]);
    const c = mk();
    const r = await c.creatives.locales(ID, { locale: 'ro', units: 1, offset: 0, limit: 50 });
    expect(r.units?.[0]?.translation).toBe('Reduceri de vară');
    await c.creatives.locales(ID);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', `${BASE}/locales?locale=ro&units=1&offset=0&limit=50`],
      ['GET', `${BASE}/locales`],
    ]);
  });

  it('localize POSTs only the given fields and returns the per-locale summary', async () => {
    const result = {
      ...edit,
      locales: [{ locale: 'ro', translated: 12, remaining: 0, voice_clips: 0 }],
      cost_micro_usd: 1800,
    };
    const calls = stub([json(result)]);
    const r = await mk().creatives.localize(ID, {
      locales: ['ro', 'de'],
      tone: 'informal',
      glossary: ['codai'],
      voice: undefined,
    });
    expect(r.locales[0]!.translated).toBe(12);
    expect(r.cost_micro_usd).toBe(1800);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/localize`);
    expect(calls[0]!.body).toEqual({
      locales: ['ro', 'de'],
      tone: 'informal',
      glossary: ['codai'],
    });
  });

  it('localize surfaces 503 localize_unavailable as a CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'Translation unavailable.',
            type: 'api_error',
            code: 'localize_unavailable',
          },
        },
        503,
      ),
    ]);
    const err = await mk()
      .creatives.localize(ID, { locales: ['ro'] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(503);
  });

  it('forkLocale POSTs to the encoded locale path and returns the new creative', async () => {
    const fork = {
      id: '7a1b2c3d-0000-4000-8000-000000000051',
      object: 'studio.creative',
      kind: 'video',
      title: 'Promo (pt-BR)',
      head_seq: 1,
      version: { seq: 1, doc_hash: 'x' },
      doc: {},
      locale: 'pt-BR',
      fork_of: { creative_id: ID, seq: 6 },
    };
    const calls = stub([json(fork, 201), json(fork, 201)]);
    const c = mk();
    expect(
      (await c.creatives.forkLocale(ID, 'pt-BR', { title: 'Promo (pt-BR)' })).fork_of.seq,
    ).toBe(6);
    await c.creatives.forkLocale(ID, 'pt-BR');
    expect(calls.map((x) => [x.method, x.url, x.body])).toEqual([
      ['POST', `${BASE}/locales/pt-BR/fork`, { title: 'Promo (pt-BR)' }],
      ['POST', `${BASE}/locales/pt-BR/fork`, {}],
    ]);
  });

  it('locale reaches compiled / captions / lint / render / frame', async () => {
    const calls = stub([
      json({
        head_seq: 6,
        format: '16x9',
        width: 1920,
        height: 1080,
        duration_ms: 1000,
        html: '<html>',
      }),
      new Response('1\n00:00:00,000 --> 00:00:01,000\nSalut\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
      new Response('WEBVTT\n', { headers: { 'content-type': 'text/vtt; charset=utf-8' } }),
      json({ head_seq: 6, issues: [], fixable: 0 }),
      json({ head_seq: 6, issues: [], fixable: 0 }),
      json({ render_id: 'r1', cached: false }, 202),
      json({ object: 'studio.creative.frames', status: 'succeeded', frames: [] }),
    ]);
    const c = mk();
    await c.creatives.compiled(ID, { format: '16x9', locale: 'ro' });
    await c.creatives.captionsSrt(ID, { locale: 'ro' });
    await c.creatives.captionsVtt(ID, { node_id: 'captions', locale: 'de' });
    await c.creatives.lint(ID, { locale: 'ro' });
    await c.creatives.lint(ID);
    await c.creatives.render(ID, { quality: 'draft', locale: 'ro' });
    await c.creatives.frame(ID, { t_ms: [0], locale: 'ro' });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', `${BASE}/compiled?format=16x9&locale=ro`],
      ['GET', `${BASE}/captions.srt?locale=ro`],
      ['GET', `${BASE}/captions.vtt?node_id=captions&locale=de`],
      ['POST', `${BASE}/lint`],
      ['POST', `${BASE}/lint`],
      ['POST', `${BASE}/render`],
      ['POST', `${BASE}/frame`],
    ]);
    expect(calls[3]!.body).toEqual({ locale: 'ro' });
    expect(calls[4]!.body).toBeUndefined();
    expect(calls[5]!.body).toEqual({ quality: 'draft', locale: 'ro' });
    expect(calls[6]!.body).toEqual({ t_ms: [0], locale: 'ro' });
  });
});
