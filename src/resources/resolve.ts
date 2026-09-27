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
export type ResolveReproTest = ResolveSchemas['ResolveReproTest'];
export type ResolveHealth = ResolveSchemas['ResolveHealth'];
export type ResolveValidationDetails = ResolveSchemas['ResolveValidationDetails'];
export type ResolveInsufficientFunds = ResolveSchemas['ResolveInsufficientFunds'];

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
