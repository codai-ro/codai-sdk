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

const ID = '3c9a1e2f-5b7d-4f60-8a1b-2c3d4e5f6a7b';
const BASE = 'https://ai.codai.ro/v1/studio/brand-kits';
const kit = {
  id: ID,
  object: 'studio.brand_kit',
  name: 'Acme',
  source_url: 'https://acme.example/',
  tokens: {
    primary: '#1a73e8',
    secondary: '#0b8043',
    accent: '#f9ab00',
    background: '#ffffff',
    text: '#202124',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
  },
  logo_asset_id: null,
  logo_url: null,
  logo_mime_type: null,
  created_at: '2026-10-14T09:00:00Z',
};

describe('brandKits', () => {
  it('extract / list / retrieve / delete hit the right paths', async () => {
    const calls = stub([
      json(kit, 201),
      json({ object: 'list', data: [kit] }),
      json(kit),
      json({ id: ID, object: 'studio.brand_kit', deleted: true }),
    ]);
    const c = mk();
    const k = await c.brandKits.extract({ url: 'https://acme.example/', name: 'Acme' });
    expect(k.tokens.primary).toBe('#1a73e8');
    expect((await c.brandKits.list({ limit: 5 })).data).toHaveLength(1);
    expect((await c.brandKits.retrieve(ID)).name).toBe('Acme');
    expect((await c.brandKits.delete(ID)).deleted).toBe(true);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/extract`],
      ['GET', `${BASE}?limit=5`],
      ['GET', `${BASE}/${ID}`],
      ['DELETE', `${BASE}/${ID}`],
    ]);
    expect(calls[0]!.body).toEqual({ url: 'https://acme.example/', name: 'Acme' });
  });

  it('creatives.create forwards brand_kit_id', async () => {
    const calls = stub([
      json(
        {
          id: '7a1b2c3d-0000-4000-8000-000000000031',
          object: 'studio.creative',
          kind: 'image',
          title: '',
          head_seq: 1,
          version: { seq: 1, doc_hash: 'a' },
          doc: {},
        },
        201,
      ),
    ]);
    await mk().creatives.create({ kind: 'image', brand_kit_id: ID });
    expect(calls[0]!.body).toEqual({ kind: 'image', brand_kit_id: ID });
  });

  it('surfaces url_blocked as a CodaiError', async () => {
    stub([
      json(
        { error: { message: 'blocked', type: 'invalid_request_error', code: 'url_blocked' } },
        400,
      ),
    ]);
    const err = await mk()
      .brandKits.extract({ url: 'https://10.0.0.1/' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).code).toBe('url_blocked');
  });
});

const dtcg = {
  $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
  color: {
    $type: 'color',
    primary: { $value: { colorSpace: 'srgb', components: [0.004, 0.439, 0.502], hex: '#017080' } },
    secondary: { $value: '#23abbc' },
    accent: { $value: '#e6b731' },
    background: { $value: '#f7f8fa' },
    text: { $value: '#0f1115' },
  },
  font: { $type: 'fontFamily', heading: { $value: ['Manrope'] }, body: { $value: ['Inter'] } },
};

describe('brandKits DTCG (E-10)', () => {
  it('create sends flat tokens or a DTCG document as POST /v1/studio/brand-kits', async () => {
    const calls = stub([json(kit, 201), json(kit, 201)]);
    const c = mk();
    await c.brandKits.create({ name: 'Acme', tokens: kit.tokens });
    await c.brandKits.create({ name: 'Acme', dtcg, logo_asset_id: ID });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', BASE],
      ['POST', BASE],
    ]);
    expect(calls[0]!.body).toEqual({ name: 'Acme', tokens: kit.tokens });
    expect(calls[1]!.body).toEqual({ name: 'Acme', dtcg, logo_asset_id: ID });
  });

  it('update PATCHes partial tokens and can clear the logo', async () => {
    const calls = stub([json({ ...kit, logo_asset_id: null })]);
    const k = await mk().brandKits.update(ID, {
      tokens: { primary: '#0b5cff' },
      logo_asset_id: null,
    });
    expect(k.logo_asset_id).toBeNull();
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe(`${BASE}/${ID}`);
    expect(calls[0]!.body).toEqual({ tokens: { primary: '#0b5cff' }, logo_asset_id: null });
  });

  it('exportDtcg GETs the DTCG document and returns the JSON object', async () => {
    const exported = {
      ...dtcg,
      $extensions: { 'ro.codai': { kit_id: ID, name: 'Acme', logo_asset_id: null } },
    };
    const calls = stub([json(exported)]);
    const d = await mk().brandKits.exportDtcg(ID);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe(`${BASE}/${ID}/dtcg`);
    expect(d).toEqual(exported);
  });

  it('extract accepts a logo asset instead of a url', async () => {
    const calls = stub([json({ ...kit, source_url: null, logo_asset_id: ID }, 201)]);
    const k = await mk().brandKits.extract({ logo_asset_id: ID, name: 'Acme' });
    expect(k.logo_asset_id).toBe(ID);
    expect(calls[0]!.url).toBe(`${BASE}/extract`);
    expect(calls[0]!.body).toEqual({ logo_asset_id: ID, name: 'Acme' });
  });

  it('surfaces invalid_tokens as a CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'invalid tokens',
            type: 'invalid_request_error',
            code: 'invalid_tokens',
            details: { issues: ['color.text missing'] },
          },
        },
        400,
      ),
    ]);
    const err = await mk()
      .brandKits.create({ name: 'Bad', dtcg: { color: {} } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).code).toBe('invalid_tokens');
  });

  it('creatives.restyle POSTs the restyle body and returns the ops result', async () => {
    const CID = '7a1b2c3d-0000-4000-8000-000000000031';
    const result = {
      seq: 5,
      doc_hash: 'h',
      changed: ['doc', 'title'],
      warnings: [],
      rebased: false,
    };
    const calls = stub([json(result), json(result)]);
    const c = mk();
    expect(await c.creatives.restyle(CID, { brand_kit_id: ID, snap: true, fonts: false })).toEqual(
      result,
    );
    await c.creatives.restyle(CID, {
      tokens: { primary: '#0b5cff', radius: 8 },
      base_seq: 4,
      force: true,
    });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `https://ai.codai.ro/v1/studio/creatives/${CID}/restyle`],
      ['POST', `https://ai.codai.ro/v1/studio/creatives/${CID}/restyle`],
    ]);
    expect(calls[0]!.body).toEqual({ brand_kit_id: ID, snap: true, fonts: false });
    expect(calls[1]!.body).toEqual({
      tokens: { primary: '#0b5cff', radius: 8 },
      base_seq: 4,
      force: true,
    });
  });
});
