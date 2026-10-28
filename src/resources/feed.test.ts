import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(respond: (url: string, method: string) => Response) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      seen.push({
        url: url.replace(/^https:\/\/ai\.codai\.ro/, ''),
        method,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      return respond(url, method);
    }),
  );
  return seen;
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });

const POST = { id: 'p1', kind: 'idea', body: 'x', author: { username: 'd', is_me: true } };

describe('client.feed', () => {
  it('maps every method to its gateway route', async () => {
    const seen = capture((url, method) => {
      if (url.includes('/report') || (url.endsWith('/v1/feed/blocks') && method === 'POST'))
        return json({ reported: true, blocked: true, username: 'other' }, 201);
      if (url.endsWith('/v1/feed/posts')) return json({ post: POST }, 201);
      return json({
        posts: [POST],
        next_cursor: 'c2',
        post: POST,
        username: 'd',
        suggested_username: null,
        guidelines_version: '2026-10-28',
        like_count: 1,
        liked_by_me: true,
        blocks: [{ username: 'other', created_at: '2026-10-28T10:00:00Z' }],
        deleted: true,
        blocked: false,
      });
    });
    const c = mk();
    expect((await c.feed.list({ kind: 'idea', limit: 5, cursor: 'c1' })).next_cursor).toBe('c2');
    expect((await c.feed.me()).guidelines_version).toBe('2026-10-28');
    expect(await c.feed.get('p 1')).toEqual(POST);
    expect(
      await c.feed.create({ kind: 'idea', body: 'x', guidelines_version: '2026-10-28' }),
    ).toEqual(POST);
    await c.feed.delete('p1');
    expect(await c.feed.like('p1')).toMatchObject({ like_count: 1, liked_by_me: true });
    await c.feed.unlike('p1');
    await c.feed.report('p1', { reason: 'spam' });
    expect(await c.feed.blocks()).toHaveLength(1);
    expect(await c.feed.block('p1')).toBe('other');
    await c.feed.unblock('other');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/feed?cursor=c1&limit=5&kind=idea',
      'GET /v1/feed/me',
      'GET /v1/feed/posts/p%201',
      'POST /v1/feed/posts',
      'DELETE /v1/feed/posts/p1',
      'POST /v1/feed/posts/p1/like',
      'DELETE /v1/feed/posts/p1/like',
      'POST /v1/feed/posts/p1/report',
      'GET /v1/feed/blocks',
      'POST /v1/feed/blocks',
      'DELETE /v1/feed/blocks/other',
    ]);
    expect(seen[3]!.body).toEqual({ kind: 'idea', body: 'x', guidelines_version: '2026-10-28' });
    expect(seen[9]!.body).toEqual({ post_id: 'p1' });
  });

  it('surfaces username_required as an error with the code', async () => {
    capture(() =>
      json(
        {
          error: {
            message: 'Choose a username',
            type: 'invalid_request_error',
            code: 'username_required',
          },
        },
        409,
      ),
    );
    await expect(
      mk().feed.create({ kind: 'project', body: 'x', guidelines_version: '2026-10-28' }),
    ).rejects.toMatchObject({ status: 409, code: 'username_required' });
  });

  it('fetches image bytes', async () => {
    const seen = capture(
      () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }),
    );
    const img = await mk().feed.image('p1', 2);
    expect(img).toEqual({ bytes: new Uint8Array([1, 2]), contentType: 'image/png' });
    expect(seen[0]!.url).toBe('/v1/feed/images/p1/2');
  });
});
