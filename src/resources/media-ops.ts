/**
 * `/v1/studio/media-ops` — codai Studio media operations on your assets (AR-02).
 *
 *   `GET  /v1/studio/media-ops`             — the op catalogue with list quotes and availability (`list`, free)
 *   `POST /v1/studio/media-ops/{op}/quote`  — exact price of a request, same validation as the run (`quote`, free)
 *   `POST /v1/studio/media-ops/{op}`        — run: 200 with the outputs (sync ops) or 202 with a job (async ops)
 *                                             (`run`; `Idempotency-Key` honoured)
 *   `GET  /v1/studio/media-ops/jobs/{id}`   — an async job; a finished one is settled on read (`job`)
 *
 * Ops: `image.remove_background` / `upscale` / `inpaint` / `outpaint` / `erase`, `audio.separate_stems` / `denoise` /
 * `to_midi` / `master` / `analyze`, `music.generate_ace` / `repaint` / `extend` / `cover`, `sfx.generate`. The quote is
 * held on the wallet (402 `insufficient_funds`), the measured cost billed once. Every output is AI-marked and carries
 * lineage (`parent_asset_id`, `op`, `op_inputs`). A lane that is not configured answers 503 `media_ops_unavailable`.
 * `wait(id)` polls a job until it is `ready` or `failed`; `runAndWait` = `run` + `wait` for async ops.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Reply, type Schema } from './_shared';

export type MediaOpId = Schema<'MediaOpId'>;
export type MediaOp = Schema<'MediaOp'>;
export type MediaOpList = Reply<'listStudioMediaOps'>;
export type MediaOpRequest = Mutable<Schema<'MediaOpRequest'>>;
export type MediaOpQuote = Schema<'MediaOpQuote'>;
export type MediaOpResult = Schema<'MediaOpResult'>;
export type MediaOpJob = Schema<'MediaOpJob'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface MediaOpInput {
  /** Owned, ready Studio asset ids in the order the op expects (mask second for inpaint / erase). */
  assetIds?: string[];
  /** Per-op parameters (validated strictly by the gateway; see the docs table). */
  params?: Record<string, unknown>;
}

export interface MediaOpRunOptions extends CallOpts {
  /** `Idempotency-Key`: a retry with the same key replays the first answer instead of running (and billing) again. */
  idempotencyKey?: string;
}

export interface MediaOpWaitOptions extends CallOpts {
  /** Delay between polls (default 3000 ms). */
  intervalMs?: number;
  /** Give up after this long (default 1 200 000 ms = 20 min, the server-side job timeout). */
  timeoutMs?: number;
}

const BASE = '/v1/studio/media-ops';
const opPath = (op: string) => `${BASE}/${encodeURIComponent(op)}`;

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const toBody = (input: MediaOpInput): MediaOpRequest => ({
  asset_ids: input.assetIds ?? [],
  params: input.params ?? {},
});

/** A run answer is a job (async op, HTTP 202) when `object` is `media_op.job`. */
export const isMediaOpJob = (r: MediaOpResult | MediaOpJob): r is MediaOpJob =>
  r.object === 'media_op.job';

export const isMediaOpJobFinished = (j: Pick<MediaOpJob, 'status'>): boolean =>
  j.status === 'ready' || j.status === 'failed';

export class MediaOps {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/studio/media-ops` — every op with engine, mode, inputs, `available` and a list quote (free). */
  list(opts: CallOpts = {}): Promise<MediaOpList> {
    return this.http.json<MediaOpList>(BASE, { ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/studio/media-ops/{op}/quote` — exact price of this request; nothing is held or billed. */
  quote(
    op: MediaOpId | string,
    input: MediaOpInput = {},
    opts: CallOpts = {},
  ): Promise<MediaOpQuote> {
    return this.http.json<MediaOpQuote>(`${opPath(op)}/quote`, {
      method: 'POST',
      body: toBody(input),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/media-ops/{op}` — sync ops resolve to a `media_op.result` with the outputs, async ops to a
   * `media_op.job` (`status: pending`; poll with `job` / `wait`). Use `isMediaOpJob` to tell them apart.
   */
  run(
    op: MediaOpId | string,
    input: MediaOpInput = {},
    opts: MediaOpRunOptions = {},
  ): Promise<MediaOpResult | MediaOpJob> {
    return this.http.json<MediaOpResult | MediaOpJob>(opPath(op), {
      method: 'POST',
      body: toBody(input),
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/media-ops/jobs/{id}` — the job; reading a finished one stores its outputs and bills it once. */
  job(id: string, opts: CallOpts = {}): Promise<MediaOpJob> {
    return this.http.json<MediaOpJob>(`${BASE}/jobs/${encodeURIComponent(id)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Poll `job` every `intervalMs` (default 3 s) until it is `ready` or `failed` (a failed job resolves too — check
   * `status` / `error`). Throws after `timeoutMs` (default 20 min) or when `signal` aborts.
   */
  async wait(id: string, opts: MediaOpWaitOptions = {}): Promise<MediaOpJob> {
    const interval = opts.intervalMs ?? 3_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 1_200_000);
    for (;;) {
      const j = await this.job(id, opts);
      if (isMediaOpJobFinished(j)) return j;
      if (Date.now() + interval > deadline)
        throw new Error(`codai: media job ${id} did not finish in time (status ${j.status})`);
      await abortableSleep(interval, opts.signal);
    }
  }

  /** `run`, then `wait` when the op is async. */
  async runAndWait(
    op: MediaOpId | string,
    input: MediaOpInput = {},
    opts: MediaOpRunOptions & MediaOpWaitOptions = {},
  ): Promise<MediaOpResult | MediaOpJob> {
    const r = await this.run(op, input, opts);
    return isMediaOpJob(r) && !isMediaOpJobFinished(r) ? this.wait(r.id, opts) : r;
  }
}
