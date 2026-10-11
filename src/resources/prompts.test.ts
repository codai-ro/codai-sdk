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

describe('client.prompts', () => {
  it('maps every method to the gateway route', async () => {
    const seen = capture({ data: [] });
    const c = mk();
    await c.prompts.list();
    await c.prompts.list({ status: 'due', limit: 5 });
    await c.prompts.create({
      prompt: 'Goal: ship it',
      source: 'cli',
      goal_key: 'g1',
      not_before: '2026-10-01',
    });
    await c.prompts.get('p 1');
    await c.prompts.update('p1', { status: 'done' });
    await c.prompts.delete('p1');
    await c.prompts.launch('p1');
    await c.prompts.launch('p1', 'd1');
    expect(seen.map((s) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`)).toEqual(
      [
        'GET /v1/prompts',
        'GET /v1/prompts?status=due&limit=5',
        'POST /v1/prompts',
        'GET /v1/prompts/p%201',
        'PATCH /v1/prompts/p1',
        'DELETE /v1/prompts/p1',
        'POST /v1/prompts/p1/launch',
        'POST /v1/prompts/p1/launch',
      ],
    );
    expect(seen[2]!.body).toEqual({
      prompt: 'Goal: ship it',
      source: 'cli',
      goal_key: 'g1',
      not_before: '2026-10-01',
    });
    expect(seen[4]!.body).toEqual({ status: 'done' });
    expect(seen[6]!.body).toEqual({});
    expect(seen[7]!.body).toEqual({ device_id: 'd1' });
  });

  it('returns the duplicate reply (200, created: false) as-is', async () => {
    capture({ id: 'p1', created: false, superseded: 0 });
    await expect(mk().prompts.create({ prompt: 'same text' })).resolves.toMatchObject({
      id: 'p1',
      created: false,
    });
  });

  it('does not retry launch (it starts a session)', async () => {
    const seen = capture({ error: { message: 'unavailable' } }, 503);
    const c = new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 2 });
    await expect(c.prompts.launch('p1')).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });

  it('maps match / verify / verifyMany (DX1)', async () => {
    const seen = capture({ prompt: {}, report: {}, results: [] });
    const c = mk();
    await c.prompts.match('p1', { ref: 's-1', turn_id: 't-1', answered: true });
    await c.prompts.verify('p1', { diff: '+x', head_sha: 'abc' });
    await c.prompts.verify('p1');
    await c.prompts.verifyMany({ all_active: true });
    expect(seen.map((s) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`)).toEqual(
      [
        'POST /v1/prompts/p1/match',
        'POST /v1/prompts/p1/verify',
        'POST /v1/prompts/p1/verify',
        'POST /v1/prompts/verify',
      ],
    );
    expect(seen[0]!.body).toEqual({ ref: 's-1', turn_id: 't-1', answered: true });
    expect(seen[2]!.body).toEqual({});
    expect(seen[3]!.body).toEqual({ all_active: true });
  });

  it('stream yields prompt events and skips keepalives', async () => {
    const sse =
      ': connected\n\n' +
      'event: prompt\ndata: {"op":"upsert","id":"p1","status":"sent"}\n\n' +
      ': keepalive\n\n' +
      'event: prompt\ndata: {"op":"delete","id":"p2","status":"deleted"}\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } })),
    );
    const got = [];
    for await (const e of mk().prompts.stream()) got.push(e);
    expect(got).toEqual([
      { op: 'upsert', id: 'p1', status: 'sent' },
      { op: 'delete', id: 'p2', status: 'deleted' },
    ]);
  });
});
