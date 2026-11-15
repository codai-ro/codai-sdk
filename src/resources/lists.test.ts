import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(respond: (url: string) => Response) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url: url.replace(/^https:\/\/ai\.codai\.ro/, ''),
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      return respond(url);
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

const LIST = { id: 'l1', name: 'Inbox', preset: 'inbox' };
const ITEM = { id: 'i1', list_id: 'l1', title: 'x' };

describe('client.lists', () => {
  it('maps the JSON methods to the gateway routes', async () => {
    const seen = capture(() =>
      json({ lists: [LIST], list: LIST, items: [ITEM], item: ITEM, ok: true }),
    );
    const c = mk();
    expect(await c.lists.list()).toEqual([LIST]);
    await c.lists.list({ archived: true });
    expect(await c.lists.update('l 1', { name: 'N' })).toEqual(LIST);
    await c.lists.delete('l1');
    await c.lists.reorder(['a', 'b']);
    expect(await c.lists.items('l1', { done: true, limit: 5 })).toEqual([ITEM]);
    await c.lists.items('l1');
    expect(await c.lists.updateItem('i1', { done: true })).toEqual(ITEM);
    await c.lists.deleteItem('i1');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/lists',
      'GET /v1/lists?archived=1',
      'PATCH /v1/lists/l%201',
      'DELETE /v1/lists/l1',
      'PATCH /v1/lists/order',
      'GET /v1/lists/l1/items?done=1&limit=5',
      'GET /v1/lists/l1/items',
      'PATCH /v1/lists/items/i1',
      'DELETE /v1/lists/items/i1',
    ]);
    expect(seen[4]!.body).toEqual({ ids: ['a', 'b'] });
    expect(seen[7]!.body).toEqual({ done: true });
  });

  it('accepts 201 for create and 200/201 for add and share', async () => {
    let status = 201;
    const seen = capture(() => json({ list: LIST, item: ITEM, created: status === 201 }, status));
    const c = mk();
    expect(await c.lists.create({ name: 'Books' })).toEqual(LIST);
    expect((await c.lists.add('l1', { url: 'https://x.ro', client_id: 'c1' })).created).toBe(true);
    expect((await c.lists.share({ text: 'hi', auto: true })).list).toEqual(LIST);
    status = 200;
    expect((await c.lists.add('l1', { url: 'https://x.ro' })).created).toBe(false);
    expect((await c.lists.share({ preset: 'notes', text: 'hi' })).created).toBe(false);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST /v1/lists',
      'POST /v1/lists/l1/items',
      'POST /v1/share',
      'POST /v1/lists/l1/items',
      'POST /v1/share',
    ]);
    expect(seen[2]!.body).toEqual({ text: 'hi', auto: true });
  });

  it('exportMarkdown returns text and image returns bytes', async () => {
    const seen = capture((url) =>
      url.endsWith('/export.md')
        ? new Response('# Inbox\n- [ ] x\n', { headers: { 'content-type': 'text/markdown' } })
        : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }),
    );
    const c = mk();
    expect(await c.lists.exportMarkdown('l1')).toBe('# Inbox\n- [ ] x\n');
    const img = await c.lists.image('i1');
    expect([...img.bytes]).toEqual([1, 2, 3]);
    expect(img.contentType).toBe('image/webp');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/lists/l1/export.md',
      'GET /v1/lists/items/i1/image',
    ]);
  });

  it('stream yields only `list` frames', async () => {
    const body =
      ': ping\n\n' +
      'event: list\ndata: {"op":"item","listId":"l1","itemId":"i1"}\n\n' +
      'event: other\ndata: {}\n\n' +
      'event: list\ndata: {"op":"lists"}\n\n';
    const seen = capture(
      () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    );
    const out = [];
    for await (const ev of mk().lists.stream()) out.push(ev);
    expect(out).toEqual([{ op: 'item', listId: 'l1', itemId: 'i1' }, { op: 'lists' }]);
    expect(seen[0]!.url).toBe('/v1/lists/stream');
  });
});

describe('client.schedules.audit', () => {
  it('calls GET /v1/schedules/audit with filters and returns the entries', async () => {
    const entry = { id: 1, action: 'schedule.create', actor: 'user', at: 'now', detail: {} };
    const seen = capture(() => json({ audit: [entry] }));
    const c = mk();
    expect(await c.schedules.audit()).toEqual([entry]);
    await c.schedules.audit({ schedule_id: 's1', limit: 10 });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/schedules/audit',
      'GET /v1/schedules/audit?schedule_id=s1&limit=10',
    ]);
  });
});
