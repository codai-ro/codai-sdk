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

const ID = '5d2e8f1a-3b4c-4d5e-9f60-7a8b9c0d1e2f';
const CID = '7a1b2c3d-0000-4000-8000-000000000031';
const BASE = 'https://ai.codai.ro/v1/studio/templates';
const tpl = {
  id: ID,
  object: 'studio.template',
  title: 'Promo 9:16',
  kind: 'video',
  source_creative_id: CID,
  source_seq: 7,
  vars_schema: {
    headline: {
      type: 'text',
      label: 'Headline',
      default: 'Big sale',
      node_id: 'n_title',
      prop: 'text',
    },
  },
  thumbnail_url: null,
  created_at: '2026-10-14T09:00:00Z',
};

describe('templates', () => {
  it('saveTemplate / list / retrieve / delete hit the right paths', async () => {
    const calls = stub([
      json({ ...tpl, doc: {} }, 201),
      json({ object: 'list', data: [tpl] }),
      json({ ...tpl, doc: {} }),
      json({ id: ID, object: 'studio.template', deleted: true }),
    ]);
    const c = mk();
    const saved = await c.creatives.saveTemplate(CID, {
      title: 'Promo 9:16',
      vars: [{ node_id: 'n_title', prop: 'text', key: 'headline', label: 'Headline' }],
    });
    expect(saved.vars_schema['headline']?.default).toBe('Big sale');
    expect((await c.templates.list({ kind: 'video', limit: 5 })).data).toHaveLength(1);
    expect((await c.templates.retrieve(ID)).title).toBe('Promo 9:16');
    expect((await c.templates.delete(ID)).deleted).toBe(true);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `https://ai.codai.ro/v1/studio/creatives/${CID}/template`],
      ['GET', `${BASE}?kind=video&limit=5`],
      ['GET', `${BASE}/${ID}`],
      ['DELETE', `${BASE}/${ID}`],
    ]);
    expect(calls[0]!.body).toEqual({
      title: 'Promo 9:16',
      vars: [{ node_id: 'n_title', prop: 'text', key: 'headline', label: 'Headline' }],
    });
  });

  it('list forwards source / locale / month and starter ids are plain path segments (RC-29)', async () => {
    const calls = stub([json({ object: 'list', data: [] }), json({ ...tpl, doc: {} })]);
    const c = mk();
    await c.templates.list({ source: 'starter', locale: 'ro', month: 12, kind: 'video' });
    await c.templates.retrieve('starter:christmas-sale:ro');
    expect(calls.map((x) => x.url)).toEqual([
      `${BASE}?kind=video&source=starter&locale=ro&month=12`,
      `${BASE}/starter%3Achristmas-sale%3Aro`,
    ]);
  });

  it('creatives.create forwards template + vars', async () => {
    const calls = stub([
      json(
        {
          id: CID,
          object: 'studio.creative',
          kind: 'video',
          title: 'Promo 9:16',
          head_seq: 1,
          version: { seq: 1, doc_hash: 'a' },
          doc: {},
        },
        201,
      ),
    ]);
    await mk().creatives.create({ kind: 'video', template: ID, vars: { headline: 'Autumn sale' } });
    expect(calls[0]!.body).toEqual({
      kind: 'video',
      template: ID,
      vars: { headline: 'Autumn sale' },
    });
  });

  it('surfaces node_not_found as a CodaiError', async () => {
    stub([
      json(
        {
          error: { message: 'no such node', type: 'invalid_request_error', code: 'node_not_found' },
        },
        400,
      ),
    ]);
    const err = await mk()
      .creatives.saveTemplate(CID, { vars: [{ node_id: 'nope', prop: 'text', key: 'x' }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).code).toBe('node_not_found');
  });
});
