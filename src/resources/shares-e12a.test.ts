import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError, shareTokenFrom } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const empty = (status = 204) => new Response(null, { status });

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

const ID = '7a1b2c3d-0000-4000-8000-000000000070';
const SHARE = '1b2c3d4e-0000-4000-8000-000000000071';
const THREAD = '2c3d4e5f-0000-4000-8000-000000000072';
const COMMENT = '3d4e5f60-0000-4000-8000-000000000073';
/** A syntactically valid 43-char share token (fake). */
const TOK = 'Ab'.repeat(20) + 'c_-';
const API = 'https://ai.codai.ro';
const BASE = `${API}/v1/studio/creatives/${ID}`;

const created = {
  id: SHARE,
  object: 'studio.share',
  kind: 'review',
  token: TOK,
  url: `https://hub.codai.ro/r/${TOK}`,
  label: 'Ana',
  pinned_seq: null,
  allow_remix: false,
  can_approve: true,
  expires_at: null,
  created_at: '2026-10-15T08:00:00Z',
};
const review = (status: string) => ({
  object: 'studio.review',
  creative_id: ID,
  status,
  head_seq: 4,
  requested_seq: status === 'draft' ? null : 4,
  requested_at: null,
  approved_seq: null,
  approved_doc_hash: null,
  approved_is_head: false,
  decided_by: null,
  decided_at: null,
  decision_note: null,
  threads: { open: 1, total: 2 },
});
const thread = (status = 'open') => ({
  id: THREAD,
  node_id: 'n1',
  scene_id: 's1',
  t_ms: 1200,
  seq: 4,
  status,
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-10-15T08:00:00Z',
  comments: [
    {
      id: THREAD,
      kind: 'comment',
      decision: null,
      author: { kind: 'owner', name: null },
      body: 'Logo mai mare',
      created_at: '2026-10-15T08:00:00Z',
    },
  ],
});

describe('shareTokenFrom', () => {
  it('accepts a raw token and view / review links, trimming whitespace', () => {
    expect(TOK).toHaveLength(43);
    expect(shareTokenFrom(`  ${TOK} `)).toBe(TOK);
    expect(shareTokenFrom(`https://hub.codai.ro/s/${TOK}`)).toBe(TOK);
    expect(shareTokenFrom(`https://hub.codai.ro/r/${TOK}?x=1#y`)).toBe(TOK);
  });

  it('rejects other paths, schemes and malformed tokens', () => {
    expect(shareTokenFrom(`https://hub.codai.ro/t/${TOK}`)).toBeNull();
    expect(shareTokenFrom(`ftp://hub.codai.ro/s/${TOK}`)).toBeNull();
    expect(shareTokenFrom('short')).toBeNull();
    expect(shareTokenFrom(`https://hub.codai.ro/s/${TOK}x`)).toBeNull();
  });
});

describe('client.creatives share + review (E-12a)', () => {
  it('createShare POSTs only the given fields and returns the token once; listShares and revokeShare hit the share routes', async () => {
    const calls = stub([
      json(created, 201),
      json({
        object: 'list',
        data: [{ ...created, token: undefined, url: null, last_used_at: null }],
      }),
      empty(),
    ]);
    const c = mk();
    const r = await c.creatives.createShare(ID, {
      kind: 'review',
      can_approve: true,
      label: 'Ana',
      expires_in_days: undefined,
    });
    expect(r.token).toBe(TOK);
    expect((await c.creatives.listShares(ID)).data[0]!.url).toBeNull();
    await expect(c.creatives.revokeShare(ID, SHARE)).resolves.toBeUndefined();
    expect(calls.map((x) => [x.method, x.url, x.body])).toEqual([
      ['POST', `${BASE}/shares`, { kind: 'review', can_approve: true, label: 'Ana' }],
      ['GET', `${BASE}/shares`, undefined],
      ['DELETE', `${BASE}/shares/${SHARE}`, undefined],
    ]);
  });

  it('createShare surfaces 409 too_many_shares as a CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'Too many links.',
            type: 'invalid_request_error',
            code: 'too_many_shares',
          },
        },
        409,
      ),
    ]);
    await expect(mk().creatives.createShare(ID, { kind: 'view' })).rejects.toBeInstanceOf(
      CodaiError,
    );
  });

  it('review / requestReview / resetReview read and change the review state', async () => {
    const calls = stub([json(review('draft')), json(review('in_review')), json(review('draft'))]);
    const c = mk();
    expect((await c.creatives.review(ID)).status).toBe('draft');
    expect((await c.creatives.requestReview(ID)).status).toBe('in_review');
    expect((await c.creatives.resetReview(ID)).status).toBe('draft');
    expect(calls.map((x) => [x.method, x.url, x.body])).toEqual([
      ['GET', `${BASE}/review`, undefined],
      ['POST', `${BASE}/review`, { action: 'request' }],
      ['POST', `${BASE}/review`, { action: 'reset' }],
    ]);
  });

  it('thread methods hit the owner thread routes with the status filter and anchors', async () => {
    const calls = stub([
      json({ object: 'list', data: [thread()] }),
      json(thread(), 201),
      json(thread(), 201),
      json(thread('resolved')),
      json(thread()),
      empty(),
    ]);
    const c = mk();
    expect((await c.creatives.reviewThreads(ID, { status: 'open' })).data).toHaveLength(1);
    await c.creatives.createReviewThread(ID, { body: 'Logo mai mare', node_id: 'n1', t_ms: 1200 });
    await c.creatives.replyReviewThread(ID, THREAD, { body: 'Gata' });
    expect((await c.creatives.resolveReviewThread(ID, THREAD)).status).toBe('resolved');
    expect((await c.creatives.reopenReviewThread(ID, THREAD)).status).toBe('open');
    await c.creatives.deleteReviewComment(ID, COMMENT);
    expect(calls.map((x) => [x.method, x.url, x.body])).toEqual([
      ['GET', `${BASE}/review/threads?status=open`, undefined],
      ['POST', `${BASE}/review/threads`, { body: 'Logo mai mare', node_id: 'n1', t_ms: 1200 }],
      ['POST', `${BASE}/review/threads/${THREAD}/replies`, { body: 'Gata' }],
      ['POST', `${BASE}/review/threads/${THREAD}/resolve`, undefined],
      ['POST', `${BASE}/review/threads/${THREAD}/reopen`, undefined],
      ['DELETE', `${BASE}/review/comments/${COMMENT}`, undefined],
    ]);
  });
});

