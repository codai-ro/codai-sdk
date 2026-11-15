import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';
import { isPagedBuild } from './creatives';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const CID = '7a1b2c3d-0000-4000-8000-000000000051';
const EID = '3f0c9a7e-1b2d-4c5e-8f90-a1b2c3d4e5f7';
const ASSET = '3f2b8c1e-0000-4000-8000-000000000001';
const BASE = `https://ai.codai.ro/v1/studio/creatives/${CID}`;

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
function stub(replies: Array<{ status?: number; body: unknown }>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: String(url),
        method: String(init.method ?? 'GET'),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      const r = replies.shift()!;
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

const exp = (status: string) => ({
  id: EID,
  object: 'studio.export',
  kind: 'carousel_png',
  status,
  creative_id: CID,
  seq: 3,
  format: '4x5',
  fps: 0,
  filename: 'spring-sale-4x5.zip',
  url: status === 'succeeded' ? 'https://storage.example/x.zip' : null,
  expires_at: null,
  bytes: null,
  rendered_seconds: null,
  cost_micro_usd: null,
  pages: null,
  boxes: null,
  lint: [],
  warnings: [],
  error: null,
  created_at: '2026-10-20T10:00:00Z',
});
const paged = (status = 'queued') => ({
  object: 'studio.creative_build',
  creative_id: CID,
  seq: 3,
  kind: 'carousel',
  format: 'png',
  format_id: '4x5',
  pages: 6,
  quote_micro_usd: '12000',
  warnings: [],
  lint: [],
  print: null,
  document: null,
  export: exp(status),
});

describe('creatives CX-07/08/09 + cast', () => {
  it('build of a carousel resolves the 202 export job and isPagedBuild narrows it', async () => {
    const calls = stub([{ status: 202, body: paged() }]);
    const r = await mk().creatives.build(CID, {
      format: 'png',
      format_id: '4x5',
      crop_marks: undefined,
    });
    expect(isPagedBuild(r)).toBe(true);
    if (!isPagedBuild(r)) throw new Error('unreachable');
    expect(r.export.id).toBe(EID);
    expect(r.pages).toBe(6);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/build`,
      body: { format: 'png', format_id: '4x5' },
    });
  });

  it('isPagedBuild is false for a deck build (document, no export)', () => {
    expect(
      isPagedBuild({
        object: 'studio.creative_build',
        creative_id: CID,
        seq: 1,
        warnings: [],
        document: {} as never,
      }),
    ).toBe(false);
  });

  it('buildAndWait polls GET /v1/studio/exports/{id} until it succeeds', async () => {
    const calls = stub([
      { status: 202, body: paged() },
      { body: exp('running') },
      { body: exp('succeeded') },
    ]);
    const e = await mk().creatives.buildAndWait(CID, { format: 'pdf' }, { intervalMs: 1 });
    expect(e.object).toBe('studio.export');
    expect((e as { status: string }).status).toBe('succeeded');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/build`,
      `GET https://ai.codai.ro/v1/studio/exports/${EID}`,
      `GET https://ai.codai.ro/v1/studio/exports/${EID}`,
    ]);
  });

  it('buildAndWait returns a deck build as is (no polling)', async () => {
    const deck = {
      object: 'studio.creative_build',
      creative_id: CID,
      seq: 1,
      warnings: [],
      document: { id: 'd' },
    };
    const calls = stub([{ body: deck }]);
    const r = await mk().creatives.buildAndWait(CID);
    expect(r).toEqual(deck);
    expect(calls).toHaveLength(1);
  });

  it('postCopy POSTs /post-copy with the Idempotency-Key and drops undefined fields', async () => {
    const reply = {
      object: 'studio.post_copy',
      creative_id: CID,
      seq: 3,
      kind: 'carousel',
      language: 'ro',
      platforms: [
        {
          platform: 'linkedin',
          caption: 'Primăvara vine cu reduceri.',
          hashtags: ['#reduceri'],
          text: 'Primăvara vine cu reduceri.\n\n#reduceri',
          chars: 38,
          limits: { caption: 3000, hashtags: 10, alt: 300 },
        },
      ],
      alt: [{ scene_id: 's1', text: 'Lalele galbene.' }],
      fixes: [],
      cost_micro_usd: '2140',
    };
    const calls = stub([{ body: reply }]);
    const r = await mk().creatives.postCopy(
      CID,
      { platforms: ['linkedin'], language: 'ro', tone: undefined },
      { idempotencyKey: 'pc-1' },
    );
    expect(r.platforms[0]!.hashtags).toEqual(['#reduceri']);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/post-copy`,
      body: { platforms: ['linkedin'], language: 'ro' },
    });
    expect(calls[0]!.headers['idempotency-key']).toBe('pc-1');
  });

  it('postCopy without options sends an empty body and no Idempotency-Key', async () => {
    const calls = stub([{ body: { object: 'studio.post_copy' } }]);
    await mk().creatives.postCopy(CID);
    expect(calls[0]!.body).toEqual({});
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
  });

  it('transcriptCut POSTs node_id, remove and base_seq', async () => {
    const reply = {
      seq: 5,
      doc_hash: 'h',
      changed: ['clip'],
      warnings: [],
      rebased: false,
      node_id: 'clip',
      pieces: ['clip', 'clip-2'],
      removed: [{ in_ms: 1200, out_ms: 1800 }],
      removed_ms: 600,
      words: 2,
    };
    const calls = stub([{ body: reply }]);
    const r = await mk().creatives.transcriptCut(CID, {
      node_id: 'clip',
      remove: [{ from_word: 3, to_word: 4 }],
      base_seq: 4,
    });
    expect(r.pieces).toEqual(['clip', 'clip-2']);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/transcript-cut`,
      body: { node_id: 'clip', remove: [{ from_word: 3, to_word: 4 }], base_seq: 4 },
    });
  });

  it('regenerateNode encodes the node id and sends the Idempotency-Key', async () => {
    const reply = {
      seq: 6,
      doc_hash: 'h',
      changed: ['hero/1'],
      warnings: [],
      rebased: false,
      node_id: 'hero/1',
      asset_id: ASSET,
      cast_id: 'ana',
      reference_asset_ids: [ASSET],
      cost_micro_usd: '40000',
    };
    const calls = stub([{ body: reply }]);
    const r = await mk().creatives.regenerateNode(
      CID,
      'hero/1',
      { prompt: 'Ana pe plajă', aspect_ratio: '4:5' },
      { idempotencyKey: 'rg-1' },
    );
    expect(r.cast_id).toBe('ana');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/nodes/hero%2F1/regenerate`,
      body: { prompt: 'Ana pe plajă', aspect_ratio: '4:5' },
    });
    expect(calls[0]!.headers['idempotency-key']).toBe('rg-1');
  });

  it('videos.create forwards reference_asset_ids', async () => {
    const calls = stub([{ status: 202, body: { id: 'v1', object: 'video', status: 'running' } }]);
    await mk().videos.create({ prompt: 'A red bike', reference_asset_ids: [ASSET] });
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/videos');
    expect(calls[0]!.body).toMatchObject({ prompt: 'A red bike', reference_asset_ids: [ASSET] });
  });

  it('mediaOps run / quote send mask_png_b64 only when given', async () => {
    const calls = stub([
      { body: { object: 'media_op.quote' } },
      { body: { object: 'media_op.result', status: 'ready', outputs: [] } },
      { body: { object: 'media_op.quote' } },
    ]);
    const c = mk();
    await c.mediaOps.quote('image.inpaint', {
      assetIds: [ASSET],
      maskPngB64: 'iVBOR',
      params: { prompt: 'sky' },
    });
    await c.mediaOps.run('image.erase', { assetIds: [ASSET], maskPngB64: 'iVBOR' });
    await c.mediaOps.quote('image.upscale', { assetIds: [ASSET] });
    expect(calls[0]!.body).toEqual({
      asset_ids: [ASSET],
      params: { prompt: 'sky' },
      mask_png_b64: 'iVBOR',
    });
    expect(calls[1]!.body).toEqual({ asset_ids: [ASSET], params: {}, mask_png_b64: 'iVBOR' });
    expect(calls[2]!.body).toEqual({ asset_ids: [ASSET], params: {} });
  });
});
