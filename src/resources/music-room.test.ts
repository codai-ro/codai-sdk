import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

const BASE = 'https://ai.codai.ro/v1/studio/music-room';
const ID = '7e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7';
const room = (o: Record<string, unknown> = {}) => ({
  id: ID,
  object: 'studio.music_room',
  status: 'running',
  phase: 'plan',
  gate: null,
  brief: 'o manea veselă',
  language: 'ro',
  genre_id: 'manele',
  title: null,
  creative_id: null,
  demo_asset_id: null,
  final_asset_id: null,
  stems_asset_ids: [],
  team: [],
  critique: null,
  robot_score: null,
  copy_risk: null,
  credits: [],
  quota: { within: true, used: 1, included: 4 },
  budget_micro_usd: '4000000',
  spent_micro_usd: '0',
  warnings: [],
  error: null,
  created_at: '2026-10-22T00:00:00Z',
  ...o,
});
const waiting = (kind: 'plan' | 'demo' | 'final') =>
  room({ status: 'waiting', phase: `gate_${kind}`, gate: { kind, since: '2026-10-22T00:01:00Z' } });

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

describe('studio.musicRoom (MR-09..MR-17)', () => {
  it('create sends the body with the Idempotency-Key; get, quota and list hit their paths', async () => {
    const quota = {
      plan: 'pro',
      included: 4,
      used: 1,
      remaining: 3,
      period_end: '2026-11-01T00:00:00Z',
    };
    const calls = stub([
      room(),
      waiting('plan'),
      quota,
      { object: 'list', data: [room()], has_more: false },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const created = await c.studio.musicRoom.create(
      { brief: 'o manea veselă de nuntă', language: 'ro', genre: 'manele', auto: false },
      { idempotencyKey: 'mr-1' },
    );
    expect(created.object).toBe('studio.music_room');
    expect((await c.studio.musicRoom.get(ID)).gate?.kind).toBe('plan');
    expect((await c.studio.musicRoom.quota()).remaining).toBe(3);
    const list = await c.studio.musicRoom.list({ limit: 5, before: '2026-10-01T00:00:00Z' });
    expect(list.data).toHaveLength(1);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', BASE],
      ['GET', `${BASE}/${ID}`],
      ['GET', `${BASE}/quota`],
      ['GET', `${BASE}?limit=5&before=2026-10-01T00%3A00%3A00Z`],
    ]);
    expect(calls[0]!.body).toEqual({
      brief: 'o manea veselă de nuntă',
      language: 'ro',
      genre: 'manele',
      auto: false,
    });
    expect(calls[0]!.headers['idempotency-key']).toBe('mr-1');
  });

  it('list without a query sends no query string; get encodes the id', async () => {
    const calls = stub([{ object: 'list', data: [] }, room()]);
    const c = new Codai({ apiKey: 'sk-test' });
    await c.studio.musicRoom.list();
    await c.studio.musicRoom.get('a/b');
    expect(calls.map((x) => x.url)).toEqual([BASE, `${BASE}/a%2Fb`]);
  });

  it('choose posts the gate answer; direct posts the direction with the Idempotency-Key', async () => {
    const calls = stub([room({ phase: 'compose' }), room({ phase: 'parts' })]);
    const c = new Codai({ apiKey: 'sk-test' });
    expect((await c.studio.musicRoom.choose(ID, { gate: 'plan', variant: 1 })).phase).toBe(
      'compose',
    );
    await c.studio.musicRoom.direct(
      ID,
      { role: 'drums', section_id: 'chorus1', direction: 'fewer fills' },
      { idempotencyKey: 'd1' },
    );
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/choose`],
      ['POST', `${BASE}/${ID}/direct`],
    ]);
    expect(calls[0]!.body).toEqual({ gate: 'plan', variant: 1 });
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
    expect(calls[1]!.body).toEqual({
      role: 'drums',
      section_id: 'chorus1',
      direction: 'fewer fills',
    });
    expect(calls[1]!.headers['idempotency-key']).toBe('d1');
  });

  it('wait polls past gates until succeeded by default', async () => {
    const calls = stub([
      room(),
      waiting('demo'),
      room({ status: 'succeeded', phase: 'ready', final_asset_id: 'a9' }),
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const out = await c.studio.musicRoom.wait(ID, { intervalMs: 1 });
    expect(out).toMatchObject({ status: 'succeeded', final_asset_id: 'a9' });
    expect(calls).toHaveLength(3);
  });

  it('wait with untilGate returns at the first gate', async () => {
    const calls = stub([room(), waiting('plan'), room({ status: 'succeeded' })]);
    const c = new Codai({ apiKey: 'sk-test' });
    const out = await c.studio.musicRoom.wait(ID, { intervalMs: 1, untilGate: true });
    expect(out.status).toBe('waiting');
    expect(out.gate?.kind).toBe('plan');
    expect(calls).toHaveLength(2);
  });

  it('wait resolves a failed song and gives up after timeoutMs', async () => {
    stub([room({ status: 'failed', phase: 'failed', error: 'gate_expired' })]);
    const c = new Codai({ apiKey: 'sk-test' });
    expect((await c.studio.musicRoom.wait(ID, { intervalMs: 1 })).error).toBe('gate_expired');
    stub([room()]);
    await expect(c.studio.musicRoom.wait(ID, { intervalMs: 5, timeoutMs: 1 })).rejects.toThrow(
      /did not finish/,
    );
  });
});
