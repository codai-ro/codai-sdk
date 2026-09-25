import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(payload: unknown) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
      return new Response(JSON.stringify(payload), { status: 200 });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });

describe('client.triggers / client.notifications', () => {
  it('maps every method to the gateway route', async () => {
    const seen = capture({ data: [] });
    const c = mk();
    await c.triggers.list();
    await c.triggers.create({ name: 'n', source: 'github', policy: { mode: 'smart' } } as never);
    await c.triggers.update('a b', { enabled: false } as never);
    await c.triggers.rotateSecret('t1');
    await c.triggers.test('t1', { severity: 'high' } as never);
    await c.triggers.events('t1', 10);
    await c.triggers.delete('t1');
    await c.notifications.list({ unread: true, limit: 5 });
    await c.notifications.markRead([1, 2]);
    await c.notifications.markRead();
    expect(seen.map((s) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`)).toEqual([
      'GET /v1/triggers',
      'POST /v1/triggers',
      'PATCH /v1/triggers/a%20b',
      'POST /v1/triggers/t1/rotate-secret',
      'POST /v1/triggers/t1/test',
      'GET /v1/triggers/t1/events?limit=10',
      'DELETE /v1/triggers/t1',
      'GET /v1/notifications?unread=1&limit=5',
      'POST /v1/notifications/read',
      'POST /v1/notifications/read',
    ]);
    expect(seen[1]!.body).toEqual({ name: 'n', source: 'github', policy: { mode: 'smart' } });
    expect(seen[8]!.body).toEqual({ ids: [1, 2] });
    expect(seen[9]!.body).toEqual({});
  });

  it('fireHook signs the raw body with the codai scheme (verifiable with the same HMAC)', async () => {
    const heads: Record<string, string>[] = [];
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      heads.push(init.headers as Record<string, string>);
      bodies.push(init.body as string);
      return new Response('{"accepted":true,"duplicate":false,"event_id":1}', { status: 202 });
    }));
    const r = await mk().triggers.fireHook('t1', 'whsec_x', { title: 'Down', severity: 'high' }, { deliveryId: 'd1' });
    expect(r).toMatchObject({ accepted: true });
    const sig = heads[0]!['x-codai-signature']!;
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig)!;
    const { createHmac } = await import('node:crypto');
    expect(m[2]).toBe(createHmac('sha256', 'whsec_x').update(`${m[1]}.${bodies[0]}`).digest('hex'));
    expect(heads[0]!['x-codai-delivery']).toBe('d1');
    expect(JSON.parse(bodies[0]!)).toEqual({ title: 'Down', severity: 'high' });
  });
});
