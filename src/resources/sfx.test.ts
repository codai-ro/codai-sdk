import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const sound = {
  sfx_id: 'kenney-impact-metal-heavy-001',
  name: 'Metal heavy 1',
  category: 'impact',
  tags: ['metal', 'heavy'],
  duration_seconds: 0.62,
  mime_type: 'audio/ogg',
  license: 'CC0-1.0',
  source: 'kenney',
  preview_url: 'https://storage.googleapis.com/b/sfx/x.ogg?X-Goog-Signature=abc',
};

type Call = { url: string; method: string; body: unknown };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: String(init.method ?? 'GET'), body: init.body });
      return replies.shift()!;
    }),
  );
  return calls;
}

describe('sfx', () => {
  it('search() sends q/category/tags/max_duration/limit and joins tag arrays', async () => {
    const page = { object: 'list', data: [sound], source: 'library' };
    const calls = stub([json(page)]);
    const r = await mk().sfx.search({
      q: 'metal hit',
      category: 'impact',
      tags: ['metal', 'heavy'],
      max_duration: 2,
      limit: 5,
    });
    expect(calls[0]!.method).toBe('GET');
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/v1/studio/sfx');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      q: 'metal hit',
      category: 'impact',
      tags: 'metal,heavy',
      max_duration: '2',
      limit: '5',
    });
    expect(r.data).toEqual([sound]);
    expect(r.source).toBe('library');
    expect(r.fallbackUnavailable).toBe(false);
  });

  it('search() without params sends no query and reports a failed Freesound fallback', async () => {
    const calls = stub([
      json({ object: 'list', data: [], source: 'library' }, 200, {
        'x-codai-sfx-fallback': 'unavailable',
      }),
    ]);
    const r = await mk().sfx.search();
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/studio/sfx');
    expect(r.fallbackUnavailable).toBe(true);
  });

  it('import() POSTs /v1/studio/sfx/{id}/import and returns the sfx asset', async () => {
    const asset = {
      asset_id: '7d0f2c1e-0000-4000-8000-000000000009',
      kind: 'sfx',
      status: 'ready',
      model: 'codai-sfx',
      url: 'https://storage.googleapis.com/b/u/a.ogg?sig',
      mime_type: 'audio/ogg',
      bytes: 9000,
      duration_seconds: 0.62,
      width: null,
      height: null,
      created_at: '2026-10-10T08:00:00.000Z',
      expires_at: '2026-10-10T09:00:00.000Z',
    };
    const calls = stub([json(asset)]);
    const a = await mk().sfx.import('fs-123/x');
    expect(calls[0]).toMatchObject({
      url: 'https://ai.codai.ro/v1/studio/sfx/fs-123%2Fx/import',
      method: 'POST',
    });
    expect(a.kind).toBe('sfx');
  });

  it('import() surfaces license_not_allowed as a 400 CodaiError', async () => {
    stub([
      json(
        { error: { message: 'Only CC0 sounds can be imported', code: 'license_not_allowed' } },
        400,
      ),
    ]);
    await expect(mk().sfx.import('fs-9')).rejects.toMatchObject({ status: 400 });
  });
});
