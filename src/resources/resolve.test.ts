import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';
import { ResolveError, ResolveInsufficientFundsError, type ResolveJob } from './resolve';

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };

function stub(responses: Array<{ status: number; body: unknown }>) {
  const seen: Seen[] = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    seen.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body,
    });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { seen, fetchMock };
}

afterEach(() => {
  vi.useRealTimers();
});

const mk = (fetchMock: typeof fetch, extra: Partial<ConstructorParameters<typeof Codai>[0]> = {}) =>
  new Codai({ apiKey: 'codai_test', maxRetries: 0, fetch: fetchMock, ...extra });

const JOB_ID = '11111111-2222-4333-8444-555555555555';

function job(status: ResolveJob['status'], extra: Partial<ResolveJob> = {}): ResolveJob {
  return {
    id: JOB_ID,
    status,
    repo_url: 'https://github.com/o/r',
    tier: 't7',
    quote_micro_usd: 7_000_000,
    triage_reason: 'clear bug',
    decline_reason: null,
    fail_reason: null,
    cost_micro_usd: 0,
    attestation_id: null,
    attestation_url: null,
    created_at: '2026-09-27T00:00:00.000Z',
    completed_at: null,
    ...extra,
  };
}

describe('client.resolve', () => {
  it('targets https://resolve.codai.ro by default with bearer auth, not the gateway host', async () => {
    const { seen, fetchMock } = stub([
      {
        status: 201,
        body: {
          id: JOB_ID,
          status: 'quoted',
          tier: 't7',
          quote_micro_usd: 7_000_000,
          triage_reason: 'clear bug',
          free_tier_remaining: 0,
        },
      },
    ]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const r = await c.resolve.submit({
      repo_url: 'https://github.com/o/r',
      issue_url: 'https://github.com/o/r/issues/1',
      test_command: 'pytest -q',
    });
    expect(r.status).toBe('quoted');
    expect(seen[0]!.url).toBe('https://resolve.codai.ro/v1/resolve/jobs');
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.headers.Authorization).toBe('Bearer codai_test');
    expect(seen[0]!.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(seen[0]!.body as string)).toEqual({
      repo_url: 'https://github.com/o/r',
      issue_url: 'https://github.com/o/r/issues/1',
      test_command: 'pytest -q',
    });
  });

  it('honours resolveBaseUrl and returns a declined body as a value (200)', async () => {
    const { seen, fetchMock } = stub([
      { status: 200, body: { id: JOB_ID, status: 'declined', decline_reason: 'feature request' } },
    ]);
    const c = mk(fetchMock as unknown as typeof fetch, {
      resolveBaseUrl: 'http://localhost:8787/',
    });
    const r = await c.resolve.submit({
      repo_url: 'https://github.com/o/r',
      issue_text: 'it crashes on x',
    });
    expect(r).toEqual({ id: JOB_ID, status: 'declined', decline_reason: 'feature request' });
    expect(seen[0]!.url).toBe('http://localhost:8787/v1/resolve/jobs');
  });

  it('submit rejects an intake without issue_url or issue_text before any request', () => {
    const { fetchMock } = stub([{ status: 201, body: {} }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    expect(() => c.resolve.submit({ repo_url: 'https://github.com/o/r' })).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('get / accept / attestation hit the right routes; accept sends no body', async () => {
    const att = { id: 'a1', kind: 'codai.resolve.attestation.v0' };
    const { seen, fetchMock } = stub([
      { status: 200, body: job('quoted') },
      { status: 200, body: { id: JOB_ID, status: 'accepted' } },
      { status: 200, body: att },
      { status: 200, body: att },
      { status: 200, body: { ok: true, service: 'codai-resolve' } },
    ]);
    const c = mk(fetchMock as unknown as typeof fetch);
    expect((await c.resolve.get(JOB_ID)).status).toBe('quoted');
    expect(await c.resolve.accept(JOB_ID)).toEqual({ id: JOB_ID, status: 'accepted' });
    await c.resolve.attestation('a1');
    await c.resolve.attestation('/v1/resolve/attestations/a1');
    expect(await c.resolve.health()).toEqual({ ok: true, service: 'codai-resolve' });
    expect(seen.map((s) => `${s.method} ${s.url.replace('https://resolve.codai.ro', '')}`)).toEqual(
      [
        `GET /v1/resolve/jobs/${JOB_ID}`,
        `POST /v1/resolve/jobs/${JOB_ID}/accept`,
        'GET /v1/resolve/attestations/a1',
        'GET /v1/resolve/attestations/a1',
        'GET /health',
      ],
    );
    expect(seen[1]!.body).toBe('');
    expect(seen[1]!.headers['Content-Type']).toBeUndefined();
  });

  it('maps 402 to ResolveInsufficientFundsError carrying topupUrl', async () => {
    const body = {
      error: 'insufficient_funds',
      balance: 5_000_000,
      required: 19_000_000,
      currency: 'micro_eur',
      topup_url: 'https://pay.codai.ro/checkout?topup=14',
    };
    const { fetchMock } = stub([{ status: 402, body }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const err = await c.resolve.accept(JOB_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResolveInsufficientFundsError);
    expect(err).toBeInstanceOf(ResolveError);
    expect(err).toBeInstanceOf(CodaiError);
    const e = err as ResolveInsufficientFundsError;
    expect(e.status).toBe(402);
    expect(e.topupUrl).toBe('https://pay.codai.ro/checkout?topup=14');
    expect(e.balance).toBe(5_000_000);
    expect(e.required).toBe(19_000_000);
    expect(e.currency).toBe('micro_eur');
    expect(e.detail).toBe('insufficient_funds');
    expect(e.message).toContain('top up at https://pay.codai.ro/checkout?topup=14');
  });

  it('maps flat { error } bodies (409, 429, 400 flatten) to ResolveError with detail', async () => {
    const flat = { formErrors: ['one of issue_url or issue_text is required'], fieldErrors: {} };
    const { fetchMock } = stub([
      { status: 409, body: { error: 'job is running, only quoted jobs can be accepted' } },
      {
        status: 429,
        body: { error: 'rate limited: too many resolve submissions, retry in a minute' },
      },
      { status: 400, body: { error: flat } },
    ]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const e409 = (await c.resolve.accept(JOB_ID).catch((e: unknown) => e)) as ResolveError;
    expect(e409).toBeInstanceOf(ResolveError);
    expect(e409).not.toBeInstanceOf(ResolveInsufficientFundsError);
    expect(e409.status).toBe(409);
    expect(e409.detail).toBe('job is running, only quoted jobs can be accepted');
    expect(e409.message).toContain('only quoted jobs can be accepted');
    const e429 = (await c.resolve
      .submit({ repo_url: 'https://github.com/o/r', issue_text: 'crash on start' })
      .catch((e: unknown) => e)) as ResolveError;
    expect(e429.status).toBe(429);
    expect(e429.detail).toMatch(/rate limited/);
    const e400 = (await c.resolve
      .submit({ repo_url: 'https://github.com/o/r', issue_text: 'crash on start' })
      .catch((e: unknown) => e)) as ResolveError;
    expect(e400.status).toBe(400);
    expect(e400.detail).toEqual(flat);
  });

  it('submit and accept are never retried (a retry could double-create / double-hold)', async () => {
    const { fetchMock } = stub([{ status: 503, body: { error: 'unavailable' } }]);
    const c = mk(fetchMock as unknown as typeof fetch, { maxRetries: 3 });
    await expect(
      c.resolve.submit({ repo_url: 'https://github.com/o/r', issue_text: 'crash on start' }),
    ).rejects.toBeInstanceOf(ResolveError);
    await expect(c.resolve.accept(JOB_ID)).rejects.toBeInstanceOf(ResolveError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('waitFor polls until a terminal status and reports every poll', async () => {
    const { seen, fetchMock } = stub([
      { status: 200, body: job('accepted') },
      { status: 200, body: job('running') },
      {
        status: 200,
        body: job('resolved', {
          attestation_id: 'a1',
          attestation_url: '/v1/resolve/attestations/a1',
        }),
      },
    ]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const polled: string[] = [];
    const done = await c.resolve.waitFor(JOB_ID, {
      intervalMs: 1,
      onPoll: (j) => polled.push(j.status),
    });
    expect(done.status).toBe('resolved');
    expect(done.attestation_url).toBe('/v1/resolve/attestations/a1');
    expect(polled).toEqual(['accepted', 'running', 'resolved']);
    expect(seen).toHaveLength(3);
  });

  it('waitFor stops on a custom `until` status', async () => {
    const { fetchMock } = stub([{ status: 200, body: job('quoted') }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const j = await c.resolve.waitFor(JOB_ID, { intervalMs: 1, until: ['quoted'] });
    expect(j.status).toBe('quoted');
  });

  it('waitFor throws ResolveError (status 0, body = last job) on timeout', async () => {
    const { fetchMock } = stub([{ status: 200, body: job('running') }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const err = (await c.resolve
      .waitFor(JOB_ID, { intervalMs: 5, timeoutMs: 20 })
      .catch((e: unknown) => e)) as ResolveError;
    expect(err).toBeInstanceOf(ResolveError);
    expect(err.status).toBe(0);
    expect((err.body as ResolveJob).status).toBe('running');
    expect(err.message).toMatch(/still running/);
  });

  it('waitFor rejects promptly when the signal aborts during the sleep', async () => {
    const { fetchMock } = stub([{ status: 200, body: job('running') }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const ac = new AbortController();
    const p = c.resolve.waitFor(JOB_ID, { intervalMs: 60_000, signal: ac.signal });
    setTimeout(() => ac.abort(new Error('stop')), 10);
    await expect(p).rejects.toThrow('stop');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
