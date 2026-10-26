/**
 * `/v1/research` — asynchronous deep research.
 *
 *   `POST /v1/research`      — start a job (`create`); 200 when it finished within `wait_s`, else 202 `{id, status}`
 *   `GET  /v1/research/{id}` — the job (`retrieve`); `report` / `answer` + `sources` once `done`, `error` if `failed`
 *
 * `wait(id)` polls `retrieve` until the job is `done` or `failed`; `run(body)` = `create` + `wait`.
 * Price: $0.20 per job plus its model tokens (free inside the monthly allowance / a codai agent turn). Polling is free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Schema } from './_shared';

export type ResearchRequest = Mutable<Body<'createResearch'>>;
export type ResearchJob = Schema<'ResearchJob'>;
export type ResearchSource = Schema<'ResearchSource'>;
export type ResearchStatus = ResearchJob['status'];

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface ResearchCreateOptions extends CallOpts {
  /** `Idempotency-Key`: the same key returns the job created earlier instead of starting another one. */
  idempotencyKey?: string;
}

export interface ResearchWaitOptions extends CallOpts {
  /** Delay between polls (default 3000 ms). */
  intervalMs?: number;
  /** Give up after this long (default 360 000 ms = 6 min; the longest job budget is 300 s). */
  timeoutMs?: number;
}

const path = (id: string) => `/v1/research/${encodeURIComponent(id)}`;

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

export const isResearchFinished = (job: Pick<ResearchJob, 'status'>): boolean =>
  job.status === 'done' || job.status === 'failed';

export class Research {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/research` — start a deep-research job. With `wait_s` (0..55) the call waits that long and returns the
   * finished job; otherwise (or when it is still running) the job comes back `queued` / `running`.
   */
  create(body: ResearchRequest, opts: ResearchCreateOptions = {}): Promise<ResearchJob> {
    return this.http.json<ResearchJob>('/v1/research', {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/research/{id}` — one of your jobs (another account's id is a 404). Free. */
  retrieve(id: string, opts: CallOpts = {}): Promise<ResearchJob> {
    return this.http.json<ResearchJob>(path(id), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * Poll `retrieve` every `intervalMs` (default 3 s) until the job is `done` or `failed` and resolve with it (a
   * `failed` job resolves too — check `status` / `error`). Throws when it is not finished within `timeoutMs`
   * (default 6 min) or when `signal` aborts.
   */
  async wait(id: string, opts: ResearchWaitOptions = {}): Promise<ResearchJob> {
    const { intervalMs = 3000, timeoutMs = 360_000, signal, ext } = opts;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.retrieve(id, { ext, signal });
      if (isResearchFinished(job)) return job;
      if (Date.now() + intervalMs > deadline) {
        throw new Error(`codai research job ${id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(intervalMs, signal);
    }
  }

  /** `create` then `wait` until the job finishes. */
  async run(
    body: ResearchRequest,
    opts: ResearchCreateOptions & Omit<ResearchWaitOptions, keyof CallOpts> = {},
  ): Promise<ResearchJob> {
    const { intervalMs, timeoutMs, ...createOpts } = opts;
    const job = await this.create(body, createOpts);
    if (isResearchFinished(job)) return job;
    return this.wait(job.id, {
      ext: opts.ext,
      signal: opts.signal,
      ...(intervalMs !== undefined ? { intervalMs } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  }
}
