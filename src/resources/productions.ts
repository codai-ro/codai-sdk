/**
 * `/v1/studio/productions` — codai Studio brief → finished output (RC-20), one of 8 kinds (`kind`, default `video`):
 *
 *   `video` (MP4 render) · `image` (PNG) · `deck` (PPTX) · `doc` (DOCX) · `sheet` (XLSX) · `carousel` (ZIP of PNG slides
 *   + cover PNG) · `print` (A4/A5 PDF) · `audio` (MP3 jingle or song). Non-video productions return `kind`,
 *   `output_asset_id` and `outputs` (Studio assets with a `role`); `starter` / `voice` / `narration` / `quality` /
 *   `music` / `duration_s` / `aspect_ratio` are video-only. `quality: 'final'` (default, full resolution at 30 fps) or
 *   `'draft'` (540p at 15 fps, half the render price) picks the delivered MP4; `music` (default `true`) adds an
 *   instrumental music bed under the voice-over (skipped with a `warnings` entry where music is not available). A
 *   video production answers with `quality` and `music` (whether a bed was added).
 *
 *   `POST /v1/studio/productions`      — one plan turn, images / music, an editable creative and the output being built
 *                                        (video: storyboard on a built-in starter + voice-over + music bed + a render)
 *                                        (`create`, 202, ~1 min)
 *   `GET  /v1/studio/productions/{id}` — the production (`retrieve`); reading it advances render → review → repair →
 *                                        ready like a poll
 *   `POST /v1/studio/productions/{id}/review` — SX-78: approve or cancel a video production that waits at the review
 *                                               gate (`review`; approve starts the final render)
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
 *   `POST /v1/studio/productions/{id}/cut/hooks`   — SX-46: 2-3 alternative cold opens (`cutHooks`; free ranking,
 *                                                    `judge` = one paid turn); `GET` reads them free (`retrieveCutHooks`)
 *   `GET  /v1/studio/productions/{id}/cut/lengths` — SX-47: length presets 15/30/60/90/max previewed (`cutLengths`, free)
 *   `GET  /v1/studio/productions/{id}/cut/attention` — SX-48: heuristic attention guide + dips with fixes
 *                                                      (`cutAttention`, free)
 *   `POST /v1/studio/productions/{id}/cut/topics`  — SX-49: topic chips (`cutTopics`, one paid turn); `GET` reads them
 *                                                    free (`retrieveCutTopics`)
 *   `POST /v1/studio/productions/{id}/cut/renders` — SX-46/47: render every hook / length variant (`cutRenders`,
 *                                                    render prices)
 *   `POST /v1/studio/productions/{id}/cut/podcast` — SX-50: podcast package export (`cutPodcast`, 202; poll with
 *                                                    `exports.wait`)
 *
 * `kind: 'cut'` (SX-08, `StudioCutProductionCreate`) turns your uploads (`asset_ids`) into an edited video: ingest →
 * music → plan → broll → clean → assemble → render; `create` / `run` with a cut body resolve to a `StudioCutProduction`
 * (`retrieveCut` / `waitCut` read one). Ingest of not-yet-ingested sources is billed on each asset. SX-51
 * `voice_cleanup: 'auto' | 'on' | 'off'` (free) cleans the spoken sources; `reviseCut(id, { voice_cleanup: true })` on
 * a cut made without it starts a background job (`voice_cleanup_job`, read it with `retrieveCleanJob`).
 *
 * Video options (all optional, defaults unchanged): `review: true` stops the production before the final render. It
 * makes the images, the voice-over, the music and a draft preview render, then waits in phase `review` (`p.review`
 * carries the preview render id and the stills) until `review(id, { decision })`; nothing is billed while it waits and
 * the gate expires after 7 days (`error: 'gate_expired'`). `director: 'free'` lets the model write the whole
 * composition instead of filling a starter. `critique_rounds: 1 | 2` replaces the single review with a critique loop
 * (`p.critique` lists the rounds).
 *
 * `wait(id)` polls until `status` is `succeeded` or `failed`, or until the production waits at the review gate
 * (`isProductionAtReviewGate`); `run(body)` = `create` + `wait`. The plan and review turns are token-metered; images,
 * music, voice-over and renders are billed at their usual prices; `budget_micro_usd` (default $3) caps the whole
 * production.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema } from './_shared';

export type StudioProductionCreate = Mutable<Schema<'StudioProductionCreate'>>;
export type StudioProduction = Schema<'StudioProduction'>;
export type StudioProductionKind = Schema<'StudioProductionKind'>;
export type StudioProductionOutput = Schema<'StudioProductionOutput'>;
/** SX-78 review gate of a video production created with `review: true` (`production.review`). */
export type StudioProductionReview = Schema<'StudioProductionReview'>;
/** SX-63 critique loop of a video production created with `critique_rounds` (`production.critique`). */
export type StudioProductionCritique = Schema<'StudioProductionCritique'>;
/** `POST /v1/studio/productions/{id}/review` body: `{ decision: 'approve' | 'cancel' }`. */
export type StudioProductionReviewRequest = Mutable<Schema<'StudioProductionReviewRequest'>>;
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
/** SX-46 `POST …/cut/hooks` body: `{ n?: 2..3, judge?: boolean }`. */
export type StudioCutHooksRequest = Mutable<Schema<'StudioCutHooksRequest'>>;
export type StudioCutHooks = Schema<'StudioCutHooks'>;
/** SX-47 length presets (15 / 30 / 60 / 90 / max) with platform cap warnings. */
export type StudioCutLengths = Schema<'StudioCutLengths'>;
/** SX-48 attention guide — a heuristic, not a retention prediction. */
export type StudioCutAttention = Schema<'StudioCutAttention'>;
/** SX-49 `POST …/cut/topics` body: `{ refresh?: boolean }`. */
export type StudioCutTopicsRequest = Mutable<Schema<'StudioCutTopicsRequest'>>;
export type StudioCutTopics = Schema<'StudioCutTopics'>;
/** SX-46/47 `POST …/cut/renders` body: `{ kind: 'hooks' | 'lengths', ids?, quality? }`. */
export type StudioCutRendersRequest = Mutable<Schema<'StudioCutRendersRequest'>>;
export type StudioCutRenders = Schema<'StudioCutRenders'>;
/** SX-50 `POST …/cut/podcast` body: `{ render_id?, notes?, include_video?, mp3?: { channels?, bitrate_k? } }`. */
export type StudioCutPodcastRequest = Mutable<Schema<'StudioCutPodcastRequest'>>;
/** The 202 answer of `cutPodcast`: a `kind: 'podcast'` export plus `spotify_upload_url` and `chapters`. */
export type StudioCutPodcastExport = Schema<'StudioExport'>;
/** SX-51 background voice cleanup job (`kind: 'cut_clean'`). */
export type StudioCutCleanJob = Schema<'StudioCutCleanJob'>;
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

