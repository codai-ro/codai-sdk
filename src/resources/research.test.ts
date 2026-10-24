import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown; headers: Record<string, string> };

function stub(replies: Array<{ body: unknown; status?: number }>): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({
        url,
        method: String(init.method ?? 'GET'),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      const r = replies.shift()!;
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });
const ID = '3f0c9a7e-1b2d-4c5e-8f90-a1b2c3d4e5f6';
const queued = { id: ID, status: 'queued', created_at: '2026-10-18T10:00:00Z' };
const done = {
  id: ID,
  status: 'done',
  created_at: '2026-10-18T10:00:00Z',
  finished_at: '2026-10-18T10:01:10Z',
  report: 'Answer [S1].',
  sources: [{ id: 'S1', title: 'BNR', url: 'https://www.bnr.ro/' }],
  searches: 4,
  pages_read: 9,
};

describe('research', () => {
  it('create posts the body and returns the queued job from a 202', async () => {
    const seen = stub([{ body: queued, status: 202 }]);
    const job = await mk().research.create({ question: 'curs BNR', max_sources: 5 });
    expect(job.status).toBe('queued');
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.url).toBe('https://ai.codai.ro/v1/research');
    expect(seen[0]!.body).toEqual({ question: 'curs BNR', max_sources: 5 });
    expect(seen[0]!.headers['Idempotency-Key']).toBeUndefined();
  });

  it('create sends Idempotency-Key only when given', async () => {
    const seen = stub([{ body: queued, status: 202 }]);
    await mk().research.create({ question: 'q' }, { idempotencyKey: 'job-1' });
    expect(seen[0]!.headers['Idempotency-Key']).toBe('job-1');
  });

  it('retrieve GETs the job by id', async () => {
    const seen = stub([{ body: done }]);
    const job = await mk().research.retrieve(ID);
    expect(job.report).toBe('Answer [S1].');
    expect(seen[0]!.method).toBe('GET');
    expect(seen[0]!.url).toBe(`https://ai.codai.ro/v1/research/${ID}`);
  });

  it('wait polls until done', async () => {
    const seen = stub([
      { body: { ...queued, status: 'running' } },
      { body: { ...queued, status: 'running' } },
      { body: done },
    ]);
    const job = await mk().research.wait(ID, { intervalMs: 1 });
    expect(job.status).toBe('done');
    expect(seen).toHaveLength(3);
  });

  it('wait resolves with a failed job instead of throwing', async () => {
    stub([{ body: { ...queued, status: 'failed', error: { message: 'boom' } } }]);
    const job = await mk().research.wait(ID, { intervalMs: 1 });
    expect(job.error?.message).toBe('boom');
  });

  it('wait throws after timeoutMs', async () => {
    stub([{ body: { ...queued, status: 'running' } }]);
    await expect(mk().research.wait(ID, { intervalMs: 50, timeoutMs: 10 })).rejects.toThrow(
      /did not finish/,
    );
  });

  it('run skips polling when create already finished', async () => {
    const seen = stub([{ body: done }]);
    const job = await mk().research.run({ question: 'q', wait_s: 30 });
    expect(job.status).toBe('done');
    expect(seen).toHaveLength(1);
  });

  it('run polls a 202 job to completion', async () => {
    const seen = stub([{ body: queued, status: 202 }, { body: done }]);
    const job = await mk().research.run({ question: 'q' }, { intervalMs: 1 });
    expect(job.sources?.[0]?.id).toBe('S1');
    expect(seen.map((s) => s.method)).toEqual(['POST', 'GET']);
  });
});

describe('tools web filters', () => {
  it('search forwards domain, date and content filters verbatim', async () => {
    const seen = stub([
      {
        body: {
          results: [],
          provider: 'codai',
          took_ms: 1,
          cached: false,
          coverage: 0,
          sources_tried: [],
          degraded: [],
          intent: 'general',
        },
      },
    ]);
    await mk().tools.search({
      query: 'react compiler',
      include_domains: ['react.dev'],
      exclude_domains: ['medium.com'],
      published_after: '2026-01-01',
      freshness: 'year',
      content_chars: 500,
    });
    expect(seen[0]!.url).toBe('https://ai.codai.ro/v1/tools/search');
    expect(seen[0]!.body).toEqual({
      query: 'react compiler',
      include_domains: ['react.dev'],
      exclude_domains: ['medium.com'],
      published_after: '2026-01-01',
      freshness: 'year',
      content_chars: 500,
    });
  });
});
