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

  it('create sends quality and music; the production answers with both', async () => {
    const calls = stub([prod({ quality: 'draft', music: false })]);
    const c = new Codai({ apiKey: 'sk-test' });
    const p = await c.productions.create({
      brief: 'Un promo de test',
      narration: false,
      quality: 'draft',
      music: false,
    });
    expect(calls[0]!.body).toEqual({
      brief: 'Un promo de test',
      narration: false,
      quality: 'draft',
      music: false,
    });
    const quality: 'draft' | 'final' | undefined = p.quality;
    const music: boolean | undefined = p.music;
    expect([quality, music]).toEqual(['draft', false]);
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
    // SX-43 prompt / story fields go through as typed body fields
    const calls2 = stub([
      {
        ...revision,
        prompt: {
          path: 'model',
          understood: [],
          explanation: 'ok',
          unmet: null,
          cost_micro_usd: 4200,
        },
      },
    ]);
    const r2 = await c.productions.reviseCut(ID, {
      prompt: 'only the pricing part',
      target_s: null,
      plan_delta: { keep_only: ['s2', 's5'], hook: null },
      default_format: '1x1',
      broll: false,
    });
    expect(r2.prompt?.path).toBe('model');
    expect(calls2[0]!.body).toEqual({
      prompt: 'only the pricing part',
      target_s: null,
      plan_delta: { keep_only: ['s2', 's5'], hook: null },
      default_format: '1x1',
      broll: false,
    });
  });

  it('restyleCut posts the style and retrieveRestyleJob polls the b-roll job (SX-44)', async () => {
    const job = {
      id: 'b0b0b0b0-1111-4222-8333-444455556666',
      object: 'studio.production',
      kind: 'cut_restyle',
      status: 'running',
      phase: 'broll',
      production_id: ID,
      creative_id: 'c1',
      style: 'builtin:fast-social',
      slots_total: 3,
      slots_done: 0,
      found: 0,
      seq: null,
      quote_micro_usd: '0',
      spent_micro_usd: '0',
      warnings: [],
      error: null,
      created_at: '2026-11-08T10:00:00Z',
    };
    const result = {
      creative_id: 'c1',
      seq: 4,
      branch: 'main',
      decisions: [],
      stats: { source_ms: 1, output_ms: 1 },
      warnings: [],
      style: 'builtin:fast-social',
      broll_slots_needed: 5,
      broll_job: job,
    };
    const calls = stub([result, { ...job, status: 'succeeded', phase: 'ready', seq: 5 }]);
    const c = new Codai({ apiKey: 'sk-test' });
    const r = await c.productions.restyleCut(ID, { style: 'fast-social', base_seq: 3 });
    expect(r).toMatchObject({ seq: 4, style: 'builtin:fast-social', broll_slots_needed: 5 });
    const done = await c.productions.retrieveRestyleJob(r.broll_job!.id);
    expect(done).toMatchObject({ status: 'succeeded', seq: 5 });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/cut/restyle`],
      ['GET', `${BASE}/${job.id}`],
    ]);
    expect(calls[0]!.body).toEqual({ style: 'fast-social', base_seq: 3 });
  });

  it('cutVariants / retrieveCutVariants / selectCutVariant (SX-42)', async () => {
    const score = {
      total: 81,
      hook: 90,
      flow: 75,
      value: 80,
      fit: 60,
      source: 'blend',
      reasons: { hook: 'h', flow: 'f', value: 'v', fit: 'fi' },
      weakest_axis: 'fit',
      fix_hint: 'make it 45 s',
    };
    const variants = {
      object: 'studio.production.cut_variants',
      production_id: ID,
      base_seq: 3,
      stale: false,
      judged: true,
      variants: [
        {
          id: 'v2',
          angle: 'strongest_hook',
          title: 'Hook first',
          why: 'opens on the question',
          plan_delta: { keep_only: ['s3', 's4'], hook: 's3' },
          output_ms: 42_000,
          sentences: 2,
          score,
        },
      ],
      current: { output_ms: 61_000, score: { ...score, total: 55 } },
      cost_micro_usd: 4100,
      warnings: [],
      created_at: '2026-11-08T10:00:00Z',
    };
    const selected = {
      creative_id: 'c1',
      seq: 4,
      branch: 'main',
      decisions: [],
      stats: {},
      warnings: [],
      variant: 'v2',
      score,
    };
    const calls = stub([variants, variants, selected]);
    const c = new Codai({ apiKey: 'sk-test' });
    const v = await c.productions.cutVariants(ID, { n: 2, judge: false });
    expect(v.variants[0]!.score.fix_hint).toBe('make it 45 s');
    expect((await c.productions.retrieveCutVariants(ID)).judged).toBe(true);
    const s = await c.productions.selectCutVariant(ID, { variant: 'v2', base_seq: 3 });
    expect(s).toMatchObject({ seq: 4, variant: 'v2' });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/cut/variants`],
      ['GET', `${BASE}/${ID}/cut/variants`],
      ['POST', `${BASE}/${ID}/cut/select`],
    ]);
    expect(calls[0]!.body).toEqual({ n: 2, judge: false });
    expect(calls[2]!.body).toEqual({ variant: 'v2', base_seq: 3 });
  });

  it('cut hooks / lengths / attention / topics / renders / podcast / clean job (SX-46..51)', async () => {
    const hooks = {
      object: 'studio.production.cut_hooks',
      production_id: ID,
      base_seq: 3,
      stale: false,
      judged: true,
      hooks: [
        {
          id: 'h1',
          sentence: 's7',
          text: 'Why pay twice?',
          duration_ms: 1800,
          score: 88,
          reasons: ['question'],
          why: 'a question',
          current: false,
        },
      ],
      cost_micro_usd: 4000,
      warnings: [],
      created_at: '2026-11-09T10:00:00Z',
    };
    const lengths = {
      object: 'studio.production.cut_lengths',
      production_id: ID,
      seq: 3,
      current: { output_ms: 61_000, preset: null, over_caps: [] },
      presets: [
        {
          id: '30',
          target_s: 30,
          output_ms: 29_500,
          sentences: 6,
          score: 70,
          fits_material: false,
          over_caps: [],
          trimmed: true,
        },
      ],
    };
    const attention = {
      object: 'studio.production.cut_attention',
      production_id: ID,
      seq: 3,
      heuristic: true,
      step_s: 1,
      points: [0.8, 0.3],
      signals: { speech: [1, 0], energy: [1, 0.2], visual: [0.5, 0] },
      mean: 0.55,
      dips: [
        {
          start_s: 1,
          end_s: 3.5,
          reason: 'silence',
          sentence: null,
          fix: { action: 'faster_pacing', revise: { pacing: 'punchy' } },
        },
      ],
    };
    const topics = {
      object: 'studio.production.cut_topics',
      production_id: ID,
      topics: [
        {
          id: 't1',
          label: 'Pricing',
          kind: 'pricing',
          sentences: ['s3'],
          start_ms: 0,
          end_ms: 9000,
        },
      ],
      cost_micro_usd: 5000,
      warnings: [],
      created_at: '2026-11-09T10:00:00Z',
    };
    const renders = {
      object: 'studio.production.cut_renders',
      production_id: ID,
      kind: 'lengths',
      quality: 'draft',
      quote_micro_usd: 450_000,
      renders: [{ id: '30', label: '30 s', creative_id: 'c2', render_id: 'r2', output_ms: 29_500 }],
    };
    const podcast = {
      id: 'e1',
      object: 'studio.export',
      kind: 'podcast',
      status: 'queued',
      files: ['episode.mp3', 'cover.jpg', 'notes.md'],
      spotify_upload_url: 'https://creators.spotify.com/pod/login',
      chapters: 4,
    };
    const clean = {
      id: 'j1',
      object: 'studio.production',
      kind: 'cut_clean',
      status: 'running',
      phase: 'clean',
      production_id: ID,
      creative_id: 'c1',
      sources: [],
      seq: null,
      warnings: [],
      error: null,
      created_at: '2026-11-09T10:00:00Z',
    };
    const calls = stub([hooks, hooks, lengths, attention, topics, topics, renders, podcast, clean]);
    const c = new Codai({ apiKey: 'sk-test' });
    const p = c.productions;
    expect((await p.cutHooks(ID, { n: 2, judge: true })).hooks[0]!.sentence).toBe('s7');
    expect((await p.retrieveCutHooks(ID)).judged).toBe(true);
    expect((await p.cutLengths(ID)).presets[0]!.target_s).toBe(30);
    expect((await p.cutAttention(ID)).dips[0]!.fix).toEqual({
      action: 'faster_pacing',
      revise: { pacing: 'punchy' },
    });
    expect((await p.cutTopics(ID, { refresh: false })).topics[0]!.label).toBe('Pricing');
    expect((await p.retrieveCutTopics(ID)).topics).toHaveLength(1);
    const r = await p.cutRenders(ID, { kind: 'lengths', ids: ['30'] }, { idempotencyKey: 'k1' });
    expect(r.renders[0]!.creative_id).toBe('c2');
    const e = await p.cutPodcast(ID, { notes: false, mp3: { channels: 1, bitrate_k: 128 } });
    expect(e).toMatchObject({ kind: 'podcast', chapters: 4 });
    expect(e.spotify_upload_url).toBe('https://creators.spotify.com/pod/login');
    expect((await p.retrieveCleanJob('j1')).kind).toBe('cut_clean');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/cut/hooks`],
      ['GET', `${BASE}/${ID}/cut/hooks`],
      ['GET', `${BASE}/${ID}/cut/lengths`],
      ['GET', `${BASE}/${ID}/cut/attention`],
      ['POST', `${BASE}/${ID}/cut/topics`],
      ['GET', `${BASE}/${ID}/cut/topics`],
      ['POST', `${BASE}/${ID}/cut/renders`],
      ['POST', `${BASE}/${ID}/cut/podcast`],
      ['GET', `${BASE}/j1`],
    ]);
    expect(calls[0]!.body).toEqual({ n: 2, judge: true });
    expect(calls[4]!.body).toEqual({ refresh: false });
    expect(calls[6]!.body).toEqual({ kind: 'lengths', ids: ['30'] });
    expect(calls[6]!.headers['idempotency-key']).toBe('k1');
    expect(calls[7]!.body).toEqual({ notes: false, mp3: { channels: 1, bitrate_k: 128 } });
  });

  it('reviseCut carries the wave-3 fields (hook, topics, drop, voice_cleanup)', async () => {
    const calls = stub([
      {
        creative_id: 'c1',
        seq: 5,
        branch: 'main',
        decisions: [],
        stats: {},
        warnings: [],
        voice_cleanup_job: 'j1',
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const rev = await c.productions.reviseCut(ID, {
      hook: 's7',
      topics: ['t1', 't3'],
      drop: ['s9'],
      voice_cleanup: true,
    });
    expect(rev.voice_cleanup_job).toBe('j1');
    expect(calls[0]!.body).toEqual({
      hook: 's7',
      topics: ['t1', 't3'],
      drop: ['s9'],
      voice_cleanup: true,
    });
  });
});
