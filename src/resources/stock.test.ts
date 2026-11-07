import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

const BASE = 'https://ai.codai.ro/v1/studio/stock';

function stub(reply: unknown, status = 200) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        method: init.method ?? 'GET',
        url: String(url),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(reply), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const ITEM = {
  provider: 'pexels',
  id: '123',
  kind: 'video',
  page_url: 'https://www.pexels.com/video/123/',
  author_name: 'Jane Doe',
  author_url: 'https://www.pexels.com/@jane',
  credit: 'Video by Jane Doe on Pexels',
  licence: 'Pexels License',
  licence_url: 'https://www.pexels.com/license/',
  width: 1920,
  height: 1080,
  duration_s: 12,
  preview_url: 'https://images.pexels.com/x.jpg',
  files: [{ url: 'https://videos.pexels.com/x.mp4', width: 1920, height: 1080 }],
  ai_generated: false,
};

describe('stock (SX-08)', () => {
  it('search sends only the set query params and returns the list with attribution', async () => {
    const calls = stub({
      object: 'list',
      data: [ITEM],
      providers_tried: ['pexels'],
      warnings: [],
      attribution: { pexels: 'https://www.pexels.com', pixabay: 'https://pixabay.com' },
    });
    const c = new Codai({ apiKey: 'sk-test' });
    const r = await c.stock.search({
      q: 'sunrise city',
      kind: 'video',
      max_duration: 20,
      limit: 5,
    });
    expect(r.data[0]!.credit).toBe('Video by Jane Doe on Pexels');
    expect(r.attribution.pexels).toBe('https://www.pexels.com');
    const u = new URL(calls[0]!.url);
    expect([calls[0]!.method, `${u.origin}${u.pathname}`]).toEqual(['GET', `${BASE}/search`]);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      q: 'sunrise city',
      kind: 'video',
      max_duration: '20',
      limit: '5',
    });
  });

  it('import posts the item and returns the asset with its credit', async () => {
    const calls = stub(
      {
        asset_id: '9a8b7c6d-0000-4000-8000-000000000001',
        credit: 'Video by Jane Doe on Pexels',
        provider: 'pexels',
        provider_asset_id: '123',
        licence: 'Pexels License',
        licence_url: 'https://www.pexels.com/license/',
        source_page_url: 'https://www.pexels.com/video/123/',
      },
      201,
    );
    const c = new Codai({ apiKey: 'sk-test' });
    const a = await c.stock.import({
      provider: 'pexels',
      id: '123',
      kind: 'video',
      target_width: 1080,
    });
    expect(a.credit).toBe('Video by Jane Doe on Pexels');
    expect(calls[0]).toEqual({
      method: 'POST',
      url: `${BASE}/import`,
      body: { provider: 'pexels', id: '123', kind: 'video', target_width: 1080 },
    });
  });
});
