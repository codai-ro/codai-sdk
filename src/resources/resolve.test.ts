import { createHash, createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';
import {
  RESOLVE_ATTESTATION_PAYLOAD_TYPE,
  type ResolveAttestation,
  ResolveError,
  ResolveInsufficientFundsError,
  type ResolveJob,
  type ResolveKeys,
  type ResolveQuote,
  verifyAttestationWithKeys,
  verifyResolveWebhook,
} from './resolve';

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

  it('submit sends callback_url and surfaces the one-time callback_secret', async () => {
    const { seen, fetchMock } = stub([
      {
        status: 201,
        body: {
          id: JOB_ID,
          status: 'quoted',
          tier: 't19',
          quote_micro_usd: 19_000_000,
          triage_reason: 'clear bug',
          free_tier_remaining: 0,
          callback_secret: 'whsec_abc',
        },
      },
    ]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const r = (await c.resolve.submit({
      repo_url: 'https://github.com/o/r',
      issue_text: 'it crashes on x',
      callback_url: 'https://ci.example.com/hook',
    })) as ResolveQuote;
    expect(r.callback_secret).toBe('whsec_abc');
    expect(JSON.parse(seen[0]!.body as string)).toMatchObject({
      callback_url: 'https://ci.example.com/hook',
    });
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

describe('verifyResolveWebhook', () => {
  const SECRET = 'whsec_test_secret';
  const NOW = 1_790_000_000;
  const RAW = JSON.stringify({
    event: 'job.resolved',
    job: { id: JOB_ID, status: 'resolved' },
    sent_at: '2026-09-27T00:00:00.000Z',
  });
  const sign = (t: number, body: string, secret = SECRET) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')}`;

  it('accepts a signature made exactly like the Resolve service signs', () => {
    expect(verifyResolveWebhook(SECRET, RAW, sign(NOW, RAW), { nowSeconds: NOW })).toBe(true);
  });

  it('accepts the raw body as bytes', () => {
    const bytes = new TextEncoder().encode(RAW);
    expect(verifyResolveWebhook(SECRET, bytes, sign(NOW, RAW), { nowSeconds: NOW })).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and a malformed header', () => {
    const header = sign(NOW, RAW);
    expect(verifyResolveWebhook(SECRET, RAW + ' ', header, { nowSeconds: NOW })).toBe(false);
    expect(verifyResolveWebhook('whsec_other', RAW, header, { nowSeconds: NOW })).toBe(false);
    expect(verifyResolveWebhook(SECRET, RAW, 'v1=deadbeef', { nowSeconds: NOW })).toBe(false);
    expect(verifyResolveWebhook(SECRET, RAW, `t=${NOW},v1=zz`, { nowSeconds: NOW })).toBe(false);
    expect(verifyResolveWebhook(SECRET, RAW, '', { nowSeconds: NOW })).toBe(false);
    expect(verifyResolveWebhook(SECRET, RAW, null, { nowSeconds: NOW })).toBe(false);
    expect(verifyResolveWebhook('', RAW, header, { nowSeconds: NOW })).toBe(false);
  });

  it('rejects timestamps outside the tolerance (default 300 s), both directions', () => {
    expect(verifyResolveWebhook(SECRET, RAW, sign(NOW - 300, RAW), { nowSeconds: NOW })).toBe(true);
    expect(verifyResolveWebhook(SECRET, RAW, sign(NOW - 301, RAW), { nowSeconds: NOW })).toBe(
      false,
    );
    expect(verifyResolveWebhook(SECRET, RAW, sign(NOW + 301, RAW), { nowSeconds: NOW })).toBe(
      false,
    );
    expect(
      verifyResolveWebhook(SECRET, RAW, sign(NOW - 3_600, RAW), {
        nowSeconds: NOW,
        toleranceSeconds: 7_200,
      }),
    ).toBe(true);
  });

  it('uses the wall clock when nowSeconds is omitted', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyResolveWebhook(SECRET, RAW, sign(t, RAW))).toBe(true);
  });
});

describe('resolve.verifyAttestation', () => {
  // Re-implemented independently of the SDK, byte-for-byte like the server
  // (apps/resolve/src/attestation-sign.ts + packages/rules-core envelope/canon).
  const sha = (s: string | null) =>
    s == null ? null : createHash('sha256').update(s, 'utf8').digest('hex');
  const jcs = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jcs(o[k])}`)
      .join(',')}}`;
  };
  const paeBuf = (type: string, body: Buffer) =>
    Buffer.concat([
      Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${body.length} `, 'utf8'),
      body,
    ]);
  type Fixture = {
    id: string;
    kind: string;
    repo_url: string;
    base_commit: string;
    patch: string;
    repro_test: { path: string; content: string | null } | null;
    test_command: string;
    regression_command: string | null;
    test_output_before: string;
    test_output_after: string;
    regression_output: string | null;
    runner_image_digest: string;
    started_at: string;
    verified_at: string;
  };
  const base: Fixture = {
    id: '1f2c1a3e-8d4b-4f8e-9a1b-0c2d3e4f5a6b',
    kind: 'codai.resolve.attestation.v0',
    repo_url: 'https://github.com/o/r',
    base_commit: 'abc123',
    patch: 'diff --git a/x b/x\n+ünïcode\n',
    repro_test: { path: 'tests/test_x.py', content: 'def test_x(): assert 1\n' },
    test_command: 'pytest -q tests/test_x.py',
    regression_command: null,
    test_output_before: '1 failed',
    test_output_after: '1 passed',
    regression_output: null,
    runner_image_digest: 'sha256:deadbeef',
    started_at: '2026-09-27T08:00:00.000Z',
    verified_at: '2026-09-27T08:05:00.000Z',
  };
  const statement = (a: typeof base) => ({
    kind: 'codai.resolve.attestation.v1',
    attestation_id: a.id,
    repo_url: a.repo_url,
    base_commit: a.base_commit,
    patch_sha256: sha(a.patch),
    repro_test: a.repro_test
      ? { path: a.repro_test.path, sha256: sha(a.repro_test.content) }
      : null,
    test_command: a.test_command,
    regression_command: a.regression_command,
    test_output_before_sha256: sha(a.test_output_before),
    test_output_after_sha256: sha(a.test_output_after),
    regression_output_sha256: sha(a.regression_output),
    runner_image_digest: a.runner_image_digest,
    started_at: a.started_at,
    verified_at: a.verified_at,
  });
  const pair = () =>
    generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  const signer = pair();
  const other = pair();
  const keysOf = (pem: string, keyid = 'k1'): ResolveKeys => ({
    keys: [
      {
        keyid,
        algorithm: 'ECDSA_P256_SHA256',
        payload_type: RESOLVE_ATTESTATION_PAYLOAD_TYPE,
        encoding: 'DSSE v1; signature DER, base64',
        public_key_pem: pem,
      },
    ],
  });
  const signed = (a = base, type = RESOLVE_ATTESTATION_PAYLOAD_TYPE): ResolveAttestation => {
    const body = Buffer.from(jcs(statement(a)), 'utf8');
    const s = createSign('SHA256');
    s.update(paeBuf(type, body));
    const sig = s.sign({ key: signer.privateKey, dsaEncoding: 'der' });
    return {
      ...a,
      signature: {
        payloadType: type,
        payload: body.toString('base64'),
        signatures: [{ keyid: 'k1', sig: sig.toString('base64') }],
      },
    } as unknown as ResolveAttestation;
  };

  it('accepts an envelope signed exactly like the Resolve service', () => {
    expect(verifyAttestationWithKeys(signed(), keysOf(signer.publicKey))).toEqual({
      ok: true,
      keyid: 'k1',
    });
  });

  it('handles a null repro_test and a regression run', () => {
    const a = {
      ...base,
      repro_test: null,
      regression_command: 'pytest -q',
      regression_output: 'ok',
    };
    expect(verifyAttestationWithKeys(signed(a as typeof base), keysOf(signer.publicKey)).ok).toBe(
      true,
    );
  });

  it('STATEMENT_MISMATCH when any served field differs from what was signed', () => {
    const att = signed();
    for (const tamper of [
      { patch: base.patch + ' ' },
      { test_output_after: '0 passed' },
      { repro_test: { path: 'tests/test_x.py', content: 'evil' } },
      { verified_at: '2026-09-28T00:00:00.000Z' },
    ]) {
      expect(
        verifyAttestationWithKeys(
          { ...att, ...tamper } as ResolveAttestation,
          keysOf(signer.publicKey),
        ),
      ).toEqual({ ok: false, reason: 'STATEMENT_MISMATCH' });
    }
  });

  it('BAD_SIGNATURE with another key or a tampered payload', () => {
    expect(verifyAttestationWithKeys(signed(), keysOf(other.publicKey))).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
    const att = signed();
    const forged = Buffer.from(jcs({ ...statement(base), base_commit: 'evil' })).toString('base64');
    expect(
      verifyAttestationWithKeys(
        { ...att, signature: { ...att.signature!, payload: forged } },
        keysOf(signer.publicKey),
      ),
    ).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('BAD_PAYLOAD_TYPE for an envelope of another codai document type', () => {
    expect(
      verifyAttestationWithKeys(
        signed(base, 'application/vnd.codai.rules+json;v=1'),
        keysOf(signer.publicKey),
      ),
    ).toEqual({ ok: false, reason: 'BAD_PAYLOAD_TYPE' });
  });

  it('UNSIGNED for pre-signing attestations, without fetching keys', async () => {
    const { fetchMock } = stub([{ status: 200, body: keysOf(signer.publicKey) }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    const att = { ...base, signature: null } as unknown as ResolveAttestation;
    expect(await c.resolve.verifyAttestation(att)).toEqual({ ok: false, reason: 'UNSIGNED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('client.resolve.verifyAttestation fetches GET /v1/resolve/keys when none are pinned', async () => {
    const { seen, fetchMock } = stub([{ status: 200, body: keysOf(signer.publicKey) }]);
    const c = mk(fetchMock as unknown as typeof fetch);
    expect(await c.resolve.verifyAttestation(signed())).toEqual({ ok: true, keyid: 'k1' });
    expect(seen.map((s) => s.url)).toEqual(['https://resolve.codai.ro/v1/resolve/keys']);
    expect(await c.resolve.verifyAttestation(signed(), { keys: keysOf(other.publicKey) })).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
