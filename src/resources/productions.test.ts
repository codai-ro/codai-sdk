import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

const BASE = 'https://ai.codai.ro/v1/studio/productions';
const ID = '6d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6';
const prod = (o: Record<string, unknown> = {}) => ({
  id: ID,
  object: 'studio.production',
  status: 'running',
  phase: 'render',
  brief: 'A promo',
  language: 'ro',
  aspect_ratio: '16:9',
  title: 'Promo',
  starter: 'starter:product-launch:ro',
  scenes: 3,
  creative_id: 'c1',
  render_id: 'r1',
  first_render_id: 'r1',
  qa: null,
  budget_micro_usd: '3000000',
  spent_micro_usd: '200000',
  warnings: [],
  error: null,
  created_at: '2026-10-19T00:00:00Z',
  ...o,
});

function stub(replies: unknown[]) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] =
    [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        method: init.method ?? 'GET',
        url: String(url),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      const r = replies[Math.min(i++, replies.length - 1)];
      return new Response(JSON.stringify(r), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('productions (RC-20)', () => {
  it('create sends the brief with the Idempotency-Key, retrieve gets one', async () => {
    const calls = stub([prod(), prod({ phase: 'qa' })]);
    const c = new Codai({ apiKey: 'sk-test' });
    expect(
      (
        await c.productions.create(
          { brief: 'Un promo de test', language: 'ro' },
          { idempotencyKey: 'k1' },
        )
      ).phase,
    ).toBe('render');
    expect((await c.productions.retrieve(ID)).phase).toBe('qa');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', BASE],
      ['GET', `${BASE}/${ID}`],
    ]);
    expect(calls[0]!.body).toEqual({ brief: 'Un promo de test', language: 'ro' });
    expect(calls[0]!.headers['idempotency-key']).toBe('k1');
  });

  it('run = create + wait until succeeded', async () => {
    stub([
      prod(),
      prod({ phase: 'qa' }),
      prod({ status: 'succeeded', phase: 'ready', render_id: 'r2' }),
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const out = await c.productions.run({ brief: 'Un promo de test' }, { intervalMs: 1 });
    expect(out).toMatchObject({ status: 'succeeded', render_id: 'r2' });
  });

  it('wait gives up after timeoutMs', async () => {
    stub([prod()]);
    const c = new Codai({ apiKey: 'sk-test' });
    await expect(c.productions.wait(ID, { intervalMs: 5, timeoutMs: 1 })).rejects.toThrow(
      /did not finish/,
    );
  });
});
