/**
 * `/v1/studio/productions` — codai Studio brief → finished output (RC-20), one of 8 kinds (`kind`, default `video`):
 *
 *   `video` (MP4 render) · `image` (PNG) · `deck` (PPTX) · `doc` (DOCX) · `sheet` (XLSX) · `carousel` (ZIP of PNG slides
 *   + cover PNG) · `print` (A4/A5 PDF) · `audio` (MP3 jingle or song). Non-video productions return `kind`,
 *   `output_asset_id` and `outputs` (Studio assets with a `role`); `starter` / `voice` / `narration` / `aspect_ratio` are
 *   video-only.
 *
 *   `POST /v1/studio/productions`      — one plan turn, images / music, an editable creative and the output being built
 *                                        (video: storyboard on a built-in starter + voice-over + a draft render)
 *                                        (`create`, 202, ~1 min)
 *   `GET  /v1/studio/productions/{id}` — the production (`retrieve`); reading it advances render → review → repair →
 *                                        ready like a poll
 *
 * `wait(id)` polls until `status` is `succeeded` or `failed`; `run(body)` = `create` + `wait`. The plan and review
 * turns are token-metered; images, music, voice-over and renders are billed at their usual prices; `budget_micro_usd`
 * (default $3) caps the whole production.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Schema } from './_shared';

export type StudioProductionCreate = Mutable<Body<'createStudioProduction'>>;
export type StudioProduction = Schema<'StudioProduction'>;
export type StudioProductionKind = Schema<'StudioProductionKind'>;
export type StudioProductionOutput = Schema<'StudioProductionOutput'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface ProductionCreateOptions extends CallOpts {
  /** `Idempotency-Key`: a retry with the same key replays the first production instead of starting another one. */
  idempotencyKey?: string;
}

export interface ProductionWaitOptions extends CallOpts {
  /** Delay between polls (default 5000 ms). */
  intervalMs?: number;
  /** Give up after this long (default 600 000 ms = 10 min). */
  timeoutMs?: number;
}

const path = (id: string) => `/v1/studio/productions/${encodeURIComponent(id)}`;

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

export const isProductionFinished = (p: Pick<StudioProduction, 'status'>): boolean =>
  p.status === 'succeeded' || p.status === 'failed';

export class Productions {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/studio/productions` — brief → storyboard → assets → creative → queued draft render (202). */
  create(
    body: StudioProductionCreate,
    opts: ProductionCreateOptions = {},
  ): Promise<StudioProduction> {
    return this.http.json<StudioProduction>('/v1/studio/productions', {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/productions/{id}` — advances the production and returns it (another account's id is a 404). */
  retrieve(id: string, opts: CallOpts = {}): Promise<StudioProduction> {
    return this.http.json<StudioProduction>(path(id), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * Poll `retrieve` every `intervalMs` (default 5 s) until the production `succeeded` or `failed` (a failed one
   * resolves too — check `status` / `error`). Throws after `timeoutMs` (default 10 min) or when `signal` aborts.
   */
  async wait(id: string, opts: ProductionWaitOptions = {}): Promise<StudioProduction> {
    const interval = opts.intervalMs ?? 5_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    for (;;) {
      const p = await this.retrieve(id, opts);
      if (isProductionFinished(p)) return p;
      if (Date.now() + interval > deadline)
        throw new Error(`codai: production ${id} did not finish in time (phase ${p.phase})`);
      await abortableSleep(interval, opts.signal);
    }
  }

  /** `create` + `wait`. */
  async run(
    body: StudioProductionCreate,
    opts: ProductionCreateOptions & ProductionWaitOptions = {},
  ): Promise<StudioProduction> {
    const p = await this.create(body, opts);
    return isProductionFinished(p) ? p : this.wait(p.id, opts);
  }
}