/**
 * True while a video production created with `review: true` waits for `productions.review(id, { decision })`
 * (`status` is still `running`; nothing is billed while it waits).
 */
export const isProductionAtReviewGate = (p: Pick<StudioProduction, 'status' | 'phase'>): boolean =>
  p.status === 'running' && p.phase === 'review';

/** True for a `kind: 'cut'` production reply. */
export const isCutProduction = (p: AnyStudioProduction): p is StudioCutProduction =>
  (p as { kind?: unknown }).kind === 'cut';

export class Productions {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/studio/productions` — brief → storyboard → assets → creative → queued render (202; video: `quality`
   * `'final'` by default, `'draft'` for a half-price 540p preview; `music: false` leaves the music bed out). With
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

  /**
   * `POST /v1/studio/productions/{id}/review` (SX-78) — answer the review gate of a video production created with
   * `review: true`. `approve` submits the final render (billed like every render; edits made to the creative while
   * it waited are rendered); `cancel` ends the production with `error: 'cancelled'` (the creative stays editable).
   * Resolves to the production. 402 `insufficient_funds`: the wallet cannot cover the final render and the production
   * stays at the gate; 409 `not_in_review`: it does not wait at the gate; repeating an applied decision answers 200.
   */
  review(
    id: string,
    body: StudioProductionReviewRequest,
    opts: CallOpts = {},
  ): Promise<StudioProduction> {
    return this.http.json<StudioProduction>(`${path(id)}/review`, {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
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
   * SX-32 multicam cuts: `angles` `{ 'angle:3': assetId | 'wide' | 'split' | null }` pins shots (free).
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

  private post<T>(id: string, sub: string, body: unknown, opts: CallOpts): Promise<T> {
    return this.http.json<T>(`${path(id)}${sub}`, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  private get<T>(id: string, sub: string, opts: CallOpts): Promise<T> {
    return this.http.json<T>(`${path(id)}${sub}`, { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/hooks` (SX-46) — 2-3 other sentences that could open the SAME cut, ranked
   * free on measured features; `judge: true` re-ranks them with one paid turn (quote 60,000 µUSD; a short wallet keeps
   * the free ranking, warning `judge_insufficient_funds`). Stored (`retrieveCutHooks`). Apply one with
   * `reviseCut(id, { hook: h.sentence })` or render all with `cutRenders(id, { kind: 'hooks' })`.
   */
  cutHooks(
    id: string,
    body: StudioCutHooksRequest = {},
    opts: CallOpts = {},
  ): Promise<StudioCutHooks> {
    return this.post(id, '/cut/hooks', body, opts);
  }

  /** `GET /v1/studio/productions/{id}/cut/hooks` — the stored hook alternatives (free; 404 `no_hooks`). */
  retrieveCutHooks(id: string, opts: CallOpts = {}): Promise<StudioCutHooks> {
    return this.get(id, '/cut/hooks', opts);
  }

