/**
 * codai Resolve — execution-verified bug fixes, no fix no fee
 * (`https://resolve.codai.ro`, spec `apps/docs/openapi/en/resolve.yaml`).
 *
 * Resolve is a separate service from the gateway: it has its own host and a
 * flat `{ error: string }` error shape, so it gets its own `HttpClient` and
 * maps failures to `ResolveError` / `ResolveInsufficientFundsError`.
 */
import type { components } from '../generated/resolve';
import { CodaiError, type HttpClient, type RequestOptions } from '../http';
import { type Mutable } from './_shared';

type ResolveSchemas = components['schemas'];

export type ResolveIntake = Mutable<ResolveSchemas['ResolveIntake']>;
export type ResolveQuote = ResolveSchemas['ResolveQuote'];
export type ResolveDeclined = ResolveSchemas['ResolveDeclined'];
/** `submit()` result: `201` quote / free-tier auto-accept, or `200` decline. */
export type ResolveSubmitResult = ResolveQuote | ResolveDeclined;
export type ResolveAccepted = ResolveSchemas['ResolveAccepted'];
export type ResolveJob = ResolveSchemas['ResolveJob'];
export type ResolveJobStatus = ResolveSchemas['ResolveJobStatus'];
export type ResolveTier = ResolveSchemas['ResolveTier'];
export type ResolveAttestation = ResolveSchemas['ResolveAttestation'];
/** DSSE v1 envelope in `ResolveAttestation.signature` (`null` = unsigned, pre-2026-09-27). */
export type ResolveAttestationEnvelope = ResolveSchemas['ResolveAttestationEnvelope'];
export type ResolveKeys = ResolveSchemas['ResolveKeys'];
export type ResolveKey = ResolveSchemas['ResolveKey'];
export type ResolveReproTest = ResolveSchemas['ResolveReproTest'];
export type ResolveHealth = ResolveSchemas['ResolveHealth'];
export type ResolveValidationDetails = ResolveSchemas['ResolveValidationDetails'];
export type ResolveInsufficientFunds = ResolveSchemas['ResolveInsufficientFunds'];
/** Body POSTed to `callback_url` (verify with `verifyResolveWebhook` first). */
export type ResolveWebhookEvent = ResolveSchemas['ResolveWebhookEvent'];
export type ResolveWebhookEventName = ResolveSchemas['ResolveWebhookEventName'];
export type ResolveWebhookJob = ResolveSchemas['ResolveWebhookJob'];

export interface VerifyResolveWebhookOptions {
  /** Maximum age (and future skew) of `t`, in seconds. Default 300. */
  toleranceSeconds?: number;
  /** Current unix time in seconds (tests). Default `Date.now() / 1000`. */
  nowSeconds?: number;
}

/**
 * Verify a Resolve webhook delivery: `x-codai-signature: t=<unix>,v1=<hex>`
 * with `v1 = HMAC-SHA256(callback_secret, "<t>.<rawBody>")`. Pass the RAW
 * request body (before JSON parsing). Constant-time compare; rejects a
 * timestamp outside `toleranceSeconds`. Returns `false` for any bad input.
 *
 * Server-side only: uses `node:crypto` (Node 20.16+/22.3+, Bun, Deno), loaded
 * lazily so the rest of the SDK still bundles for browsers and edge runtimes.
 * Throws only when `node:crypto` is unavailable in the current runtime.
 */
export function verifyResolveWebhook(
  secret: string,
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  opts: VerifyResolveWebhookOptions = {},
): boolean {
  if (!secret || !signatureHeader) return false;
  let t: string | undefined;
  const v1s: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v.toLowerCase());
  }
  if (!t || !/^\d+$/.test(t) || v1s.length === 0) return false;
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > tolerance) return false;
  const { createHmac, timingSafeEqual } = nodeCrypto();
  const enc = new TextEncoder();
  const body = typeof rawBody === 'string' ? enc.encode(rawBody) : rawBody;
  const expected = createHmac('sha256', secret)
    .update(enc.encode(`${t}.`))
    .update(body)
    .digest();
  return v1s.some((v1) => {
    if (!/^[0-9a-f]{64}$/.test(v1)) return false;
    return timingSafeEqual(hexToBytes(v1), expected);
  });
}

type NodeCrypto = {
  createHmac(
    alg: string,
    key: string,
  ): { update(d: Uint8Array): { update(d: Uint8Array): { digest(): Uint8Array } } };
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
};

