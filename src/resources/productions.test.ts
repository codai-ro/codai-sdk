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

const cutProd = (o: Record<string, unknown> = {}) => ({
  id: ID,
  object: 'studio.production',
  status: 'running',
  phase: 'ingest',
  kind: 'cut',
  brief: 'Un montaj de test',
  language: 'ro',
  formats: ['9x16', '1x1', '16x9'],
  default_format: '9x16',
  title: null,
  creative_id: null,
  render_id: null,
  sources: ['a1'],
  ingest: { total: 1, done: 0, failed: 0 },
  stats: null,
  decisions_count: 0,
  warnings: [],
  error: null,
  budget_micro_usd: '3000000',
  spent_micro_usd: '0',
  ingest_quote_micro_usd: '12000',
  created_at: '2026-11-07T00:00:00Z',
  ...o,
});

describe('productions kind cut (SX-08)', () => {
  const ASSET = '0b7d5a2e-1c3f-4e8a-9b6d-2f4e6a8c0d1e';

  it('create posts the cut body with the Idempotency-Key and run waits with retrieveCut', async () => {
    const calls = stub([
      cutProd(),
      cutProd({ phase: 'render', creative_id: 'c1' }),
      cutProd({ status: 'succeeded', phase: 'ready', creative_id: 'c1', render_id: 'r1' }),
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const body = {
      kind: 'cut' as const,
      brief: 'Un montaj de test pentru vlog',
      asset_ids: [ASSET],
      pacing: 'punchy' as const,
      captions: false as const,
    };
    const out = await c.productions.run(body, { idempotencyKey: 'k2', intervalMs: 1 });
    expect(out).toMatchObject({ kind: 'cut', status: 'succeeded', render_id: 'r1' });
    expect(out.ingest_quote_micro_usd).toBe('12000');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', BASE],
      ['GET', `${BASE}/${ID}`],
      ['GET', `${BASE}/${ID}`],
    ]);
    expect(calls[0]!.body).toEqual(body);
    expect(calls[0]!.headers['idempotency-key']).toBe('k2');
  });

  it('cut reads the decisions and reviseCut posts the overrides', async () => {
    const decisions = {
      object: 'studio.production.cut',
      production_id: ID,
      creative_id: 'c1',
      branch: 'main',
      seq: 2,
      decisions: [
        {
          id: 'filler:f1',
          kind: 'filler',
          label: 'ăă',
          reason: 'hesitation',
          enabled: true,
          at_ms: 1200,
          cluster: null,
        },
      ],
      clusters: [],
      script_gaps: [],
      stats: {
        source_ms: 60000,
        output_ms: 42000,
        fillers_removed: 1,
        silence_removed_ms: 3000,
        retakes_removed: 0,
        broll: { own: 0, stock: 1, generated: 0 },
        zooms: 2,
      },
      overrides: {},
    };
    const revision = {
      creative_id: 'c1',
      seq: 3,
      branch: 'cut-1',
      decisions: decisions.decisions,
      stats: decisions.stats,
      warnings: [],
    };
    const calls = stub([decisions, revision]);
    const c = new Codai({ apiKey: 'sk-test' });
    expect((await c.productions.cut('a/b')).decisions[0]!.id).toBe('filler:f1');
    const r = await c.productions.reviseCut(ID, {
      disabled: ['filler:f1', '+zoom:3'],
      takes: { c1: 's4' },
      pacing: 'calm',
      base_seq: 2,
    });
    expect(r).toMatchObject({ seq: 3, branch: 'cut-1' });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', `${BASE}/a%2Fb/cut`],
      ['POST', `${BASE}/${ID}/cut/revise`],
    ]);
    expect(calls[1]!.body).toEqual({
      disabled: ['filler:f1', '+zoom:3'],
      takes: { c1: 's4' },
      pacing: 'calm',
      base_seq: 2,
    });
  });
});