  /**
   * `GET /v1/studio/productions/{id}/cut/lengths` (SX-47, free) — the cut re-assembled at 15 / 30 / 60 / 90 s and
   * `max` (180 s) with real lengths, scores and platform caps exceeded. Apply with `reviseCut(id, { target_s })`.
   */
  cutLengths(id: string, opts: CallOpts = {}): Promise<StudioCutLengths> {
    return this.get(id, '/cut/lengths', opts);
  }

  /**
   * `GET /v1/studio/productions/{id}/cut/attention` (SX-48, free) — heuristic attention curve and the dips of 2 s or
   * more; send a dip's `fix.revise` as-is to `reviseCut`. A heuristic, not a retention prediction.
   */
  cutAttention(id: string, opts: CallOpts = {}): Promise<StudioCutAttention> {
    return this.get(id, '/cut/attention', opts);
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/topics` (SX-49) — one paid turn (quote 60,000 µUSD) labels the topics and
   * stores them; `refresh: false` returns stored topics free. Chips: `reviseCut(id, { topics: ['t1'] })` (free).
   */
  cutTopics(
    id: string,
    body: StudioCutTopicsRequest = {},
    opts: CallOpts = {},
  ): Promise<StudioCutTopics> {
    return this.post(id, '/cut/topics', body, opts);
  }

  /** `GET /v1/studio/productions/{id}/cut/topics` — the stored topics (free; 404 `no_topics`). */
  retrieveCutTopics(id: string, opts: CallOpts = {}): Promise<StudioCutTopics> {
    return this.get(id, '/cut/topics', opts);
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/renders` (SX-46/47 "Render all") — one new creative + render per stored
   * hook or per length preset, at render prices; the wallet must cover the whole batch (402) and at most 3 renders
   * run at once (429 `too_many_renders`). `idempotencyKey` replays the first answer.
   */
  cutRenders(
    id: string,
    body: StudioCutRendersRequest,
    opts: CallOpts & { idempotencyKey?: string } = {},
  ): Promise<StudioCutRenders> {
    return this.http.json<StudioCutRenders>(`${path(id)}/cut/renders`, {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/productions/{id}/cut/podcast` (SX-50) — podcast package (MP3 -16 LUFS with ID3 chapters and
   * cover, cover.jpg 3000², notes.md, chapters.txt, episode.mp4) built in the background: 202 export, then
   * `exports.wait(e.id)`. Job 20,000 µUSD flat + the notes turn (quote 30,000 µUSD, `notes: false` skips it). Spotify
   * has no upload API: upload the files at `spotify_upload_url`.
   */
  cutPodcast(
    id: string,
    body: StudioCutPodcastRequest = {},
    opts: CallOpts = {},
  ): Promise<StudioCutPodcastExport> {
    return this.post(id, '/cut/podcast', body, opts);
  }

  /** `GET /v1/studio/productions/{job_id}` typed for the SX-51 voice cleanup job (`voice_cleanup_job` of a revise). */
  retrieveCleanJob(jobId: string, opts: CallOpts = {}): Promise<StudioCutCleanJob> {
    return this.http.json<StudioCutCleanJob>(path(jobId), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * Poll `retrieve` every `intervalMs` (default 5 s) until the production `succeeded` or `failed` (a failed one
   * resolves too — check `status` / `error`). A production created with `review: true` also resolves when it reaches
   * the review gate (`isProductionAtReviewGate(p)`): answer it with `review(id, { decision })`, then `wait` again.
   * Throws after `timeoutMs` (default 10 min) or when `signal` aborts.
   */
  wait(id: string, opts: ProductionWaitOptions = {}): Promise<StudioProduction> {
    return this.poll(id, opts, (i, o) => this.retrieve(i, o), isProductionAtReviewGate);
  }

  /** `wait` for a `kind: 'cut'` production (a cut can take most of an hour: pass a larger `timeoutMs`). */
  waitCut(id: string, opts: ProductionWaitOptions = {}): Promise<StudioCutProduction> {
    return this.poll(id, opts, (i, o) => this.retrieveCut(i, o));
  }

  private async poll<T extends { status: string; phase: string }>(
    id: string,
    opts: ProductionWaitOptions,
    read: (id: string, opts: CallOpts) => Promise<T>,
    paused?: (p: T) => boolean,
  ): Promise<T> {
    const interval = opts.intervalMs ?? 5_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    for (;;) {
      const p = await read(id, opts);
      if (p.status === 'succeeded' || p.status === 'failed' || paused?.(p)) return p;
      if (Date.now() + interval > deadline)
        throw new Error(`codai: production ${id} did not finish in time (phase ${p.phase})`);
      await abortableSleep(interval, opts.signal);
    }
  }

  /**
   * `create` + `wait` (`waitCut` for a cut body). With `review: true` it resolves at the review gate, not at the
   * finished video.
   */
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
    if (isProductionFinished(p) || (!isCutProduction(p) && isProductionAtReviewGate(p))) return p;
    return isCutProduction(p) ? this.waitCut(p.id, opts) : this.wait(p.id, opts);
  }
}
