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

const ID = '7a1b2c3d-0000-4000-8000-000000000030';
const BASE = 'https://ai.codai.ro/v1/studio/creatives';
const creative = {
  id: ID,
  object: 'studio.creative',
  kind: 'video',
  title: 'Teaser — ședință',
  head_seq: 1,
  version: { seq: 1, doc_hash: 'a'.repeat(64) },
  doc: { schemaVersion: 1, kind: 'video', title: 'Teaser — ședință' },
};

describe('creatives', () => {
  it('create / list / retrieve / outline hit the right paths', async () => {
    const calls = stub([
      json(creative, 201),
      json({ object: 'list', data: [], next_before: null }),
      json({ ...creative, seq: 1, doc_hash: 'x', assets: {} }),
      json({ head_seq: 1, outline: 'video "x"', formats: [], vars: {} }),
    ]);
    const c = mk();
    expect((await c.creatives.create({ kind: 'video', title: 'Teaser — ședință' })).id).toBe(ID);
    await c.creatives.list({ kind: 'video', limit: 5 });
    await c.creatives.retrieve(ID, { seq: 1 });
    await c.creatives.outline(ID);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', BASE],
      ['GET', `${BASE}?kind=video&limit=5`],
      ['GET', `${BASE}/${ID}?seq=1`],
      ['GET', `${BASE}/${ID}/outline`],
    ]);
    expect(calls[0]!.body).toEqual({ kind: 'video', title: 'Teaser — ședință' });
  });

  it('edit sends snake_case and only the fields given', async () => {
    const calls = stub([
      json({ seq: 2, doc_hash: 'b', changed: ['title'], warnings: [], rebased: false }),
    ]);
    const r = await mk().creatives.edit(ID, {
      baseSeq: 1,
      ops: [{ op: 'setProps', target: 'title', props: { size: 120 } }],
      intent: 'bigger',
    });
    expect(r.seq).toBe(2);
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${BASE}/${ID}/ops` });
    expect(calls[0]!.body).toEqual({
      base_seq: 1,
      ops: [{ op: 'setProps', target: 'title', props: { size: 120 } }],
      intent: 'bigger',
    });
  });

  it('a 409 stale surfaces as CodaiError with status and code', async () => {
    stub([
      json(
        {
          error: {
            message: 'stale',
            type: 'invalid_request_error',
            code: 'stale',
            head_seq: 3,
            conflicts: [],
          },
        },
        409,
      ),
    ]);
    const err = await mk()
      .creatives.edit(ID, { baseSeq: 1, ops: [{ op: 'setMeta', title: 'x' }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(409);
  });

  it('find / subtree / versions / revert / fork / lint / compiled / render / frame / delete', async () => {
    const calls = stub([
      json({ head_seq: 1, ids: ['title'] }),
      json({ head_seq: 1, scenes: [], nodes: [], missing: [] }),
      json({ object: 'list', data: [], next_before_seq: null }),
      json({
        id: ID,
        head_seq: 3,
        seq: 3,
        author: 'user',
        intent: 'revert to 1',
        created_at: 'x',
        doc_hash: 'c',
      }),
      json(creative, 201),
      json({ head_seq: 1, issues: [] }),
      json({
        head_seq: 1,
        format: '16x9',
        width: 1920,
        height: 1080,
        duration_ms: 5000,
        html: '<html>',
      }),
      json(
        { render_id: 'r1', id: 'r1', object: 'studio.render', status: 'queued', cached: false },
        202,
      ),
      json(
        { error: { message: 'no', type: 'invalid_request_error', code: 'too_many_frame_jobs' } },
        429,
      ),
      json({ id: ID, object: 'studio.creative', deleted: true }),
    ]);
    const c = mk().creatives;
    expect((await c.find(ID, 'hello')).ids).toEqual(['title']);
    await c.subtree(ID, { sceneId: 'intro' });
    await c.versions(ID, { beforeSeq: 9, limit: 2 });
    await c.revert(ID, 1);
    await c.fork(ID, { seq: 2 });
    await c.lint(ID);
    expect((await c.compiled(ID, { format: '16x9', scene: 'intro' })).html).toBe('<html>');
    expect((await c.render(ID, { quality: 'draft' })).render_id).toBe('r1');
    await expect(c.frame(ID, { t_ms: [0] })).rejects.toBeInstanceOf(CodaiError);
    expect((await c.delete(ID)).deleted).toBe(true);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/find`],
      ['POST', `${BASE}/${ID}/subtree`],
      ['GET', `${BASE}/${ID}/versions?before_seq=9&limit=2`],
      ['POST', `${BASE}/${ID}/revert`],
      ['POST', `${BASE}/${ID}/fork`],
      ['POST', `${BASE}/${ID}/lint`],
      ['GET', `${BASE}/${ID}/compiled?format=16x9&scene=intro`],
      ['POST', `${BASE}/${ID}/render`],
      ['POST', `${BASE}/${ID}/frame`],
      ['DELETE', `${BASE}/${ID}`],
    ]);
    expect(calls[0]!.body).toEqual({ query: 'hello' });
    expect(calls[3]!.body).toEqual({ seq: 1 });
  });

  it('frame returns frames (200) or a job (202) and frameJob polls it', async () => {
    const JOB = '5e6f7a8b-0000-4000-8000-000000000040';
    const frames = {
      object: 'studio.creative.frames',
      frame_job_id: JOB,
      status: 'succeeded',
      frames: [{ t_ms: 1500, url: 'https://x/f.png', width: 1920, height: 1080, cached: false }],
      head_seq: 3,
      billed_micro_usd: '0',
    };
    const calls = stub([
      json({ ...frames, frame_job_id: null, frames: [{ ...frames.frames[0], cached: true }] }),
      json(
        { object: 'studio.creative.frame_job', frame_job_id: JOB, status: 'running', head_seq: 3 },
        202,
      ),
      json(
        { object: 'studio.creative.frame_job', frame_job_id: JOB, status: 'running', head_seq: 3 },
        202,
      ),
      json(frames),
    ]);
    const c = mk().creatives;
    const hit = await c.frame(ID, { t_ms: [1500] });
    expect(hit.status).toBe('succeeded');
    if (hit.status === 'succeeded') expect(hit.frames[0]!.cached).toBe(true);
    const job = await c.frame(ID, { t_ms: [0, 1500], exact: true, format: '16x9', version: 3 });
    expect(job.status).toBe('running');
    expect((await c.frameJob(ID, JOB)).status).toBe('running');
    const done = await c.frameJob(ID, JOB);
    if (done.status !== 'succeeded') throw new Error('expected frames');
    expect(done.frames.map((f) => f.t_ms)).toEqual([1500]);
    expect(done.billed_micro_usd).toBe('0');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/frame`],
      ['POST', `${BASE}/${ID}/frame`],
      ['GET', `${BASE}/${ID}/frames/${JOB}`],
      ['GET', `${BASE}/${ID}/frames/${JOB}`],
    ]);
    expect(calls[1]!.body).toEqual({ t_ms: [0, 1500], exact: true, format: '16x9', version: 3 });
  });

  it('comment posts the frame comment and returns the applied edit', async () => {
    const calls = stub([
      json({ head_seq: 4, applied_ops: 1, summary: 'Bigger.', version: { seq: 4, doc_hash: 'h' } }),
      json(
        {
          error: {
            message: 'no',
            type: 'invalid_request_error',
            code: 'no_edit',
            text: 'Looks good.',
            reason: 'no_tool_call',
          },
        },
        422,
      ),
    ]);
    const c = mk().creatives;
    const r = await c.comment(ID, { node_id: 'title', t_ms: 1200, comment: 'bigger', base_seq: 3 });
    expect(r).toMatchObject({ head_seq: 4, applied_ops: 1, version: { seq: 4 } });
    await expect(c.comment(ID, { t_ms: 0, comment: 'nice', base_seq: 4 })).rejects.toBeInstanceOf(
      CodaiError,
    );
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/comments`],
      ['POST', `${BASE}/${ID}/comments`],
    ]);
    expect(calls[0]!.body).toEqual({
      node_id: 'title',
      t_ms: 1200,
      comment: 'bigger',
      base_seq: 3,
    });
  });

  it('variants / listVariants / pickVariant hit the variants routes', async () => {
    const calls = stub([
      json({
        object: 'studio.creative.variants',
        group_id: 'g1',
        base_seq: 3,
        variants: [
          {
            creative_id: 'v1',
            label: 'Red',
            rationale: 'r',
            applied_ops: 1,
            head_seq: 2,
            render_id: 'r1',
          },
        ],
      }),
      json({ object: 'studio.creative.variants', group_id: 'g1', base_seq: 3, variants: [] }),
      json({ head_seq: 4, version: { seq: 4, doc_hash: 'h' }, winner: 'v1', rebased: false }),
    ]);
    const c = mk().creatives;
    const v = await c.variants(ID, { base_seq: 3, count: 2, focus: ['hook', 'cta'] });
    expect(v.variants[0]).toMatchObject({ creative_id: 'v1', render_id: 'r1' });
    expect((await c.listVariants(ID)).group_id).toBe('g1');
    expect(await c.pickVariant(ID, 'v/1', { base_seq: 3 })).toMatchObject({
      head_seq: 4,
      winner: 'v1',
    });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/${ID}/variants`],
      ['GET', `${BASE}/${ID}/variants`],
      ['POST', `${BASE}/${ID}/variants/v%2F1/pick`],
    ]);
    expect(calls[0]!.body).toEqual({ base_seq: 3, count: 2, focus: ['hook', 'cta'] });
    expect(calls[2]!.body).toEqual({ base_seq: 3 });
  });

  it('render sends ai_label in the body and types the resolved label', async () => {
    const calls = stub([
      json(
        {
          render_id: 'r2',
          id: 'r2',
          object: 'studio.render',
          status: 'queued',
          cached: false,
          creative_id: ID,
          seq: 3,
          ai_label: 'corner',
        },
        202,
      ),
    ]);
    const r = await mk().creatives.render(ID, { quality: 'final', ai_label: 'corner' });
    expect(calls[0]!.body).toEqual({ quality: 'final', ai_label: 'corner' });
    expect(r.ai_label).toBe('corner');
  });

  it('render returns a cached render with 200 and cached: true', async () => {
    stub([
      json({
        render_id: 'r1',
        id: 'r1',
        object: 'studio.render',
        status: 'succeeded',
        cached: true,
        creative_id: ID,
        seq: 3,
        data: [],
      }),
    ]);
    const r = await mk().creatives.render(ID, { quality: 'draft' });
    expect(r.cached).toBe(true);
    expect(r.status).toBe('succeeded');
  });
});
