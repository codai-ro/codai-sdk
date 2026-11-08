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

const BASE = 'https://ai.codai.ro/v1/studio/edit-styles';
const knobs = {
  pacing: 'punchy' as const,
  captions: { preset: 'karaoke-pop' as const, max_words_per_line: 3 },
  zoom: 'heavy' as const,
  broll: { density: 'dense' as const, stock: true, generated: 'images' as const },
  reframe: 'fast' as const,
};
const own = {
  id: 7,
  object: 'studio.edit_style',
  builtin: false,
  name: 'Mine',
  description: '',
  knobs,
  status: 'private',
  copies: 0,
  copied_from: null,
  created_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T10:00:00Z',
};
const gallery = {
  object: 'list',
  data: [{ ...own, id: 9, author: 'ana', approved_at: null }],
  next_cursor: 9,
};

describe('editStyles', () => {
  it('list / create / update / delete hit the right paths', async () => {
    const calls = stub([
      json({ object: 'list', builtin: [], styles: [own], gallery }),
      json(own, 201),
      json({ ...own, name: 'Renamed' }),
      json({ id: 7, object: 'studio.edit_style', deleted: true }),
    ]);
    const c = mk();
    const l = await c.editStyles.list({ lang: 'ro', gallery: true });
    expect(l.styles).toHaveLength(1);
    expect(l.gallery?.next_cursor).toBe(9);
    expect((await c.editStyles.create({ name: 'Mine', knobs })).status).toBe('private');
    expect((await c.editStyles.update(7, { name: 'Renamed' })).name).toBe('Renamed');
    expect((await c.editStyles.delete(7)).deleted).toBe(true);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', `${BASE}?lang=ro&gallery=1`],
      ['POST', BASE],
      ['PATCH', `${BASE}/7`],
      ['DELETE', `${BASE}/7`],
    ]);
    expect(calls[1]!.body).toEqual({ name: 'Mine', knobs });
    expect(calls[2]!.body).toEqual({ name: 'Renamed' });
  });

  it('submit / gallery / copy / report / moderation', async () => {
    const calls = stub([
      json({ ...own, status: 'pending' }),
      json(gallery),
      json({ ...own, id: 10, copied_from: 9 }, 201),
      json({ created: true, hidden: false }, 201),
      json({ object: 'list', data: [] }),
      json({ ...own, status: 'approved' }),
    ]);
    const c = mk();
    expect((await c.editStyles.submit(7)).status).toBe('pending');
    expect((await c.editStyles.gallery({ limit: 12, cursor: 40 })).data[0]!.author).toBe('ana');
    expect((await c.editStyles.copy(9)).copied_from).toBe(9);
    expect(await c.editStyles.report(9, { reason: 'spam', details: 'ads' })).toEqual({
      created: true,
      hidden: false,
    });
    expect((await c.editStyles.moderationQueue({ status: 'pending' })).data).toEqual([]);
    expect((await c.editStyles.moderate(7, { action: 'approve' })).status).toBe('approved');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/7/submit`],
      ['GET', `${BASE}/gallery?limit=12&cursor=40`],
      ['POST', `${BASE}/9/copy`],
      ['POST', `${BASE}/9/report`],
      ['GET', `${BASE}/moderation?status=pending`],
      ['POST', `${BASE}/7/moderate`],
    ]);
    expect(calls[3]!.body).toEqual({ reason: 'spam', details: 'ads' });
    expect(calls[5]!.body).toEqual({ action: 'approve' });
  });

  it('surfaces too_many_styles as a CodaiError', async () => {
    stub([
      json(
        { error: { code: 'too_many_styles', message: 'You can keep up to 50 edit styles.' } },
        409,
      ),
    ]);
    const err = await mk()
      .editStyles.create({ name: 'x', knobs })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).code).toBe('too_many_styles');
  });
});
