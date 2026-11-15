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

const UPLOAD_URL =
  'https://storage.googleapis.com/upload/storage/v1/b/x/o?uploadType=resumable&upload_id=SECRET';
const session = (over: Record<string, unknown> = {}) => ({
  id: ID,
  object: 'studio.upload',
  upload_url: UPLOAD_URL,
  chunk_granularity: 262144,
  max_bytes: 4294967296,
  expires_at: '2026-11-11T00:00:00.000Z',
  ...over,
});
const completed = {
  asset: asset({ kind: 'upload' }),
  ingest: { status: 'queued', quote_micro_usd: 1200 },
};
const r308 = (last?: number) =>
  new Response(null, {
    status: 308,
    headers: last === undefined ? {} : { range: `bytes=0-${last}` },
  });

type FullCall = { url: string; method: string; headers: Record<string, string>; body: unknown };
function stubFull(replies: Array<Response | Error>): FullCall[] {
  const calls: FullCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: String(init.method ?? 'GET'),
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body,
      });
      const r = replies.shift()!;
      if (r instanceof Error) throw r;
      return r;
    }),
  );
  return calls;
}
const G = 262144;

describe('assets uploads, ingest and search', () => {
  it('createUpload() POSTs the body with Idempotency-Key and returns the session', async () => {
    const calls = stubFull([json(session(), 201)]);
    const r = await mk().assets.createUpload(
      { filename: 'a.mp4', mime: 'video/mp4', bytes: 10, ingest: false },
      { idempotencyKey: 'up-1' },
    );
    expect(calls[0]).toMatchObject({
      url: 'https://ai.codai.ro/v1/assets/uploads',
      method: 'POST',
    });
    expect(calls[0]!.headers['Idempotency-Key']).toBe('up-1');
    expect(JSON.parse(String(calls[0]!.body))).toEqual({
      filename: 'a.mp4',
      mime: 'video/mp4',
      bytes: 10,
      ingest: false,
    });
    expect(r.upload_url).toBe(UPLOAD_URL);
  });

  it('completeUpload(), quota(), ingest(), runIngest(), search() hit the documented routes', async () => {
    const calls = stubFull([
      json(completed),
      json({ used_bytes: 1, limit_bytes: 53687091200, max_file_bytes: 4294967296 }),
      json({ status: 'none' }),
      json({ status: 'queued', quote_micro_usd: 50 }, 202),
      json({ object: 'list', data: [{ asset_id: ID, t_ms: 1500, kind: 'frame', score: 0.8 }] }),
    ]);
    const c = mk();
    expect(await c.assets.completeUpload(ID)).toEqual(completed);
    expect((await c.assets.quota()).limit_bytes).toBe(53687091200);
    expect((await c.assets.ingest(ID)).status).toBe('none');
    expect(
      (await c.assets.runIngest(ID, { language: 'ro' }, { idempotencyKey: 'ing-1' })).status,
    ).toBe('queued');
    const s = await c.assets.search('red car', { limit: 5 });
    expect(s.data[0]!.t_ms).toBe(1500);
    expect(calls.map((x) => `${x.method} ${new URL(x.url).pathname}`)).toEqual([
      `POST /v1/assets/uploads/${ID}/complete`,
      'GET /v1/assets/quota',
      `GET /v1/assets/${ID}/ingest`,
      `POST /v1/assets/${ID}/ingest`,
      'GET /v1/assets/search',
    ]);
    expect(JSON.parse(String(calls[3]!.body))).toEqual({ language: 'ro' });
    expect(calls[3]!.headers['Idempotency-Key']).toBe('ing-1');
    expect(Object.fromEntries(new URL(calls[4]!.url).searchParams)).toEqual({
      q: 'red car',
      limit: '5',
    });
  });

  it('runIngest() without a body sends {}', async () => {
    const calls = stubFull([json({ status: 'running' }, 202)]);
    await mk().assets.runIngest(ID);
    expect(JSON.parse(String(calls[0]!.body))).toEqual({});
  });

  it('upload() PUTs chunks with Content-Range (308 flow), never sends the API key to storage, then completes', async () => {
    const total = 2 * G + 100;
    const src = new Uint8Array(total).map((_, i) => i % 251);
    const calls = stubFull([
      json(session(), 201),
      r308(G - 1),
      r308(2 * G - 1),
      new Response(null, { status: 200 }),
      json(completed),
    ]);
    const progress: number[] = [];
    const r = await mk().assets.upload(src, {
      filename: 'clip.mp4',
      mime: 'video/mp4',
      chunkSize: G,
      onProgress: (sent) => progress.push(sent),
    });
    expect(r).toEqual(completed);
    const puts = calls.filter((x) => x.method === 'PUT');
    expect(puts.map((p) => p.headers['Content-Range'])).toEqual([
      `bytes 0-${G - 1}/${total}`,
      `bytes ${G}-${2 * G - 1}/${total}`,
      `bytes ${2 * G}-${total - 1}/${total}`,
    ]);
    for (const p of puts) {
      expect(p.url).toBe(UPLOAD_URL);
      expect(p.headers.Authorization).toBeUndefined();
    }
    expect((puts[2]!.body as Uint8Array).length).toBe(100);
    expect(JSON.parse(String(calls[0]!.body))).toMatchObject({
      bytes: total,
      filename: 'clip.mp4',
    });
    expect(calls[4]).toMatchObject({
      url: `https://ai.codai.ro/v1/assets/uploads/${ID}/complete`,
      method: 'POST',
    });
    expect(progress).toEqual([G, 2 * G, total]);
  });

  it('upload() resumes an interrupted chunk from the offset the status query reports', async () => {
    const total = 3 * G;
    const calls = stubFull([
      json(session(), 201),
      r308(G - 1), // chunk 1 ok
      new TypeError('network reset'), // chunk 2 dies mid-flight
      r308(G + 1000 - 1), // status: storage kept 1000 bytes of chunk 2
      r308(2 * G + 999), // resend from G+1000
      new Response(null, { status: 201 }), // last chunk done
      json(completed),
    ]);
    await mk().assets.upload(new Uint8Array(total), {
      filename: 'a.wav',
      mime: 'audio/wav',
      chunkSize: G,
      retryDelayMs: 0,
    });
    const puts = calls.filter((x) => x.method === 'PUT').map((p) => p.headers['Content-Range']);
    expect(puts).toEqual([
      `bytes 0-${G - 1}/${total}`,
      `bytes ${G}-${2 * G - 1}/${total}`,
      `bytes */${total}`,
      `bytes ${G + 1000}-${2 * G + 999}/${total}`,
      `bytes ${2 * G + 1000}-${total - 1}/${total}`,
    ]);
    expect(calls.at(-1)!.url).toBe(`https://ai.codai.ro/v1/assets/uploads/${ID}/complete`);
  });

  it('upload() streams a ReadableStream one chunk at a time and finishes when the status query says done', async () => {
    const total = 2 * G;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 8; i++) c.enqueue(new Uint8Array(total / 8).fill(i));
        c.close();
      },
    });
    const calls = stubFull([
      json(session(), 201),
      r308(G - 1),
      new Response(null, { status: 503 }), // last chunk: storage 503
      new Response(null, { status: 200 }), // status: it actually finished
      json(completed),
    ]);
    await mk().assets.upload(stream, {
      filename: 'a.webm',
      mime: 'video/webm',
      bytes: total,
      chunkSize: G,
      retryDelayMs: 0,
    });
    const puts = calls.filter((x) => x.method === 'PUT');
    expect((puts[0]!.body as Uint8Array)[0]).toBe(0);
    expect((puts[1]!.body as Uint8Array)[0]).toBe(4);
    expect(puts[2]!.headers['Content-Range']).toBe(`bytes */${total}`);
    expect(calls.at(-1)!.method).toBe('POST');
  });

  it('upload() gives up after maxChunkRetries and rejects a bad chunk size', async () => {
    stubFull([
      json(session(), 201),
      new Response(null, { status: 500 }),
      new Response(null, { status: 500 }), // status query fails too
      new Response(null, { status: 500 }),
    ]);
    await expect(
      mk().assets.upload(new Uint8Array(10), {
        filename: 'a.png',
        mime: 'image/png',
        maxChunkRetries: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toMatchObject({ status: 500 });
    await expect(
      mk().assets.upload(new Uint8Array(10), {
        filename: 'a.png',
        mime: 'image/png',
        chunkSize: 1000,
      }),
    ).rejects.toThrow(/multiple of 262144/);
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
