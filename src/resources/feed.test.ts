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

  it('maps profile, comments, lang and block targets (round 2)', async () => {
    const COMMENT = {
      id: 'c1',
      post_id: 'p1',
      body: 'nice',
      author: { username: 'd', is_me: true, badge: null },
      status: 'visible',
      created_at: '2026-10-28T10:00:00Z',
    };
    const seen = capture((url, method) => {
      if (url.includes('/comments/c1/report')) return json({ reported: true }, 201);
      if (url.endsWith('/v1/feed/blocks')) return json({ blocked: true, username: 'codai' }, 201);
      if (url.includes('/v1/feed/posts/p1/comments') && method === 'POST')
        return json({ comment: COMMENT, comment_count: 4 }, 201);
      if (url.includes('/v1/feed/comments/c1')) return json({ deleted: true, comment_count: 3 });
      return json({
        profile: {
          username: 'codai',
          badge: 'team',
          is_me: false,
          blocked: false,
          post_count: 12,
          first_post_at: null,
        },
        posts: [POST],
        comments: [COMMENT],
        next_cursor: null,
      });
    });
    const c = mk();
    await c.feed.list({ lang: 'ro' });
    const prof = await c.feed.user('Co dai', {
      cursor: 'c1',
      limit: 5,
      kind: 'project',
      lang: 'en',
    });
    expect(prof.profile.badge).toBe('team');
    expect((await c.feed.comments('p1', { limit: 10, cursor: 'x' })).comments).toEqual([COMMENT]);
    expect(
      await c.feed.comment('p1', { body: 'nice', clientId: 'k1', guidelinesVersion: '2026-10-28' }),
    ).toEqual({ comment: COMMENT, comment_count: 4 });
    await c.feed.comment('p1', { body: 'again', guidelinesVersion: '2026-10-28' });
    expect(await c.feed.deleteComment('c1')).toBe(3);
    await c.feed.reportComment('c1', { reason: 'spam', details: 'ads' });
    expect(await c.feed.block({ username: 'codai' })).toBe('codai');
    await c.feed.block({ postId: 'p2' });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/feed?lang=ro',
      'GET /v1/feed/users/Co%20dai?cursor=c1&limit=5&kind=project&lang=en',
      'GET /v1/feed/posts/p1/comments?cursor=x&limit=10',
      'POST /v1/feed/posts/p1/comments',
      'POST /v1/feed/posts/p1/comments',
      'DELETE /v1/feed/comments/c1',
      'POST /v1/feed/comments/c1/report',
      'POST /v1/feed/blocks',
      'POST /v1/feed/blocks',
    ]);
    expect(seen[3]!.body).toEqual({
      body: 'nice',
      guidelines_version: '2026-10-28',
      client_id: 'k1',
    });
    expect(seen[4]!.body).toEqual({ body: 'again', guidelines_version: '2026-10-28' });
    expect(seen[6]!.body).toEqual({ reason: 'spam', details: 'ads' });
    expect(seen[7]!.body).toEqual({ username: 'codai' });
    expect(seen[8]!.body).toEqual({ post_id: 'p2' });
  });

  it('surfaces user_not_found on a profile', async () => {
    capture(() =>
      json(
        { error: { message: 'Not found', type: 'invalid_request_error', code: 'user_not_found' } },
        404,
      ),
    );
    await expect(mk().feed.user('ghost')).rejects.toMatchObject({
      status: 404,
      code: 'user_not_found',
    });
  });

  it('fetches link preview bytes', async () => {
    const seen = capture(
      () => new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/webp' } }),
    );
    expect(await mk().feed.previewImage('p1')).toEqual({
      bytes: new Uint8Array([9]),
      contentType: 'image/webp',
    });
    expect(seen[0]!.url).toBe('/v1/feed/previews/p1');
  });

  it('maps following/search/tag filters, follows, tags, replies and public reads (round 3)', async () => {
    const seen = capture((url, method) => {
      if (url.endsWith('/v1/feed/follows') && method === 'POST')
        return json({ following: true, username: 'ana_m' }, 201);
      if (url.includes('/v1/feed/follows/')) return json({ following: false });
      if (url.includes('/v1/feed/follows'))
        return json({
          follows: [{ username: 'ana_m', badge: null, created_at: '2026-10-30T10:00:00Z' }],
          next_cursor: null,
        });
      if (url.includes('/v1/feed/tags')) return json({ tags: [{ tag: 'agents', count: 4 }] });
      if (url.includes('/comments'))
        return json(
          { comment: { id: 'c2', parent_id: 'c1', mentions: ['ana_m'] }, comment_count: 2 },
          201,
        );
      if (url.includes('/v1/public/feed/posts/')) return json({ post: { ...POST, tags: [] } });
      if (url.includes('/v1/public/feed/sitemap')) return json({ posts: [], users: [] });
      return json({ profile: { username: 'ana_m' }, posts: [], next_cursor: null });
    });
    const c = mk();
    await c.feed.list({ scope: 'following', q: 'România', tag: 'agents', limit: 5 });
    expect(await c.feed.tags({ prefix: 'ag', limit: 3 })).toEqual([{ tag: 'agents', count: 4 }]);
    await c.feed.tags();
    expect(await c.feed.follow('ana_m')).toEqual({ following: true, username: 'ana_m' });
    await c.feed.unfollow('ana m');
    expect((await c.feed.follows({ cursor: 'x', limit: 10 })).follows[0]!.username).toBe('ana_m');
    await c.feed.follows();
    const created = await c.feed.comment('p1', {
      body: 'Agreed @ana_m',
      parentId: 'c1',
      clientId: 'k2',
      guidelinesVersion: '2026-10-28',
    });
    expect(created.comment.parent_id).toBe('c1');
    expect((await c.feed.publicPost('p1')).id).toBe('p1');
    await c.feed.publicUser('ana_m', { limit: 2 });
    expect(await c.feed.publicSitemap()).toEqual({ posts: [], users: [] });
    expect(c.feed.mediaUrl('p 1')).toBe('https://ai.codai.ro/v1/feed/media/p%201');
    expect(c.feed.mediaPosterUrl('p1')).toBe('https://ai.codai.ro/v1/feed/media/p1/poster');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/feed?limit=5&scope=following&q=Rom%C3%A2nia&tag=agents',
      'GET /v1/feed/tags?prefix=ag&limit=3',
      'GET /v1/feed/tags',
      'POST /v1/feed/follows',
      'DELETE /v1/feed/follows/ana%20m',
      'GET /v1/feed/follows?cursor=x&limit=10',
      'GET /v1/feed/follows',
      'POST /v1/feed/posts/p1/comments',
      'GET /v1/public/feed/posts/p1',
      'GET /v1/public/feed/users/ana_m?limit=2',
      'GET /v1/public/feed/sitemap',
    ]);
    expect(seen[3]!.body).toEqual({ username: 'ana_m' });
    expect(seen[7]!.body).toEqual({
      body: 'Agreed @ana_m',
      guidelines_version: '2026-10-28',
      parent_id: 'c1',
      client_id: 'k2',
    });
  });

  it('surfaces follow_not_found on unfollow', async () => {
    capture(() =>
      json(
        {
          error: {
            message: 'Not following',
            type: 'invalid_request_error',
            code: 'follow_not_found',
          },
        },
        404,
      ),
    );
    await expect(mk().feed.unfollow('ana_m')).rejects.toMatchObject({
      status: 404,
      code: 'follow_not_found',
    });
  });
});