describe('client.shares (E-12a)', () => {
  it('get reads the public route from a link with format and locale; remix POSTs the token route', async () => {
    const pub = {
      object: 'studio.public_share',
      kind: 'view',
      title: 'Promo',
      creative_kind: 'video',
      seq: 3,
      doc_hash: 'h',
      allow_remix: true,
      can_approve: false,
      formats: [{ id: 'story', width: 1080, height: 1920 }],
      default_format: 'story',
      locales: ['en', 'ro'],
      compiled: null,
      review: null,
      threads: null,
    };
    const calls = stub([
      json(pub),
      json({ id: ID, object: 'studio.creative', remixed_from: { share_id: SHARE, seq: 3 } }, 201),
    ]);
    const c = mk();
    expect((await c.shares.get(`https://hub.codai.ro/s/${TOK}`, { locale: 'ro' })).seq).toBe(3);
    expect((await c.shares.remix(TOK, { title: 'Copia mea' })).remixed_from.seq).toBe(3);
    expect(calls.map((x) => [x.method, x.url, x.body])).toEqual([
      ['GET', `${API}/v1/public/studio/shares/${TOK}?locale=ro`, undefined],
      ['POST', `${API}/v1/studio/shares/${TOK}/remix`, { title: 'Copia mea' }],
    ]);
  });

  it('reviewer methods hit the public review routes with the name', async () => {
    const R = `${API}/v1/public/studio/reviews/${TOK}`;
    const calls = stub([
      json(thread(), 201),
      json(thread(), 201),
      json(thread('resolved')),
      json(thread()),
      json({
        status: 'approved',
        requested_seq: 4,
        approved_seq: 4,
        approved_is_head: true,
        decided_by: 'Ana',
        decided_at: '2026-10-15T09:00:00Z',
      }),
    ]);
    const c = mk();
    const link = `https://hub.codai.ro/r/${TOK}`;
    await c.shares.comment(link, { name: 'Ana', body: 'Super', t_ms: 500 });
    await c.shares.reply(link, THREAD, { name: 'Ana', body: 'Da' });
    await c.shares.resolve(link, THREAD, { name: 'Ana' });
    await c.shares.reopen(link, THREAD, { name: 'Ana' });
    expect(
      (await c.shares.decide(link, { name: 'Ana', decision: 'approve', seq: 4 })).approved_seq,
    ).toBe(4);
    expect(calls.map((x) => [x.method, x.url, x.body])).toEqual([
      ['POST', `${R}/threads`, { name: 'Ana', body: 'Super', t_ms: 500 }],
      ['POST', `${R}/threads/${THREAD}/replies`, { name: 'Ana', body: 'Da' }],
      ['POST', `${R}/threads/${THREAD}/resolve`, { name: 'Ana' }],
      ['POST', `${R}/threads/${THREAD}/reopen`, { name: 'Ana' }],
      ['POST', `${R}/decision`, { name: 'Ana', decision: 'approve', seq: 4 }],
    ]);
  });

  it('decide surfaces 409 stale as a CodaiError', async () => {
    stub([
      json(
        {
          error: { message: 'Stale.', type: 'invalid_request_error', code: 'stale', head_seq: 5 },
        },
        409,
      ),
    ]);
    const err = await mk()
      .shares.decide(TOK, { name: 'Ana', decision: 'request_changes', seq: 4 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(409);
  });

  it('rejects something that is not a share link without calling the API', async () => {
    const calls = stub([]);
    expect(() => mk().shares.get('https://example.com/x')).toThrow(TypeError);
    expect(calls).toEqual([]);
  });
});
