import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: String(init.method ?? 'GET') });
      return replies.shift()!;
    }),
  );
  return calls;
}

const ID = '3f0c9a7e-1b2d-4c5e-8f90-a1b2c3d4e5f6';
const CID = '7a1b2c3d-0000-4000-8000-000000000031';
const exp = (over: Record<string, unknown> = {}) => ({
  id: ID,
  object: 'studio.export',
  status: 'queued',
  creative_id: CID,
  seq: 7,
  format: 'story',
  fps: 30,
  filename: 'launch-teaser-story.fcpxml.zip',
  url: null,
  expires_at: null,
  bytes: null,
  rendered_seconds: null,
  cost_micro_usd: null,
  warnings: [],
  error: null,
  created_at: '2026-10-14T09:58:00Z',
  ...over,
});

describe('exports', () => {
  it('creatives.exportFcpxml sends format + seq as query and returns the queued export', async () => {
    const calls = stub([json(exp(), 202)]);
    const e = await mk().creatives.exportFcpxml(CID, { format: 'story', seq: 7 });
    expect(e.status).toBe('queued');
    expect(calls).toEqual([
      {
        method: 'GET',
        url: `https://ai.codai.ro/v1/studio/creatives/${CID}/export.fcpxml?format=story&seq=7`,
      },
    ]);
  });

  it('exportFcpxml without options sends no query', async () => {
    const calls = stub([json(exp(), 202)]);
    await mk().creatives.exportFcpxml(CID);
    expect(calls[0]!.url).toBe(`https://ai.codai.ro/v1/studio/creatives/${CID}/export.fcpxml`);
  });

  it('creatives.exportLottie sends format / seq / container and returns the ready export', async () => {
    const ready = exp({
      kind: 'lottie',
      container: 'dotlottie',
      status: 'succeeded',
      filename: 'launch-teaser-all.lottie',
      url: 'https://storage.example/x.lottie',
      cost_micro_usd: '0',
      rendered_seconds: 0,
      warnings: ['video node v1 is not exported'],
    });
    const calls = stub([json(ready), json(ready)]);
    const e = await mk().creatives.exportLottie(CID, {
      formats: 'all',
      seq: 7,
      container: 'dotlottie',
    });
    expect(e.kind).toBe('lottie');
    expect(e.container).toBe('dotlottie');
    expect(e.status).toBe('succeeded');
    await mk().creatives.exportLottie(CID);
    expect(calls).toEqual([
      {
        method: 'GET',
        url: `https://ai.codai.ro/v1/studio/creatives/${CID}/export.lottie?formats=all&seq=7&container=dotlottie`,
      },
      { method: 'GET', url: `https://ai.codai.ro/v1/studio/creatives/${CID}/export.lottie` },
    ]);
  });

  it('creatives.downloadLottie sends download=1 and returns bytes, filename and content type', async () => {
    const body = JSON.stringify({ v: '5.12.2', meta: { ai_generated: true } });
    const calls = stub([
      new Response(body, {
        headers: {
          'content-type': 'application/json',
          'content-disposition': 'attachment; filename="launch-teaser-story.lottie.json"',
        },
      }),
    ]);
    const f = await mk().creatives.downloadLottie(CID, { format: 'story' });
    expect(new TextDecoder().decode(f.bytes)).toBe(body);
    expect(f.filename).toBe('launch-teaser-story.lottie.json');
    expect(f.contentType).toBe('application/json');
    expect(calls[0]!.url).toBe(
      `https://ai.codai.ro/v1/studio/creatives/${CID}/export.lottie?format=story&download=1`,
    );
  });

  it('retrieve hits /v1/studio/exports/{id}', async () => {
    const calls = stub([json(exp({ status: 'running' }))]);
    expect((await mk().exports.retrieve(ID)).status).toBe('running');
    expect(calls[0]!.url).toBe(`https://ai.codai.ro/v1/studio/exports/${ID}`);
  });

  it('wait polls until succeeded and resolves the final export', async () => {
    const done = exp({
      status: 'succeeded',
      url: 'https://storage.example/x.zip',
      expires_at: '2026-10-14T11:00:00Z',
      bytes: 1024,
      rendered_seconds: 6,
      cost_micro_usd: 60000,
    });
    const calls = stub([json(exp()), json(exp({ status: 'running' })), json(done)]);
    const e = await mk().exports.wait(ID, { intervalMs: 1 });
    expect(e.status).toBe('succeeded');
    expect(e.url).toBe('https://storage.example/x.zip');
    expect(calls).toHaveLength(3);
  });

  it('wait resolves a failed export (does not throw)', async () => {
    stub([json(exp({ status: 'failed', error: { code: 'timeout', message: 'took too long' } }))]);
    const e = await mk().exports.wait(ID, { intervalMs: 1 });
    expect(e.status).toBe('failed');
    expect(e.error?.code).toBe('timeout');
  });

  it('wait throws on timeout', async () => {
    stub([json(exp({ status: 'running' })), json(exp({ status: 'running' }))]);
    await expect(mk().exports.wait(ID, { intervalMs: 50, timeoutMs: 10 })).rejects.toThrow(
      /did not finish within 10 ms/,
    );
  });

  it('wait stops when the signal aborts', async () => {
    stub([json(exp({ status: 'running' })), json(exp({ status: 'running' }))]);
    const ac = new AbortController();
    const p = mk().exports.wait(ID, { intervalMs: 10_000, signal: ac.signal });
    setTimeout(() => ac.abort(new Error('stop')), 5);
    await expect(p).rejects.toThrow('stop');
  });

  it('surfaces unsupported_kind as a CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'only video creatives',
            type: 'invalid_request_error',
            code: 'unsupported_kind',
          },
        },
        400,
      ),
    ]);
    const err = await mk()
      .creatives.exportFcpxml(CID)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).code).toBe('unsupported_kind');
  });
});