function nodeCrypto(): NodeCrypto {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const mod = proc?.getBuiltinModule?.('node:crypto') as NodeCrypto | undefined;
  if (!mod) {
    throw new Error(
      'verifyResolveWebhook needs node:crypto (Node 20.16+/22.3+, Bun or Deno); run it server-side',
    );
  }
  return mod;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** `payloadType` of Resolve attestation envelopes. */
export const RESOLVE_ATTESTATION_PAYLOAD_TYPE =
  'application/vnd.codai.resolve.attestation+json;v=1';

export type ResolveAttestationVerifyResult =
  | { ok: true; keyid: string }
  | { ok: false; reason: 'UNSIGNED' | 'BAD_SIGNATURE' | 'STATEMENT_MISMATCH' | 'BAD_PAYLOAD_TYPE' };

type VerifyCrypto = {
  createHash(alg: string): { update(d: Uint8Array): { digest(enc: 'hex'): string } };
  createVerify(alg: string): {
    update(d: Uint8Array): void;
    verify(key: { key: string; dsaEncoding: 'der' }, sig: Uint8Array): boolean;
  };
};

function verifyCrypto(): VerifyCrypto {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const mod = proc?.getBuiltinModule?.('node:crypto') as VerifyCrypto | undefined;
  if (!mod) {
    throw new Error(
      'verifyAttestation needs node:crypto (Node 20.16+/22.3+, Bun or Deno); run it server-side',
    );
  }
  return mod;
}

/** RFC 8785 (JCS) for the JSON subset a statement uses: sorted keys, no whitespace. */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** DSSE v1 PAE: `"DSSEv1" SP len(type) SP type SP len(body) SP body` (byte lengths). */
function pae(payloadType: string, body: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const typeBytes = enc.encode(payloadType);
  const head = enc.encode(`DSSEv1 ${typeBytes.length} ${payloadType} ${body.length} `);
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

/** The statement the Resolve service signs, recomputed from the attestation JSON. */
export function resolveAttestationStatement(att: ResolveAttestation): Record<string, unknown> {
  const { createHash } = verifyCrypto();
  const enc = new TextEncoder();
  const sha = (s: string | null | undefined) =>
    s == null ? null : createHash('sha256').update(enc.encode(s)).digest('hex');
  return {
    kind: 'codai.resolve.attestation.v1',
    attestation_id: att.id,
    repo_url: att.repo_url,
    base_commit: att.base_commit,
    patch_sha256: sha(att.patch),
    repro_test: att.repro_test?.path
      ? { path: att.repro_test.path, sha256: sha(att.repro_test.content) }
      : null,
    test_command: att.test_command,
    regression_command: att.regression_command,
    test_output_before_sha256: sha(att.test_output_before),
    test_output_after_sha256: sha(att.test_output_after),
    regression_output_sha256: sha(att.regression_output),
    runner_image_digest: att.runner_image_digest,
    started_at: att.started_at,
    verified_at: att.verified_at,
  };
}

/**
 * Verify a Resolve attestation offline against published keys: the DSSE
 * signature (ECDSA P-256/SHA-256, DER) over `PAE(payloadType, payload)` must
 * match one key, AND the signed statement must equal the one recomputed from
 * the attestation's own fields (so a valid signature over other content fails).
 * Server-side only (`node:crypto`, loaded lazily).
 */
export function verifyAttestationWithKeys(
  att: ResolveAttestation,
  keys: ResolveKeys,
): ResolveAttestationVerifyResult {
  const env = att.signature;
  if (!env || !Array.isArray(env.signatures) || env.signatures.length === 0)
    return { ok: false, reason: 'UNSIGNED' };
  if (env.payloadType !== RESOLVE_ATTESTATION_PAYLOAD_TYPE)
    return { ok: false, reason: 'BAD_PAYLOAD_TYPE' };
  const { createVerify } = verifyCrypto();
  let body: Uint8Array;
  try {
    body = base64ToBytes(env.payload);
  } catch {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  const msg = pae(env.payloadType, body);
  let keyid: string | null = null;
  outer: for (const s of env.signatures) {
    let sig: Uint8Array;
    try {
      sig = base64ToBytes(s.sig);
    } catch {
      continue;
    }
    for (const k of keys.keys) {
      if (k.payload_type && k.payload_type !== env.payloadType) continue;
      try {
        const v = createVerify('SHA256');
        v.update(msg);
        if (v.verify({ key: k.public_key_pem, dsaEncoding: 'der' }, sig)) {
          keyid = k.keyid;
          break outer;
        }
      } catch {
        /* malformed key/signature — try the next */
      }
    }
  }
  if (keyid === null) return { ok: false, reason: 'BAD_SIGNATURE' };
  let signed: unknown;
  try {
    signed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return { ok: false, reason: 'STATEMENT_MISMATCH' };
  }
  if (canonicalJson(signed) !== canonicalJson(resolveAttestationStatement(att)))
    return { ok: false, reason: 'STATEMENT_MISMATCH' };
  return { ok: true, keyid };
}

/** Statuses after which a job never changes again. */
export const RESOLVE_TERMINAL_STATUSES: ReadonlySet<ResolveJobStatus> = new Set<ResolveJobStatus>([
  'resolved',
  'failed',
  'declined',
  'error',
]);

/** Any non-2xx answer from the Resolve service (flat `{ error }` body). */
export class ResolveError extends CodaiError {
  /** The `error` field of the body: a message, or Zod `flatten()` details on a 400. */
  readonly detail: string | ResolveValidationDetails | null;

  constructor(
    message: string,
    status: number,
    body: unknown,
    meta: { requestId?: string | null; retryAfter?: number | null } = {},
  ) {
    super(message, status, body, meta);
    this.name = 'ResolveError';
    this.detail = extractDetail(body);
  }
}

/** `402` on `accept()` — the wallet cannot hold the quote; the job stays `quoted`. */
export class ResolveInsufficientFundsError extends ResolveError {
  /** Wallet balance, in `currency` units (EUR micros). */
  readonly balance: number;
  /** Amount the hold needs, in `currency` units (EUR micros). */
  readonly required: number;
  readonly currency: 'micro_eur';
  /** pay.codai.ro checkout link for the shortfall — open it, then retry `accept()`. */
  readonly topupUrl: string;

  constructor(
    message: string,
    body: ResolveInsufficientFunds,
    meta: { requestId?: string | null } = {},
  ) {
    super(message, 402, body, meta);
    this.name = 'ResolveInsufficientFundsError';
    this.balance = body.balance;
    this.required = body.required;
    this.currency = body.currency;
    this.topupUrl = body.topup_url;
  }
}

export interface ResolveWaitOptions {
  /** Poll interval (ms). Default 5_000. */
  intervalMs?: number;
  /** Give up after this long (ms); throws `ResolveError` (status 0, body = last job). Default 1_800_000. */
  timeoutMs?: number;
  /** Stop when the job reaches one of these. Default `RESOLVE_TERMINAL_STATUSES`. */
  until?: Iterable<ResolveJobStatus>;
  signal?: AbortSignal;
  /** Called with every polled job (progress UIs). */
  onPoll?: (job: ResolveJob) => void;
}

type CallOpts = { signal?: AbortSignal };

export class Resolve {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/resolve/jobs` — submit a public GitHub repo + issue for triage.
   * Returns a quote (`status: 'quoted'`), a free-tier auto-accept
   * (`status: 'accepted'`) or a decline (`status: 'declined'`). Never retried:
   * a retry could create a second job.
   */
  submit(body: ResolveIntake, opts: CallOpts = {}): Promise<ResolveSubmitResult> {
    if (!body.issue_url && !body.issue_text)
      throw new TypeError('resolve.submit: one of issue_url or issue_text is required');
    return this.call<ResolveSubmitResult>('/v1/resolve/jobs', {
      method: 'POST',
      body,
      noRetry: true,
      signal: opts.signal,
    });
  }

  /** `GET /v1/resolve/jobs/{id}` — status, quote, reasons, cost and attestation pointer. */
  get(id: string, opts: CallOpts = {}): Promise<ResolveJob> {
    return this.call<ResolveJob>(`/v1/resolve/jobs/${encodeURIComponent(id)}`, {
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/resolve/jobs/{id}/accept` — accept a paid quote and start the job.
   * Throws `ResolveInsufficientFundsError` (402, carries `topupUrl`) when the
   * wallet is short, `ResolveError` 409 when the job is not `quoted`.
   */
  accept(id: string, opts: CallOpts = {}): Promise<ResolveAccepted> {
    return this.call<ResolveAccepted>(`/v1/resolve/jobs/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
      rawBody: '', // no body — sent with content-length: 0
      noRetry: true,
      signal: opts.signal,
    });
  }

  /**
   * `GET /v1/resolve/attestations/{id}` — public execution proof (no auth needed
   * server-side). Accepts the attestation id or the job's `attestation_url`.
   */
  attestation(idOrUrl: string, opts: CallOpts = {}): Promise<ResolveAttestation> {
    const id = idOrUrl.replace(/^.*\/v1\/resolve\/attestations\//, '');
    return this.call<ResolveAttestation>(`/v1/resolve/attestations/${encodeURIComponent(id)}`, {
      signal: opts.signal,
    });
  }

  /** `GET /health` — liveness of the Resolve service. */
  health(opts: CallOpts = {}): Promise<ResolveHealth> {
    return this.call<ResolveHealth>('/health', { signal: opts.signal });
  }

  /** `GET /v1/resolve/keys` — public keys that sign attestations (no auth needed server-side). */
  keys(opts: CallOpts = {}): Promise<ResolveKeys> {
    return this.call<ResolveKeys>('/v1/resolve/keys', { signal: opts.signal });
  }

  /**
   * Verify an attestation's signature and that the signed statement matches
   * its fields. Fetches `keys()` unless `opts.keys` is given (pin them to
   * avoid trusting the network). `{ ok: false, reason: 'UNSIGNED' }` for
   * attestations created before signing (2026-09-27). Server-side only.
   */
  async verifyAttestation(
    att: ResolveAttestation,
    opts: { keys?: ResolveKeys; signal?: AbortSignal } = {},
  ): Promise<ResolveAttestationVerifyResult> {
    if (!att.signature) return { ok: false, reason: 'UNSIGNED' };
    const keys = opts.keys ?? (await this.keys({ signal: opts.signal }));
    return verifyAttestationWithKeys(att, keys);
  }

  /**
   * Poll `get(id)` until the job reaches a terminal status (`resolved`,
   * `failed`, `declined`, `error`) or one of `opts.until`. A `quoted` job
   * does not move until you `accept()` it.
   */
  async waitFor(id: string, opts: ResolveWaitOptions = {}): Promise<ResolveJob> {
    const intervalMs = opts.intervalMs ?? 5_000;
    const timeoutMs = opts.timeoutMs ?? 1_800_000;
    const until = new Set(opts.until ?? RESOLVE_TERMINAL_STATUSES);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.get(id, { signal: opts.signal });
      opts.onPoll?.(job);
      if (until.has(job.status)) return job;
      const left = deadline - Date.now();
      if (left <= 0)
        throw new ResolveError(
          `codai-resolve job ${id} still ${job.status} after ${timeoutMs} ms`,
          0,
          job,
        );
      await abortableSleep(Math.min(intervalMs, left), opts.signal);
    }
  }

  private async call<T>(path: string, init: RequestOptions): Promise<T> {
    try {
      return await this.http.json<T>(path, init);
    } catch (err) {
      throw toResolveError(path, err);
    }
  }
}

function extractDetail(body: unknown): string | ResolveValidationDetails | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') return e as ResolveValidationDetails;
  }
  return null;
}

function isInsufficientFunds(body: unknown): body is ResolveInsufficientFunds {
  return (
    !!body &&
    typeof body === 'object' &&
    (body as { error?: unknown }).error === 'insufficient_funds' &&
    typeof (body as { topup_url?: unknown }).topup_url === 'string'
  );
}

/** Re-type a `CodaiError` from the shared HTTP layer into the Resolve hierarchy. */
function toResolveError(path: string, err: unknown): unknown {
  if (!(err instanceof CodaiError) || err instanceof ResolveError) return err;
  if (err.status === 0) return err; // network/timeout — nothing Resolve-specific
  const meta = { requestId: err.requestId, retryAfter: err.retryAfter };
  if (err.status === 402 && isInsufficientFunds(err.body)) {
    const b = err.body;
    return new ResolveInsufficientFundsError(
      `codai-resolve ${path} → 402: insufficient funds (balance ${b.balance}, required ${b.required} ${b.currency}); top up at ${b.topup_url}`,
      b,
      meta,
    );
  }
  const detail = extractDetail(err.body);
  const text =
    detail === null ? '' : `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  return new ResolveError(
    `codai-resolve ${path} → ${err.status}${text}`,
    err.status,
    err.body,
    meta,
  );
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
