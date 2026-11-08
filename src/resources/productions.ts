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
 *   `GET  /v1/studio/productions/{id}/cut`        — SX-08 cut: decisions (explain log), take clusters, script gaps
 *                                                   (`cut`, free)
 *   `POST /v1/studio/productions/{id}/cut/revise` — SX-08 cut: re-assemble with toggled decisions / takes / pacing /
 *                                                   captions into a new creative version (`reviseCut`, free)
 *   `POST /v1/studio/productions/{id}/cut/restyle` — SX-44: apply an edit style (free, new version) + extra b-roll
 *                                                    fetched by a background job (`restyleCut`; generated images at cost)
 *   `POST /v1/studio/productions/{id}/cut/variants` — SX-42: alternative edits scored on Hook / Flow / Value / Fit
 *                                                     (`cutVariants`, two token-metered turns); `GET` reads them free
 *                                                     (`retrieveCutVariants`)
 *   `POST /v1/studio/productions/{id}/cut/select`  — SX-42: apply one variant as a new version (`selectCutVariant`,
 *                                                    free)
 *
 * `kind: 'cut'` (SX-08, `StudioCutProductionCreate`) turns your uploads (`asset_ids`) into an edited video: ingest →
 * music → plan → broll → assemble → render; `create` / `run` with a cut body resolve to a `StudioCutProduction`
 * (`retrieveCut` / `waitCut` read one). Ingest of not-yet-ingested sources is billed on each asset.
 *
 * `wait(id)` polls until `status` is `succeeded` or `failed`; `run(body)` = `create` + `wait`. The plan and review
 * turns are token-metered; images, music, voice-over and renders are billed at their usual prices; `budget_micro_usd`
 * (default $3) caps the whole production.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema } from './_shared';

export type StudioProductionCreate = Mutable<Schema<'StudioProductionCreate'>>;
export type StudioProduction = Schema<'StudioProduction'>;
export type StudioProductionKind = Schema<'StudioProductionKind'>;
export type StudioProductionOutput = Schema<'StudioProductionOutput'>;
/** `POST /v1/studio/productions` body with `kind: 'cut'` (SX-08 upload → finished cut). */
export type StudioCutProductionCreate = Mutable<Schema<'StudioCutProductionCreate'>>;
export type StudioCutProduction = Schema<'StudioCutProduction'>;
export type StudioCutFormat = Schema<'StudioCutFormat'>;
export type StudioCutPacing = Schema<'StudioCutPacing'>;
export type StudioCutCaptions = Mutable<Schema<'StudioCutCaptions'>>;
export type StudioCutStats = Schema<'StudioCutStats'>;
export type StudioCutDecision = Schema<'StudioCutDecision'>;
export type StudioCutTakeCluster = Schema<'StudioCutTakeCluster'>;
export type StudioCutDecisions = Schema<'StudioCutDecisions'>;
export type StudioCutRevise = Mutable<Schema<'StudioCutRevise'>>;
export type StudioCutRevision = Schema<'StudioCutRevision'>;
/** `POST …/cut/restyle` body: `{ style: <built-in id> | <numeric style id>, fetch_broll?, base_seq? }` (SX-44). */
export type StudioCutRestyle = Mutable<Schema<'StudioCutRestyle'>>;
export type StudioCutRestyleResult = Schema<'StudioCutRestyleResult'>;
/** Background b-roll job of a restyle; poll it with `productions.retrieve(job.id)`. */
export type StudioRestyleJob = Schema<'StudioRestyleJob'>;
/** SX-42 `POST …/cut/variants` body: `{ n?: 1..5, judge?: boolean }`. */
export type StudioCutVariantsRequest = Mutable<Schema<'StudioCutVariantsRequest'>>;
export type StudioCutVariants = Schema<'StudioCutVariants'>;
export type StudioCutVariant = Schema<'StudioCutVariant'>;
export type StudioCutScore = Schema<'StudioCutScore'>;
export type StudioCutSelect = Mutable<Schema<'StudioCutSelect'>>;
export type StudioCutSelectResult = Schema<'StudioCutSelectResult'>;
/** Any production body / reply (`kind: 'cut'` or one of the 8 brief kinds). */
export type AnyStudioProductionCreate = StudioProductionCreate | StudioCutProductionCreate;
export type AnyStudioProduction = StudioProduction | StudioCutProduction;

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

