import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(payload: unknown, status = 200) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      return new Response(JSON.stringify(payload), { status });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });
const route = (s: Seen) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`;

describe('client.usage', () => {
  it('sends no query by default and every filter when given', async () => {
    const seen = capture({ from: '2026-09-06', to: '2026-10-05', group_by: 'day', data: [] });
    const c = mk();
    await c.usage.get();
    await c.usage.get({
      from: '2026-09-01',
      to: '2026-09-30',
      group_by: 'device',
      key: 'k1',
      device: 'd1',
      app: 'app1',
      platform: 'vscode',
      model: 'codai',
      tag: 'acme',
    });
    expect(seen.map(route)).toEqual([
      'GET /v1/usage',
      'GET /v1/usage?from=2026-09-01&to=2026-09-30&group_by=device&key=k1&device=d1&app=app1&platform=vscode&model=codai&tag=acme',
    ]);
  });

  it('returns rows with cost as a USD-micros string, unconverted', async () => {
    capture({
      from: '2026-10-01',
      to: '2026-10-01',
      group_by: 'model',
      data: [
        {
          key: 'codai',
          requests: 3,
          errors: 0,
          tasks: 1,
          prompt_tokens: 10,
          completion_tokens: 5,
          cached_read_tokens: 2,
          cost_micro_usd: '1250000',
        },
      ],
    });
    const r = await mk().usage.get({ group_by: 'model' });
    expect(r.data[0]!.cost_micro_usd).toBe('1250000');
  });
});

describe('client.keys', () => {
  it('lists keys, with include_revoked only when asked', async () => {
    const seen = capture({ data: [] });
    const c = mk();
    await c.keys.list();
    await c.keys.list({ include_revoked: false });
    await c.keys.list({ include_revoked: true });
    expect(seen.map(route)).toEqual([
      'GET /v1/keys',
      'GET /v1/keys',
      'GET /v1/keys?include_revoked=true',
    ]);
  });

  it('setTags PATCHes { tags } on the encoded id', async () => {
    const seen = capture({ id: 'k 1', tags: ['a', 'b'] });
    const r = await mk().keys.setTags('k 1', ['a', 'b']);
    expect(route(seen[0]!)).toBe('PATCH /v1/keys/k%201');
    expect(seen[0]!.body).toEqual({ tags: ['a', 'b'] });
    expect(r).toEqual({ id: 'k 1', tags: ['a', 'b'] });
  });

  it('setTags with [] clears the tags', async () => {
    const seen = capture({ id: 'k1', tags: [] });
    await mk().keys.setTags('k1', []);
    expect(seen[0]!.body).toEqual({ tags: [] });
  });
});
