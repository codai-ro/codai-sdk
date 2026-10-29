import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';
import { isMediaOpJob } from './media-ops';

const BASE = 'https://ai.codai.ro/v1/studio/media-ops';
const ASSET = '3f2b8c1e-0000-4000-8000-000000000001';
const JOB = '6d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6';
const job = (o: Record<string, unknown> = {}) => ({
  object: 'media_op.job',
  id: JOB,
  op: 'audio.separate_stems',
  status: 'pending',
  parent_asset_id: ASSET,
  outputs: [],
  analysis: null,
  error: null,
  cost_micro_usd: 0,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
  ...o,
});

function stub(replies: Array<{ status?: number; body: unknown }>) {
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
      const r = replies[Math.min(i++, replies.length - 1)]!;
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('mediaOps (AR-02)', () => {
  it('list and quote hit the catalogue and the quote route', async () => {
    const calls = stub([
      {
        body: {
          object: 'list',
          quote_basis: 'x',
          data: [{ id: 'image.upscale', available: true }],
        },
      },
      {
        body: {
          object: 'media_op.quote',
          op: 'image.upscale',
          mode: 'sync',
          quote_micro_usd: 2000,
          quote_micro_eur: 2236,
        },
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    expect((await c.mediaOps.list()).data[0]!.id).toBe('image.upscale');
    expect(
      (await c.mediaOps.quote('image.upscale', { assetIds: [ASSET], params: { scale: 2 } }))
        .quote_micro_eur,
    ).toBe(2236);
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', BASE],
      ['POST', `${BASE}/image.upscale/quote`],
    ]);
    expect(calls[1]!.body).toEqual({ asset_ids: [ASSET], params: { scale: 2 } });
  });

  it('run sends asset_ids + params with the Idempotency-Key; a sync op returns the result', async () => {
    const calls = stub([
      {
        body: {
          object: 'media_op.result',
          op: 'image.remove_background',
          status: 'ready',
          outputs: [{ asset_id: 'a2' }],
          analysis: null,
          cost_micro_usd: 1100,
        },
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const r = await c.mediaOps.run(
      'image.remove_background',
      { assetIds: [ASSET] },
      { idempotencyKey: 'k1' },
    );
    expect(isMediaOpJob(r)).toBe(false);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/image.remove_background`,
      body: { asset_ids: [ASSET], params: {} },
    });
    expect(calls[0]!.headers['idempotency-key']).toBe('k1');
  });

  it('an async op returns a 202 job; runAndWait polls job until ready', async () => {
    const calls = stub([
      { status: 202, body: job() },
      { body: job() },
      {
        body: job({
          status: 'ready',
          outputs: [{ asset_id: 'v' }, { asset_id: 'd' }],
          cost_micro_usd: 9000,
        }),
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test' });
    const out = await c.mediaOps.runAndWait(
      'audio.separate_stems',
      { assetIds: [ASSET], params: { stems: 4 } },
      { intervalMs: 1 },
    );
    expect(out).toMatchObject({ object: 'media_op.job', status: 'ready', cost_micro_usd: 9000 });
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', `${BASE}/audio.separate_stems`],
      ['GET', `${BASE}/jobs/${JOB}`],
      ['GET', `${BASE}/jobs/${JOB}`],
    ]);
  });

  it('wait resolves a failed job and gives up after timeoutMs', async () => {
    stub([{ body: job({ status: 'failed', error: 'timeout' }) }]);
    const c = new Codai({ apiKey: 'sk-test' });
    expect((await c.mediaOps.wait(JOB, { intervalMs: 1 })).error).toBe('timeout');
    stub([{ body: job() }]);
    await expect(c.mediaOps.wait(JOB, { intervalMs: 5, timeoutMs: 1 })).rejects.toThrow(
      /did not finish/,
    );
  });

  it('503 media_ops_unavailable surfaces as an error', async () => {
    stub([
      {
        status: 503,
        body: {
          error: {
            message: 'Media operations are not configured on this gateway.',
            type: 'server_error',
            code: 'media_ops_unavailable',
          },
        },
      },
    ]);
    const c = new Codai({ apiKey: 'sk-test', maxRetries: 0 });
    await expect(c.mediaOps.run('audio.master', { assetIds: [ASSET] })).rejects.toThrow(
      /not configured/,
    );
  });
});
