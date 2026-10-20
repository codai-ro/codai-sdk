import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ID = '7d0f2c1e-0000-4000-8000-000000000003';
const asset = (over: Record<string, unknown> = {}) => ({
  asset_id: ID,
  kind: 'image',
  status: 'ready',
  model: 'gemini-3.1-flash-image',
  url: 'https://storage.googleapis.com/b/u/i.png?X-Goog-Signature=abc',
  mime_type: 'image/png',
  bytes: 1024,
  duration_seconds: null,
  width: 1024,
  height: 1024,
  created_at: '2026-10-10T08:00:00.000Z',
  expires_at: '2026-10-10T09:00:00.000Z',
  ...over,
});

type Call = { url: string; method: string; auth: string | null };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const h = (init.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: String(init.method ?? 'GET'), auth: h.Authorization ?? null });
      return replies.shift()!;
    }),
  );
  return calls;
}

describe('assets', () => {
  it('list() sends kind/before/limit and returns the page', async () => {
    const page = { object: 'list', data: [asset()], next_before: '2026-10-10T08:00:00.000Z' };
    const calls = stub([json(page)]);
    const r = await mk().assets.list({
      kind: 'image',
      before: '2026-10-11T00:00:00.000Z',
      limit: 1,
    });
    expect(calls[0]!.method).toBe('GET');
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/v1/assets');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      kind: 'image',
      before: '2026-10-11T00:00:00.000Z',
      limit: '1',
    });
    expect(r).toEqual(page);
  });

  it('list() without a query sends no params', async () => {
    const calls = stub([json({ object: 'list', data: [], next_before: null })]);
    await mk().assets.list();
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/assets');
  });

  it('iterate() follows next_before until null', async () => {
    const calls = stub([
      json({
        object: 'list',
        data: [asset({ asset_id: 'a' })],
        next_before: '2026-10-09T00:00:00.000Z',
      }),
      json({ object: 'list', data: [asset({ asset_id: 'b' })], next_before: null }),
    ]);
    const ids: string[] = [];
    for await (const a of mk().assets.iterate({ kind: 'image', limit: 1 })) ids.push(a.asset_id);
    expect(ids).toEqual(['a', 'b']);
    expect(new URL(calls[1]!.url).searchParams.get('before')).toBe('2026-10-09T00:00:00.000Z');
  });

  it('retrieve() GETs /v1/assets/{id}; contentUrl() returns the signed url', async () => {
    const calls = stub([json(asset()), json(asset())]);
    const a = await mk().assets.retrieve(ID);
    expect(calls[0]!.url).toBe(`https://ai.codai.ro/v1/assets/${ID}`);
    expect(a.width).toBe(1024);
    await expect(mk().assets.contentUrl(ID)).resolves.toBe(asset().url);
  });

  it('contentUrl() throws when the asset is not ready', async () => {
    stub([json(asset({ status: 'pending', url: null, expires_at: null }))]);
    await expect(mk().assets.contentUrl(ID)).rejects.toThrow(/no content yet \(status pending\)/);
  });

  it('content() downloads the signed url without sending the API key to storage', async () => {
    const calls = stub([json(asset()), new Response(new Uint8Array([1, 2, 3]))]);
    const bytes = await mk().assets.content(ID);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls[1]!.url).toBe(asset().url);
    expect(calls[1]!.auth).toBeNull();
  });

  it('contentPath() builds the authenticated redirect URL', () => {
    expect(mk().assets.contentPath('a/b')).toBe('https://ai.codai.ro/v1/assets/a%2Fb/content');
  });

  it('delete() sends DELETE and returns the tombstone', async () => {
    const calls = stub([json({ id: ID, object: 'asset', deleted: true })]);
    const r = await mk().assets.delete(ID);
    expect(calls[0]).toMatchObject({
      url: `https://ai.codai.ro/v1/assets/${ID}`,
      method: 'DELETE',
    });
    expect(r).toEqual({ id: ID, object: 'asset', deleted: true });
  });

  it('a foreign id surfaces the 404 as CodaiError', async () => {
    stub([json({ error: { message: 'Not found', code: 'not_found' } }, 404)]);
    await expect(mk().assets.retrieve('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe("images response_format 'url'", () => {
  it('returns assets and no decoded images; b64 shape still decodes', async () => {
    stub([
      json({ created: 1790000000, data: [asset()] }),
      json({ created: 1790000000, data: [{ b64_json: 'AAEC', mime_type: 'image/png' }] }),
    ]);
    const c = mk();
    const r = await c.images.generate({ prompt: 'plane', response_format: 'url' });
    expect(r.images).toEqual([]);
    expect(r.assets).toEqual([asset()]);
    expect(r.mimeTypes).toEqual(['image/png']);
    const b = await c.images.generate({ prompt: 'plane' });
    expect(b.images.map((x) => [...x])).toEqual([[0, 1, 2]]);
    expect(b.assets).toEqual([]);
  });
});
