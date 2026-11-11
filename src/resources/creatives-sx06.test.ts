import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const CID = '7a1b2c3d-0000-4000-8000-000000000061';
const BASE = `https://ai.codai.ro/v1/studio/creatives/${CID}`;

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
function stub(replies: Array<{ status?: number; body: unknown }>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: String(url),
        method: String(init.method ?? 'GET'),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      const r = replies.shift()!;
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

const branch = {
  object: 'studio.creative.branch',
  name: 'shorter-cut',
  head_seq: 6,
  base_branch: 'main',
  base_seq: 5,
  created_at: '2026-11-06T10:00:00.000Z',
  updated_at: '2026-11-06T10:00:00.000Z',
};

describe('creatives — SX-06 named branches', () => {
  it('branches lists, createBranch posts the body, deleteBranch encodes the name', async () => {
    const calls = stub([
      { body: { object: 'list', data: [{ ...branch, name: 'main', base_branch: null, base_seq: null }, branch] } },
      { status: 201, body: branch },
      { body: { object: 'studio.creative.branch', name: 'shorter-cut', deleted: true } },
    ]);
    const c = mk();
    const list = await c.creatives.branches(CID);
    expect(list.data.map((b) => b.name)).toEqual(['main', 'shorter-cut']);
    const created = await c.creatives.createBranch(CID, { name: 'shorter-cut', from: 'main', seq: 5 });
    expect(created.base_seq).toBe(5);
    const del = await c.creatives.deleteBranch(CID, 'shorter-cut');
    expect(del.deleted).toBe(true);
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      `GET ${BASE}/branches`,
      `POST ${BASE}/branches`,
      `DELETE ${BASE}/branches/shorter-cut`,
    ]);
    expect(calls[1]!.body).toEqual({ name: 'shorter-cut', from: 'main', seq: 5 });
  });

  it('branch reaches retrieve / versions as a query and edit / revert / fork as a body field', async () => {
    const calls = stub([
      { body: { id: CID, branch: 'shorter-cut' } },
      { body: { object: 'list', branch: 'shorter-cut', data: [], next_before_seq: null } },
      { body: { seq: 7, branch: 'shorter-cut', doc_hash: 'h', changed: [], warnings: [], rebased: false } },
      { body: { id: CID, head_seq: 8, seq: 8, branch: 'shorter-cut' } },
      { body: { id: CID, head_seq: 9, seq: 9 } },
      { status: 201, body: { id: CID } },
    ]);
    const c = mk();
    await c.creatives.retrieve(CID, { branch: 'shorter-cut' });
    await c.creatives.versions(CID, { branch: 'shorter-cut', limit: 10 });
    const ops = await c.creatives.edit(CID, { baseSeq: 6, ops: [], branch: 'shorter-cut' });
    expect(ops.branch).toBe('shorter-cut');
    await c.creatives.revert(CID, 5, { branch: 'shorter-cut' });
    await c.creatives.revert(CID, 4); // backward compatible: no branch field sent
    await c.creatives.fork(CID, { seq: 6, branch: 'shorter-cut' });
    expect(calls[0]!.url).toBe(`${BASE}?branch=shorter-cut`);
    expect(calls[1]!.url).toBe(`${BASE}/versions?limit=10&branch=shorter-cut`);
    expect(calls[2]!.body).toEqual({ base_seq: 6, ops: [], branch: 'shorter-cut' });
    expect(calls[3]!.body).toEqual({ seq: 5, branch: 'shorter-cut' });
    expect(calls[4]!.body).toEqual({ seq: 4 });
    expect(calls[5]!.body).toEqual({ seq: 6, branch: 'shorter-cut' });
  });
});

describe('creatives — SX-06 filmstrip, compose frames and the job queue', () => {
  it('filmstrip posts clip_ids with an Idempotency-Key; frame sends engine', async () => {
    const calls = stub([
      {
        body: {
          object: 'studio.creative.filmstrip',
          frame_job_id: null,
          status: 'succeeded',
          frames: [{ t_ms: 1500, url: 'https://x/f.png', width: 320, height: 180, cached: true, clip_id: 'clip-a' }],
          head_seq: 3,
          billed_micro_usd: '0',
        },
      },
      { status: 202, body: { object: 'studio.creative.frame_job', frame_job_id: 'j', status: 'running', head_seq: 3 } },
    ]);
    const c = mk();
    const fs = await c.creatives.filmstrip(
      CID,
      { clip_ids: ['clip-a'], branch: 'shorter-cut' },
      { idempotencyKey: 'k1' },
    );
    expect(fs.frames?.[0]?.clip_id).toBe('clip-a');
    await c.creatives.frame(CID, { t_ms: [0], engine: 'compose' });
    expect(calls[0]!.url).toBe(`${BASE}/filmstrip`);
    expect(calls[0]!.body).toEqual({ clip_ids: ['clip-a'], branch: 'shorter-cut' });
    expect(calls[0]!.headers['idempotency-key']).toBe('k1');
    expect(calls[1]!.body).toEqual({ t_ms: [0], engine: 'compose' });
  });

  it('jobs maps creativeId to creative_id', async () => {
    const calls = stub([
      {
        body: {
          object: 'list',
          data: [
            {
              id: 'a',
              kind: 'render',
              status: 'running',
              progress: 0.4,
              stage: 'encode',
              title: null,
              creative_id: CID,
              created_at: null,
              updated_at: null,
              eta_ms: 12000,
              error: null,
            },
          ],
        },
      },
    ]);
    const jobs = await mk().creatives.jobs({ creativeId: CID, limit: 5 });
    expect(jobs.data[0]?.kind).toBe('render');
    expect(calls[0]!.url).toBe(`https://ai.codai.ro/v1/studio/jobs?creative_id=${CID}&limit=5`);
  });
});
