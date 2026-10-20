/**
 * codai Studio batches — one creative per CSV / sheet row, from a template or a creative with variables.
 *
 *   `POST /v1/studio/batches`                — create (`create`, HTTP 201) or validate only (`dryRun`, HTTP 200)
 *   `GET  /v1/studio/batches`                — your batches, newest first (`list`)
 *   `GET  /v1/studio/batches/{id}`           — the batch (+ rows with `rows: 1`); every poll advances it (`get`)
 *   `POST /v1/studio/batches/{id}/cancel`    — stop it; rows not started become `skipped` (`cancel`)
 *   `POST /v1/studio/batches/{id}/retry`     — queue the failed rows again (`retry`)
 *   `GET  /v1/studio/batches/{id}/export.csv` — the original rows + `creative_id,status,error,render_url` (`exportCsv`)
 *   `POST /v1/studio/batches/{id}/zip`       — build a ZIP of the finished renders (`zip`, HTTP 202)
 *
 * `wait(id)` polls `get` until the batch is `completed`, `failed` or `cancelled`. Creating a batch is free; rows with a
 * `locale` column are translated (token-metered) and `render: true` renders every row (billed like any render).
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type QueryOf, type Schema, stripUndefined } from './_shared';

export type StudioBatchStatus = Schema<'StudioBatchStatus'>;
export type StudioBatchRowStatus = Schema<'StudioBatchRowStatus'>;
export type StudioBatch = Schema<'StudioBatch'>;
export type StudioBatchRow = Schema<'StudioBatchRow'>;
export type StudioBatchColumn = Schema<'StudioBatchColumn'>;
/** `{ batch, rows? }` (rows only with `rows: 1`). */
export type StudioBatchDetail = Schema<'StudioBatchDetail'>;
export type StudioBatchList = Schema<'StudioBatchList'>;
export type StudioBatchDryRun = Schema<'StudioBatchDryRun'>;
/**
 * `source` (`{ template_id }` or `{ creative_id, seq? }`) + exactly one of `csv` / `sheet`, optional `delimiter`,
 * `mapping` (column → variable, `null` ignores), `title`, `render`, `quality`, `ai_label`, `format`, `localize`, `dry_run`.
 */
export type StudioBatchCreateRequest = Mutable<Schema<'StudioBatchCreateRequest'>>;
export type StudioBatchListQuery = QueryOf<'listStudioBatches'>;
export type StudioBatchGetQuery = QueryOf<'getStudioBatch'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface BatchWaitOptions extends CallOpts {
  /** Delay between polls (default 3000 ms). */
  intervalMs?: number;
  /** Give up after this long (default 600 000 ms = 10 min). */
  timeoutMs?: number;
}

const BATCH_DONE: readonly StudioBatchStatus[] = ['completed', 'failed', 'cancelled'];

const path = (id: string, tail = '') => `/v1/studio/batches/${encodeURIComponent(id)}${tail}`;

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

export class Batches {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a batch: rows are validated (invalid rows are stored as `failed`) and run in the background; poll `get`
   * or `wait`. 400 `invalid_rows` when every row is invalid. Free (translations and renders are billed as usual).
   */
  async create(body: StudioBatchCreateRequest, opts: CallOpts = {}): Promise<StudioBatchDetail> {
    return this.http.json<StudioBatchDetail>('/v1/studio/batches', {
      method: 'POST',
      body: stripUndefined({ ...body, dry_run: false }),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Validate only (`dry_run: true`): the mapping, row errors, a 3-row preview and an estimate; nothing stored. Free. */
  dryRun(body: StudioBatchCreateRequest, opts: CallOpts = {}): Promise<StudioBatchDryRun> {
    return this.http.json<StudioBatchDryRun>('/v1/studio/batches', {
      method: 'POST',
      body: stripUndefined({ ...body, dry_run: true }),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Your batches, newest first (`limit` 1–50, `before` = the previous `next_before`). Free. */
  list(query: StudioBatchListQuery = {}, opts: CallOpts = {}): Promise<StudioBatchList> {
    return this.http.json<StudioBatchList>('/v1/studio/batches', {
      query: { limit: query.limit, before: query.before },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** The batch (`rows: 1` adds rows; `status`, `offset`, `limit` ≤ 100). Each poll advances it a little. Free. */
  get(
    id: string,
    query: StudioBatchGetQuery = {},
    opts: CallOpts = {},
  ): Promise<StudioBatchDetail> {
    return this.http.json<StudioBatchDetail>(path(id), {
      query: { rows: query.rows, status: query.status, offset: query.offset, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Stop the batch; rows not started become `skipped`. 409 `not_cancellable` when already finished. Free. */
  cancel(id: string, opts: CallOpts = {}): Promise<StudioBatch> {
    return this.http.json<StudioBatch>(path(id, '/cancel'), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Queue the failed rows again (≤ 3 attempts each). 409 `nothing_to_retry`. Free. */
  retry(id: string, opts: CallOpts = {}): Promise<StudioBatch> {
    return this.http.json<StudioBatch>(path(id, '/retry'), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** The original CSV plus `creative_id`, `status`, `error`, `render_url` per row (formula-safe). Free. */
  async exportCsv(id: string, opts: CallOpts = {}): Promise<string> {
    const res = await this.http.request(path(id, '/export.csv'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return res.text();
  }

  /**
   * Start building a ZIP of the finished renders (202, `zip.status: 'building'`; unchanged when already building or
   * ready). Poll `get` until `zip.status` is `ready` (signed `zip.url`). 409 `no_renders`. Free.
   */
  zip(id: string, opts: CallOpts = {}): Promise<StudioBatch> {
    return this.http.json<StudioBatch>(path(id, '/zip'), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Poll `get` every `intervalMs` (default 3 s) until the batch is `completed`, `failed` or `cancelled` and resolve
   * with it. Throws when it is not done within `timeoutMs` (default 10 min) or when `signal` aborts.
   */
  async wait(id: string, opts: BatchWaitOptions = {}): Promise<StudioBatch> {
    const { intervalMs = 3000, timeoutMs = 600_000, signal, ext } = opts;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { batch } = await this.get(id, {}, { ext, signal });
      if (BATCH_DONE.includes(batch.status)) return batch;
      if (Date.now() + intervalMs > deadline) {
        throw new Error(`codai batch ${id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(intervalMs, signal);
    }
  }
}