/** True for a `kind: 'cut'` production reply. */
export const isCutProduction = (p: AnyStudioProduction): p is StudioCutProduction =>
  (p as { kind?: unknown }).kind === 'cut';

export class Productions {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/studio/productions` — brief → storyboard → assets → creative → queued draft render (202). With
   * `kind: 'cut'` the uploads in `asset_ids` become an edited video (ingest → … → render) and the reply is a
   * `StudioCutProduction`.
   */
  create(
    body: StudioCutProductionCreate,
    opts?: ProductionCreateOptions,
  ): Promise<StudioCutProduction>;
  create(body: StudioProductionCreate, opts?: ProductionCreateOptions): Promise<StudioProduction>;
  create(
    body: AnyStudioProductionCreate,
    opts?: ProductionCreateOptions,
  ): Promise<AnyStudioProduction>;
  create(
    body: AnyStudioProductionCreate,
    opts: ProductionCreateOptions = {},
  ): Promise<AnyStudioProduction> {
    return this.http.json<AnyStudioProduction>('/v1/studio/productions', {
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

  /** `GET /v1/studio/productions/{id}` typed for a `kind: 'cut'` production. */
  retrieveCut(id: string, opts: CallOpts = {}): Promise<StudioCutProduction> {
    return this.http.json<StudioCutProduction>(path(id), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `GET /v1/studio/productions/{id}/cut` — the explain-the-edit log of a cut (every decision with its reason and
   * whether it is on), the take clusters (Take Picker), script gaps, stats and the overrides so far. Free; 409
   * `production_not_ready` until the cut is assembled.
   */
  cut(id: string, opts: CallOpts = {}): Promise<StudioCutDecisions> {
    return this.http.json<StudioCutDecisions>(`${path(id)}/cut`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/revise` — re-assemble a finished cut with `disabled` decision ids (`+id`
   * re-enables), `takes` (cluster → sentence), `pacing` and / or `captions`; writes a new creative version (on a new
   * branch `cut-<n>` when you had edited the creative). Free. `base_seq` makes a moved branch a 409 `stale`.
   * SX-43: `prompt` = the edit request in words (EN / RO): length, energy, captions, b-roll and framing are mapped for
   * free; content requests ("only the pricing part") cost one plan-funded model turn and the answer carries `prompt`
   * `{path, understood, explanation, unmet, cost_micro_usd}`. `target_s`, `plan_delta` `{keep_only, drop, hook,
   * order}` (null = undo every story edit), `default_format` and `broll` are free.
   */
  reviseCut(id: string, body: StudioCutRevise, opts: CallOpts = {}): Promise<StudioCutRevision> {
    return this.http.json<StudioCutRevision>(`${path(id)}/cut/revise`, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/restyle` — apply an edit style (a built-in id or a numeric style id from
   * `editStyles`) to a finished cut. The knobs are written at once and free as a new version; when the style wants
   * more b-roll, `broll_job` fetches it in the background (own footage → stock → generated images; only generated
   * images are billed, at cost, under one wallet hold). Poll the job with `retrieveRestyleJob(job.id)`.
   * `fetch_broll: false` applies the knobs only. `base_seq` makes a moved branch a 409 `stale`.
   */
  restyleCut(
    id: string,
    body: StudioCutRestyle,
    opts: CallOpts = {},
  ): Promise<StudioCutRestyleResult> {
    return this.http.json<StudioCutRestyleResult>(`${path(id)}/cut/restyle`, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/productions/{job_id}` typed for the background b-roll job of a `restyleCut`. */
  retrieveRestyleJob(jobId: string, opts: CallOpts = {}): Promise<StudioRestyleJob> {
    return this.http.json<StudioRestyleJob>(path(jobId), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/variants` (SX-42) — one model turn proposes `n` alternative edits (default
   * 3, max 5; angles strongest_hook / story / punchy / topic), every variant is assembled free, and a judge turn scores
   * them and the current cut 0-99 on Hook / Flow / Value / Fit with reasons, the weakest axis and a `fix_hint`
   * (`judge: false` = measured score only, one turn). Sorted best first and stored (`retrieveCutVariants` reads them
   * again free). Both turns are token-metered and held one at a time; a short wallet is a 402 before anything runs.
   * Apply one with `selectCutVariant`; raise the weakest axis with `reviseCut(id, { prompt: v.score.fix_hint })`.
   */
  cutVariants(
    id: string,
    body: StudioCutVariantsRequest = {},
    opts: CallOpts = {},
  ): Promise<StudioCutVariants> {
    return this.http.json<StudioCutVariants>(`${path(id)}/cut/variants`, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/productions/{id}/cut/variants` — the stored variants and scores (free; 404 `no_variants`). */
  retrieveCutVariants(id: string, opts: CallOpts = {}): Promise<StudioCutVariants> {
    return this.http.json<StudioCutVariants>(`${path(id)}/cut/variants`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/select` (SX-42) — write a stored variant as a new version (free; the revise
   * answer plus `variant` and its `score`). Undo with `reviseCut(id, { plan_delta: null })`. `base_seq` makes a moved
   * branch a 409 `stale`.
   */
  selectCutVariant(
    id: string,
    body: StudioCutSelect,
    opts: CallOpts = {},
  ): Promise<StudioCutSelectResult> {
    return this.http.json<StudioCutSelectResult>(`${path(id)}/cut/select`, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Poll `retrieve` every `intervalMs` (default 5 s) until the production `succeeded` or `failed` (a failed one
   * resolves too — check `status` / `error`). Throws after `timeoutMs` (default 10 min) or when `signal` aborts.
   */
  wait(id: string, opts: ProductionWaitOptions = {}): Promise<StudioProduction> {
    return this.poll(id, opts, (i, o) => this.retrieve(i, o));
  }

  /** `wait` for a `kind: 'cut'` production (a cut can take most of an hour: pass a larger `timeoutMs`). */
  waitCut(id: string, opts: ProductionWaitOptions = {}): Promise<StudioCutProduction> {
    return this.poll(id, opts, (i, o) => this.retrieveCut(i, o));
  }

  private async poll<T extends { status: string; phase: string }>(
    id: string,
    opts: ProductionWaitOptions,
    read: (id: string, opts: CallOpts) => Promise<T>,
  ): Promise<T> {
    const interval = opts.intervalMs ?? 5_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    for (;;) {
      const p = await read(id, opts);
      if (p.status === 'succeeded' || p.status === 'failed') return p;
      if (Date.now() + interval > deadline)
        throw new Error(`codai: production ${id} did not finish in time (phase ${p.phase})`);
      await abortableSleep(interval, opts.signal);
    }
  }

  /** `create` + `wait` (`waitCut` for a cut body). */
  run(
    body: StudioCutProductionCreate,
    opts?: ProductionCreateOptions & ProductionWaitOptions,
  ): Promise<StudioCutProduction>;
  run(
    body: StudioProductionCreate,
    opts?: ProductionCreateOptions & ProductionWaitOptions,
  ): Promise<StudioProduction>;
  run(
    body: AnyStudioProductionCreate,
    opts?: ProductionCreateOptions & ProductionWaitOptions,
  ): Promise<AnyStudioProduction>;
  async run(
    body: AnyStudioProductionCreate,
    opts: ProductionCreateOptions & ProductionWaitOptions = {},
  ): Promise<AnyStudioProduction> {
    const p = await this.create(body, opts);
    if (isProductionFinished(p)) return p;
    return isCutProduction(p) ? this.waitCut(p.id, opts) : this.wait(p.id, opts);
  }
}
