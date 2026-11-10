import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

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
const B = 'https://ai.codai.ro/v1/studio';

describe('publishing (SX-30)', () => {
  it('connections: list / start / exchange / delete', async () => {
    const calls = stub([
      json({ object: 'list', enabled: true, data: [] }),
      json({
        authorize_url: 'https://accounts.google.com/x',
        state: 's',
        code_verifier: 'v',
        expires_in_s: 600,
      }),
      json({ object: 'studio.connection', id: 'c1' }),
      json({ object: 'studio.connection', id: 'c1', deleted: true, revoked_at_platform: true }),
    ]);
    const c = mk();
    expect((await c.publishing.listConnections()).enabled).toBe(true);
    expect((await c.publishing.startConnection()).state).toBe('s');
    await c.publishing.exchangeConnection({ code: 'k', state: 's', code_verifier: 'v' });
    await c.publishing.deleteConnection('c 1');
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      `GET ${B}/connections`,
      `POST ${B}/connections/youtube/start`,
      `POST ${B}/connections/youtube/exchange`,
      `DELETE ${B}/connections/c%201`,
    ]);
    expect(calls[2]!.body).toEqual({ code: 'k', state: 's', code_verifier: 'v' });
  });

  it('draft / create / retrieve / cancel', async () => {
    const pub = { object: 'studio.publication', id: 'p1', phase: 'queued' };
    const calls = stub([
      json({ object: 'studio.publish_draft' }),
      json(pub, 202),
      json(pub),
      json({ ...pub, phase: 'cancelled' }),
    ]);
    const c = mk();
    await c.publishing.draft({ render_id: 'r1', title: 'T' });
    const body = {
      render_id: 'r1',
      connection_id: 'c1',
      title: 'T',
      privacy: 'unlisted' as const,
      made_for_kids: false,
      contains_synthetic_media: true,
      client_request_id: 'req-12345678',
    };
    expect((await c.publishing.create(body)).id).toBe('p1');
    await c.publishing.retrieve('p1');
    expect((await c.publishing.cancel('p1')).phase).toBe('cancelled');
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      `POST ${B}/publish/draft`,
      `POST ${B}/publish`,
      `GET ${B}/publish/p1`,
      `POST ${B}/publish/p1/cancel`,
    ]);
    expect(calls[1]!.body).toEqual(body);
  });
});
