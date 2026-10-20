/**
 * codai Studio creatives — editable creative documents (ECD) with an append-only version history.
 *
 *   `POST   /v1/studio/creatives`               — create (empty doc per `kind`, your `doc`, or a `template` + `vars`;
 *                                                 `brand_kit_id`), HTTP 201
 *   `GET    /v1/studio/creatives`               — list (`kind`, `before`, `limit`)
 *   `GET    /v1/studio/creatives/{id}`          — the doc at the head (or `seq`) + signed assets
 *   `GET    /v1/studio/creatives/{id}/outline`  — compact text outline for prompts
 *   `POST   /v1/studio/creatives/{id}/find`     — node ids matching a query
 *   `POST   /v1/studio/creatives/{id}/subtree`  — full JSON of ids / a scene
 *   `POST   /v1/studio/creatives/{id}/ops`      — apply ops against `baseSeq` (rebased when possible, 409 `stale` else)
 *   `GET    /v1/studio/creatives/{id}/versions` — history; `revert`, `fork`, `lint`, `compiled`, `render`, `frame`
 *   `GET    /v1/studio/creatives/{id}/frames/{jobId}` — poll a frame job (`frameJob`)
 *   `POST   /v1/studio/creatives/{id}/comments` — turn a frame comment into an edit (`comment`, token-metered)
 *   `POST   /v1/studio/creatives/{id}/variants` — A/B variants as forks (`variants`, token-metered + draft renders)
 *   `GET    /v1/studio/creatives/{id}/variants` — the latest variant group (`listVariants`)
 *   `POST   /v1/studio/creatives/{id}/variants/{variantId}/pick` — apply the winner to the original (`pickVariant`)
 *   `POST   /v1/studio/creatives/{id}/template` — save as a private template (`saveTemplate`; see `templates`)
 *   `GET    /v1/studio/creatives/{id}/export.fcpxml` — queue an FCPXML project zip (`exportFcpxml`; see `exports`)
 *   `GET    /v1/studio/creatives/{id}/export.lottie` — Lottie JSON / dotLottie, free and ready at once (`exportLottie`;
 *                                                 `downloadLottie` for the file itself)
 *   `POST   /v1/studio/documents/{id}/creative` — edit a Studio document as a creative (`fromDocument`; 201 / 200)
 *   `POST   /v1/studio/creatives/{id}/build` — build a deck / doc / sheet creative into PPTX / DOCX / XLSX (`build`)
 *   `POST   /v1/studio/creatives/{id}/restyle` — re-apply a brand kit / token map as one new version (`restyle`)
 *   `POST   /v1/studio/creatives/{id}/captions` — auto-captions from a voice clip (`captions`; transcription billed)
 *   `GET    /v1/studio/creatives/{id}/captions.srt|.vtt` — captions as SRT / WebVTT text (`captionsSrt`, `captionsVtt`)
 *   `POST   /v1/studio/creatives/{id}/adapt` — add platform formats with safe zones (`adapt`; vision focal billed)
 *   `POST   /v1/studio/creatives/{id}/lint/fix` — fix lint issues (`lintFix`; deterministic free, `agent` billed)
 *   `GET    /v1/studio/creatives/{id}/controls` — the tweak panel model (`controls`)
 *   `GET    /v1/studio/creatives/{id}/locales` — localisation state + units of a locale (`locales`)
 *   `POST   /v1/studio/creatives/{id}/localize` — translate into up to 10 locales (`localize`; token-metered)
 *   `POST   /v1/studio/creatives/{id}/locales/{locale}/fork` — a locale as a new creative (`forkLocale`)
 *   `POST   /v1/studio/creatives/{id}/shares` — a public view / review link, token shown once (`createShare`)
 *   `GET    /v1/studio/creatives/{id}/shares` — active links (`listShares`); `DELETE …/shares/{shareId}` (`revokeShare`)
 *   `GET|POST /v1/studio/creatives/{id}/review` — review state; request review / back to draft (`review`,
 *                                                 `requestReview`, `resetReview`)
 *   `GET|POST /v1/studio/creatives/{id}/review/threads` — comment threads (`reviewThreads`, `createReviewThread`);
 *                                                 `…/{threadId}/replies|resolve|reopen`, `DELETE …/review/comments/{commentId}`
 *   `DELETE /v1/studio/creatives/{id}`
 *
 * Everything but `render`, `comment` / `variants` (token-metered `codai` calls; variants also queue draft renders)
 * and frames beyond the daily free quota is free. `render` queues a `codai-render`
 * (HTTP 202; poll it with `renders.retrieve`) or returns an identical existing render (HTTP 200, `cached: true`).
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import {
  type Body,
  type Mutable,
  type QueryOf,
  type Reply,
  type Schema,
  stripUndefined,
} from './_shared';
import {
  type ExportFcpxmlQuery,
  type ExportLottieQuery,
  type LottieDownload,
  type StudioExport,
} from './exports';

export type CreativeKind = Schema<'CreativeKind'>;
export type CreativeDoc = Mutable<Schema<'CreativeDoc'>>;
export type CreativeOp = Mutable<Schema<'CreativeOp'>>;
export type CreativeCreateRequest = Mutable<Body<'createCreative'>>;
export type Creative = Reply<'createCreative', 201>;
export type CreativeDetail = Reply<'getCreative'>;
export type CreativeList = Reply<'listCreatives'>;
export type CreativeListQuery = QueryOf<'listCreatives'>;
export type CreativeOutline = Reply<'getCreativeOutline'>;
export type CreativeFindRequest = Mutable<Body<'findCreativeNodes'>>;
export type CreativeFindResult = Reply<'findCreativeNodes'>;
export type CreativeSubtreeRequest = Mutable<Body<'getCreativeSubtree'>>;
export type CreativeSubtree = Reply<'getCreativeSubtree'>;
export type CreativeOpsResult = Reply<'applyCreativeOps'>;
export type CreativeVersionList = Reply<'listCreativeVersions'>;
export type CreativeVersionListQuery = QueryOf<'listCreativeVersions'>;
export type CreativeRevertResult = Reply<'revertCreative'>;
export type CreativeForkRequest = Mutable<Body<'forkCreative'>>;
export type CreativeLintResult = Reply<'lintCreative'>;
export type CreativeCompiled = Reply<'getCreativeCompiled'>;
export type CreativeRenderRequest = Mutable<Body<'renderCreative'>>;
export type CreativeRenderAccepted = Reply<'renderCreative', 202>;
export type CreativeRenderCached = Reply<'renderCreative', 200>;
/** `render` answer: a new queued render (202, `cached: false`) or the identical existing one (200, `cached: true`). */
export type CreativeRenderResult = CreativeRenderAccepted | CreativeRenderCached;
export type CreativeFrameRequest = Mutable<Body<'createCreativeFrame'>>;
export type CreativeFrame = Schema<'CreativeFrame'>;
export type CreativeFrames = Reply<'createCreativeFrame', 200>;
export type CreativeFrameJob = Reply<'createCreativeFrame', 202>;
/** `frame` / `frameJob` answer: frames ready (`status: succeeded`) or a running job to poll (`status: running`). */
export type CreativeFrameResult = CreativeFrames | CreativeFrameJob;
export type CreativeDeleted = Reply<'deleteCreative'>;
export type CreativeCommentRequest = Mutable<Body<'commentCreative'>>;
export type CreativeCommentResult = Reply<'commentCreative'>;
export type CreativeVariantsRequest = Mutable<Body<'createCreativeVariants'>>;
export type CreativeVariantsResult = Reply<'createCreativeVariants'>;
export type CreativeVariant = Schema<'CreativeVariant'>;
export type CreativeVariantList = Reply<'listCreativeVariants'>;
export type CreativeVariantPickRequest = Mutable<Body<'pickCreativeVariant'>>;
export type CreativeVariantPickResult = Reply<'pickCreativeVariant'>;
export type SaveTemplateRequest = Mutable<Body<'saveCreativeTemplate'>>;
export type CreativeTemplate = Schema<'CreativeTemplate'>;
/** `fromDocument` answer: the creative (`existing: false`, HTTP 201) or the one already linked (`existing: true`, 200). */
export type StudioCreativeFromDocument = Schema<'StudioCreativeFromDocument'>;
export type CreativeBuildRequest = Mutable<Schema<'CreativeBuildRequest'>>;
export type StudioCreativeBuild = Schema<'StudioCreativeBuild'>;
/** `{ brand_kit_id }` or `{ tokens }` (exactly one) + optional `base_seq`, `snap`, `fonts`, `force`. */
export type CreativeRestyleRequest = Mutable<Body<'restyleCreative'>>;
/** Same shape as the `edit` answer (`seq`, `doc_hash`, `changed`, `warnings`, `rebased`). */
export type CreativeRestyleResult = Reply<'restyleCreative'>;
export type CaptionPresetId = Schema<'CaptionPresetId'>;
export type PlatformId = Schema<'PlatformId'>;
export type CreativeLintCode = Schema<'CreativeLintCode'>;
export type LintIssue = Schema<'CreativeLintIssue'>;
/** Optional `clip_id`, `preset`, `node_id`, `script`, `language`, `retranscribe`, `base_seq`, `force`. */
export type CreativeCaptionsRequest = Mutable<Schema<'CreativeCaptionsRequest'>>;
/** The `edit` answer plus `node_id`, `words`, `cached`, `corrected`, `cost_micro_usd`. */
export type CreativeCaptionsResult = Schema<'CreativeCaptionsResult'>;
export type CreativeCaptionsQuery = { node_id?: string; seq?: number; locale?: string };
/** `platforms` (1..6) + optional `focal` (`none` | `vision`), `base_seq`, `force`. */
export type CreativeAdaptRequest = Mutable<Schema<'CreativeAdaptRequest'>>;
/** The `edit` answer plus `formats` and `focal`. */
export type CreativeAdaptResult = Schema<'CreativeAdaptResult'>;
/** Optional `codes`, `agent`, `base_seq`, `force`. */
export type CreativeLintFixRequest = Mutable<Schema<'CreativeLintFixRequest'>>;
export type CreativeLintFixResult = Schema<'CreativeLintFixResult'>;
/** A tweak panel control (`doc.meta.controls[varKey]`), set with a `setControl` op. */
export type CreativeControl = Mutable<Schema<'Control'>>;
export type PanelControl = Schema<'PanelControl'>;
export type CreativeControls = Reply<'getCreativeControls'>;
export type CreativeLocaleStatus = Schema<'CreativeLocaleStatus'>;
export type CreativeLocaleUnit = Schema<'CreativeLocaleUnit'>;
export type CreativeLocalesQuery = QueryOf<'getCreativeLocales'>;
/** `locales` (1..10) + optional `base_seq`, `tone`, `glossary`, `only_missing`, `voice`, `force`. */
export type CreativeLocalizeRequest = Mutable<Schema<'CreativeLocalizeRequest'>>;
/** The `edit` answer plus `locales` (per-locale summary) and `cost_micro_usd`. */
export type CreativeLocalizeResult = Schema<'CreativeLocalizeResult'>;
/** Optional `title` and `seq`. */
export type CreativeLocaleForkRequest = Mutable<Schema<'CreativeLocaleForkRequest'>>;
/** The new creative plus `locale` and `fork_of`. */
export type CreativeLocaleForkResult = Schema<'CreativeLocaleForkResult'>;
/** `kind` (`view` | `review`) + optional `label`, `expires_in_days`, `seq` / `allow_remix` (view), `can_approve` (review). */
export type StudioShareCreateRequest = Mutable<Schema<'StudioShareCreateRequest'>>;
/** The new link with its `token` and public `url` — shown only once. */
export type StudioShareCreated = Schema<'StudioShareCreated'>;
/** An active link (`url` is always null: the token is stored hashed). */
export type StudioShare = Schema<'StudioShare'>;
export type StudioShareList = Schema<'StudioShareList'>;
export type StudioReviewStatus = Schema<'StudioReviewStatus'>;
export type StudioReview = Schema<'StudioReview'>;
export type StudioReviewComment = Schema<'StudioReviewComment'>;
/** A thread: anchor (`node_id`, `scene_id`, `t_ms`), `status`, and `comments` (root first). */
export type StudioReviewThread = Schema<'StudioReviewThread'>;
export type StudioReviewThreadList = Schema<'StudioReviewThreadList'>;
/** `body` (1..2000) + optional anchor `node_id`, `scene_id`, `t_ms`. */
export type StudioReviewThreadCreateRequest = Mutable<Schema<'StudioReviewThreadCreateRequest'>>;
export type StudioReviewThreadsQuery = { status?: 'open' | 'resolved' | 'all' };
/** Optional `locale`: lint the document translated into it. */
export type CreativeLintRequest = { locale?: string };
export type CreativeCompiledQuery = { format?: string; scene?: string; locale?: string };

/** Body of `edit` (camelCase; sent as `base_seq` / `ops` / `intent` / `author` / `force`). */
export interface CreativeEditRequest {
  /** The version the ops were authored against (`head_seq` of what you read). */
  baseSeq: number;
  ops: CreativeOp[];
  /** Why — shown in the version history. */
  intent?: string;
  author?: 'user' | 'agent';
  /** Bypass locked nodes and variables. */
  force?: boolean;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const path = (id: string, tail = '') => `/v1/studio/creatives/${encodeURIComponent(id)}${tail}`;
const lottieQuery = (q: ExportLottieQuery) => ({
  format: q.format,
  formats: q.formats,
  seq: q.seq,
  container: q.container,
});

export class Creatives {
  constructor(private readonly http: HttpClient) {}

  /** List your creatives, most recently updated first (`next_before` pages). */
  list(query: CreativeListQuery = {}, opts: CallOpts = {}): Promise<CreativeList> {
    return this.http.json<CreativeList>('/v1/studio/creatives', {
      query: { kind: query.kind, before: query.before, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Create a creative (`kind` + optional `title` / `doc`); without `doc` you get an empty document for the kind.
   * `brand_kit_id` applies one of your brand kits (`brandKits`) to version 1: `brand = { kitId, tokens }` + its logo.
   * `template` (+ `vars`, values by var key) starts from one of your templates (`templates`) instead of `doc`.
   */
  create(body: CreativeCreateRequest, opts: CallOpts = {}): Promise<Creative> {
    return this.http.json<Creative>('/v1/studio/creatives', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** The document at the head (or `seq`) with signed `assets` (1 h URLs). */
  retrieve(id: string, query: { seq?: number } = {}, opts: CallOpts = {}): Promise<CreativeDetail> {
    return this.http.json<CreativeDetail>(path(id), {
      query: { seq: query.seq },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Compact text outline (+ formats and vars) — the cheapest structure for a prompt. */
  outline(id: string, opts: CallOpts = {}): Promise<CreativeOutline> {
    return this.http.json<CreativeOutline>(path(id, '/outline'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Node ids matching `query` (a string = text/name/id substring, or `{ text, type, sceneId, assetId, locked }`). */
  find(
    id: string,
    query: CreativeFindRequest['query'],
    opts: CallOpts = {},
  ): Promise<CreativeFindResult> {
    return this.http.json<CreativeFindResult>(path(id, '/find'), {
      method: 'POST',
      body: { query },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Full JSON of `ids` (scene ids return whole scenes) or of one `sceneId`. */
  subtree(id: string, body: CreativeSubtreeRequest, opts: CallOpts = {}): Promise<CreativeSubtree> {
    return this.http.json<CreativeSubtree>(path(id, '/subtree'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Apply an op batch (all or nothing) authored against `baseSeq`. A stale base is rebased when the touched
   * targets did not change meanwhile; otherwise the call throws `CodaiError` 409 `stale` (reload and retry). Rejected
   * ops throw 400 with `code` (`invalid`, `not_found`, `locked`, `duplicate_id`).
   */
  edit(id: string, body: CreativeEditRequest, opts: CallOpts = {}): Promise<CreativeOpsResult> {
    return this.http.json<CreativeOpsResult>(path(id, '/ops'), {
      method: 'POST',
      body: {
        base_seq: body.baseSeq,
        ops: body.ops,
        ...(body.intent !== undefined ? { intent: body.intent } : {}),
        ...(body.author !== undefined ? { author: body.author } : {}),
        ...(body.force !== undefined ? { force: body.force } : {}),
      },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Version history, newest first (`beforeSeq` pages). */
  versions(
    id: string,
    query: { beforeSeq?: number; limit?: number } = {},
    opts: CallOpts = {},
  ): Promise<CreativeVersionList> {
    return this.http.json<CreativeVersionList>(path(id, '/versions'), {
      query: { before_seq: query.beforeSeq, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** New head whose document is version `seq`'s (undo / redo). */
  revert(id: string, seq: number, opts: CallOpts = {}): Promise<CreativeRevertResult> {
    return this.http.json<CreativeRevertResult>(path(id, '/revert'), {
      method: 'POST',
      body: { seq },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** New creative from version `seq` (default the head). */
  fork(id: string, body: CreativeForkRequest = {}, opts: CallOpts = {}): Promise<Creative> {
    return this.http.json<Creative>(path(id, '/fork'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Soft-delete the creative. */
  delete(id: string, opts: CallOpts = {}): Promise<CreativeDeleted> {
    return this.http.json<CreativeDeleted>(path(id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Contrast, safe area, empty text, missing assets, brand colours, platform safe zones and text floors, alt text,
   * missing captions, reading speed, flashing, missing / stale translations. Issues carry `format` / `fixable` /
   * `locale`; `fixable` counts them (`lintFix`). `locale` lints the translated document (adds
   * `text_overflow_locale`); 404 `Locale not found.` for an unknown locale.
   */
  lint(
    id: string,
    body: CreativeLintRequest = {},
    opts: CallOpts = {},
  ): Promise<CreativeLintResult> {
    return this.http.json<CreativeLintResult>(path(id, '/lint'), {
      method: 'POST',
      ...(body.locale !== undefined ? { body: { locale: body.locale } } : {}),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Preview HTML (signed asset URLs) for `format` / one `scene` / a translation (`locale`). */
  compiled(
    id: string,
    query: CreativeCompiledQuery = {},
    opts: CallOpts = {},
  ): Promise<CreativeCompiled> {
    return this.http.json<CreativeCompiled>(path(id, '/compiled'), {
      query: { format: query.format, scene: query.scene, locale: query.locale },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Queue an MP4 render of the head (`codai-render`, HTTP 202, `cached: false`); poll `renders.retrieve(render_id)`.
   * When the same render already exists for this version / format / quality / fps you get it back at once
   * (HTTP 200, `cached: true`, `status: 'succeeded'`, no new charge). Unchanged scenes are reused either way.
   * `locale` renders a translation (404 `Locale not found.` when the creative has no such locale).
   * `ai_label` (`none` | `corner` | `end_card`, EU AI Act art. 50(4)) burns a visible AI label into the video; omitted =
   * `corner` when the creative uses TTS narration or AI images, else `none` (`none` with narration: 400 `ai_label_required`).
   */
  render(
    id: string,
    body: CreativeRenderRequest = {},
    opts: CallOpts = {},
  ): Promise<CreativeRenderResult> {
    return this.http.json<CreativeRenderResult>(path(id, '/render'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * PNG still frames at up to 6 times (`t_ms`). `exact: false` (default) screenshots the compiled HTML; `exact: true`
   * cuts them from a draft render of the covering scenes. Waits up to ~90 s: frames (`status: 'succeeded'`) or a
   * running job (`status: 'running'`) to poll with `frameJob(id, frame_job_id)`. Cached frames are free; 60 frame
   * jobs per UTC day are free, then billed (`billed_micro_usd`).
   */
  frame(id: string, body: CreativeFrameRequest, opts: CallOpts = {}): Promise<CreativeFrameResult> {
    return this.http.json<CreativeFrameResult>(path(id, '/frame'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Turn a comment pinned on a frame (`t_ms`, optional `node_id` / `scene_id`) into an edit: one bounded `codai`
   * model turn proposes ops, applied like `edit` against `base_seq` (rebased when possible, 409 `stale` else).
   * 422 `no_edit` when the model made no edit (its answer in `error.text`); `apply: false` only proposes the ops.
   * Token-metered like any `codai` text call.
   */
  comment(
    id: string,
    body: CreativeCommentRequest,
    opts: CallOpts = {},
  ): Promise<CreativeCommentResult> {
    return this.http.json<CreativeCommentResult>(path(id, '/comments'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Generate A/B variants: one bounded `codai` model turn proposes `count` (default 3) variants changing only
   * `focus` (default hook / title / cta); each becomes a fork of the creative at `base_seq` with the ops applied, plus
   * a queued draft render (`render: false` to skip; poll `renders.retrieve(render_id)`). The original is unchanged
   * until `pickVariant`. 422 `no_edit` when no valid variant came back, 504 `timeout` after 90 s. Token-metered.
   */
  variants(
    id: string,
    body: CreativeVariantsRequest,
    opts: CallOpts = {},
  ): Promise<CreativeVariantsResult> {
    return this.http.json<CreativeVariantsResult>(path(id, '/variants'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** The latest variant group of a creative (`group_id: null` when none) with statuses and stored render state. */
  listVariants(id: string, opts: CallOpts = {}): Promise<CreativeVariantList> {
    return this.http.json<CreativeVariantList>(path(id, '/variants'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Pick the winner: its ops are applied to the original against `base_seq` (rebased when possible, 409 `stale`
   * else); the winner is marked `winner`, the rest of its group `rejected`.
   */
  pickVariant(
    id: string,
    variantId: string,
    body: CreativeVariantPickRequest,
    opts: CallOpts = {},
  ): Promise<CreativeVariantPickResult> {
    return this.http.json<CreativeVariantPickResult>(
      path(id, `/variants/${encodeURIComponent(variantId)}/pick`),
      { method: 'POST', body, ext: opts.ext, signal: opts.signal, noRetry: true },
    );
  }

  /**
   * Save the creative (at `seq`, default the head) as a private template: each `vars` entry turns a text node's text
   * (`prop: 'text'`) or an image node's asset (`prop: 'image'`) into a variable whose default is the current value.
   * 400 `node_not_found` / `invalid_pick` / `duplicate_key`. Free.
   */
  saveTemplate(
    id: string,
    body: SaveTemplateRequest,
    opts: CallOpts = {},
  ): Promise<CreativeTemplate> {
    return this.http.json<CreativeTemplate>(path(id, '/template'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Queue an FCPXML export of a video creative (`seq`, default the head; `format`, default the first 1920×1080 /
   * 1080×1920 / 1080×1080 format): a zip with `project.fcpxml` + per-scene MP4 segments + audio, for Final Cut Pro,
   * DaVinci Resolve or Premiere. Resolves to the queued export; poll it with `exports.wait(e.id)`. Only newly
   * rendered seconds are billed (final render price). 400 `unsupported_kind` / `unsupported_format` / `too_long`.
   */
  exportFcpxml(
    id: string,
    query: ExportFcpxmlQuery = {},
    opts: CallOpts = {},
  ): Promise<StudioExport> {
    return this.http.json<StudioExport>(path(id, '/export.fcpxml'), {
      query: { format: query.format, seq: query.seq },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Export a video creative as a Lottie animation (`seq`, default the head; `format`, default the document's default
   * format, or `formats: 'all'`; `container: 'json'` (default, Bodymovin JSON with embedded images) or `'dotlottie'`).
   * Free and synchronous: resolves to an export that is already `succeeded` with a signed `url` (valid 1 h) and the
   * fidelity report in `warnings` (video, chart, HTML block, table, cell grid and audio nodes are not exported).
   * 400 `unsupported_kind` / `invalid_request`, 413 `too_large` (over 20 MB).
   */
  exportLottie(
    id: string,
    query: ExportLottieQuery = {},
    opts: CallOpts = {},
  ): Promise<StudioExport> {
    return this.http.json<StudioExport>(path(id, '/export.lottie'), {
      query: lottieQuery(query),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * The Lottie file itself (`download=1`, nothing stored): `application/json` for one Bodymovin JSON, `application/zip`
   * for a dotLottie archive or a zip of JSON files (`formats: 'all'`). Same options and errors as `exportLottie`. Free.
   */
  async downloadLottie(
    id: string,
    query: ExportLottieQuery = {},
    opts: CallOpts = {},
  ): Promise<LottieDownload> {
    const res = await this.http.request(path(id, '/export.lottie'), {
      query: { ...lottieQuery(query), download: '1' },
      ext: opts.ext,
      signal: opts.signal,
    });
    const m = /filename="([^"]+)"/i.exec(res.headers.get('content-disposition') ?? '');
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      filename: m ? m[1]! : null,
      contentType: res.headers.get('content-type'),
    };
  }

  /**
   * Turn one of your Studio documents (deck, doc, sheet) into an editable creative — slides become scenes with a
   * `layout` and speaker `notes`, doc pages a `flow` group, sheets a `cell_grid`; nodes carry semantic `role`s.
   * Idempotent: a document that already has a creative resolves to it (`existing: true`). Free. 404 unknown document,
   * 409 `document_spec_missing`, 400 `invalid_spec`, 413 `too_large`.
   */
  fromDocument(documentId: string, opts: CallOpts = {}): Promise<StudioCreativeFromDocument> {
    return this.http.json<StudioCreativeFromDocument>(
      `/v1/studio/documents/${encodeURIComponent(documentId)}/creative`,
      { method: 'POST', ext: opts.ext, signal: opts.signal, noRetry: true },
    );
  }

  /**
   * Build a deck / doc / sheet creative (at `seq`, default the head) into a PPTX / DOCX / XLSX — a new version of its
   * Studio document (`document`, exactly the `POST /v1/studio/documents` body). Converter notes come back in
   * `warnings`. The file is free; `preview: true` also queues a billed preview (poll it with
   * `documents.waitForPreview`). 400 `not_supported_for_kind` (video / image) or `invalid_spec`.
   */
  build(
    id: string,
    body: CreativeBuildRequest = {},
    opts: CallOpts = {},
  ): Promise<StudioCreativeBuild> {
    return this.http.json<StudioCreativeBuild>(path(id, '/build'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Re-apply a brand kit (`brand_kit_id`) or a flat token map (`tokens`) to the creative as one new version: literal
   * colours equal to the old brand become token refs, `snap: true` maps every other colour to the nearest kit colour,
   * `fonts` (default true) sets heading / body font refs by role, locked nodes are skipped unless `force`. The kit
   * logo is registered too. `base_seq` defaults to the head (rebased like `edit`, 409 `stale` else). Free.
   */
  restyle(
    id: string,
    body: CreativeRestyleRequest,
    opts: CallOpts = {},
  ): Promise<CreativeRestyleResult> {
    return this.http.json<CreativeRestyleResult>(path(id, '/restyle'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Auto-captions: transcribe a voice clip (`clip_id`, default the first voice clip) word by word and add or update a
   * captions node (`preset`, default `bold-pill`) as one new version. Words are cached on the asset (free next time
   * unless `retranscribe`); `script` (default the narration of a codai speech asset) corrects the spelling. A fresh
   * transcription is billed at the speech-to-text rate (`cost_micro_usd`). Video creatives only (400
   * `unsupported_kind`); 403 `residency_unavailable`, 503 `transcription_unavailable`.
   */
  captions(
    id: string,
    body: CreativeCaptionsRequest = {},
    opts: CallOpts = {},
  ): Promise<CreativeCaptionsResult> {
    return this.http.json<CreativeCaptionsResult>(path(id, '/captions'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** The captions as SubRip text on the document timeline (`node_id`, `seq` optional); 404 without captions. Free. */
  async captionsSrt(
    id: string,
    query: CreativeCaptionsQuery = {},
    opts: CallOpts = {},
  ): Promise<string> {
    const res = await this.http.request(path(id, '/captions.srt'), {
      query: { node_id: query.node_id, seq: query.seq, locale: query.locale },
      ext: opts.ext,
      signal: opts.signal,
    });
    return res.text();
  }

  /** The captions as WebVTT text on the document timeline (`node_id`, `seq` optional); 404 without captions. Free. */
  async captionsVtt(
    id: string,
    query: CreativeCaptionsQuery = {},
    opts: CallOpts = {},
  ): Promise<string> {
    const res = await this.http.request(path(id, '/captions.vtt'), {
      query: { node_id: query.node_id, seq: query.seq, locale: query.locale },
      ext: opts.ext,
      signal: opts.signal,
    });
    return res.text();
  }

  /**
   * Adapt to platforms (`tiktok`, `reels`, `shorts`, `feed-square`, `feed-portrait`, `youtube`): one format per
   * platform in one new version, text kept inside each platform's safe zone and above its legible size.
   * `focal: 'vision'` (token-metered) finds the focal point of full-bleed images; it fails open. Free otherwise.
   */
  adapt(id: string, body: CreativeAdaptRequest, opts: CallOpts = {}): Promise<CreativeAdaptResult> {
    return this.http.json<CreativeAdaptResult>(path(id, '/adapt'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Fix lint issues as one new version: deterministic fixes (free) for `off_brand_color`, `text_too_small`,
   * `outside_platform_safe_zone` and `flashing` (`codes` limits them); `agent: true` (token-metered) gives the rest
   * to one `codai` turn. Nothing to fix: the current `seq`, empty `fixed`, no new version.
   */
  lintFix(
    id: string,
    body: CreativeLintFixRequest = {},
    opts: CallOpts = {},
  ): Promise<CreativeLintFixResult> {
    return this.http.json<CreativeLintFixResult>(path(id, '/lint/fix'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * The tweak panel model: one control per variable (stored `meta.controls` entry or derived from the type). Change
   * values with a `setVar` op and controls with a `setControl` op (`edit`). Free.
   */
  controls(id: string, opts: CallOpts = {}): Promise<CreativeControls> {
    return this.http.json<CreativeControls>(path(id, '/controls'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Localisation state: source locale, glossary, unit count and per locale translated / missing / stale / voice.
   * With `locale` (+ `units`, default 1) also the units of that locale (paged with `offset` / `limit` ≤ 500). Free.
   */
  locales(
    id: string,
    query: CreativeLocalesQuery = {},
    opts: CallOpts = {},
  ): Promise<CreativeLocaleStatus> {
    return this.http.json<CreativeLocaleStatus>(path(id, '/locales'), {
      query: { locale: query.locale, units: query.units, offset: query.offset, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Translate every text into up to 10 BCP-47 `locales` as per-locale overrides (one new version, author `agent`).
   * Token-metered `codai` turns; `glossary` terms and the brand kit name stay verbatim, `tone` picks the address,
   * `only_missing` (default true) skips fresh translations, `voice: true` (video, billed) narrates voice clips again.
   * 400 `nothing_to_translate`; 503 `localize_unavailable` when every locale failed.
   */
  localize(
    id: string,
    body: CreativeLocalizeRequest,
    opts: CallOpts = {},
  ): Promise<CreativeLocalizeResult> {
    return this.http.json<CreativeLocalizeResult>(path(id, '/localize'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Save `locale` as a new standalone creative (translations applied, overrides dropped, `fork_of` recorded; default
   * title `<title> (<locale>)`). 404 `Locale not found.`. Free (HTTP 201).
   */
  forkLocale(
    id: string,
    locale: string,
    body: CreativeLocaleForkRequest = {},
    opts: CallOpts = {},
  ): Promise<CreativeLocaleForkResult> {
    return this.http.json<CreativeLocaleForkResult>(
      path(id, `/locales/${encodeURIComponent(locale)}/fork`),
      {
        method: 'POST',
        body: stripUndefined(body),
        ext: opts.ext,
        signal: opts.signal,
        noRetry: true,
      },
    );
  }

  /**
   * Create a public link: `view` (read-only preview of version `seq` or the head; `allow_remix` default false) or
   * `review` (comments by name, no account; `can_approve` lets the holder approve). The `token` and `url` are shown
   * only in this answer (HTTP 201). 400 `unknown_seq`; 409 `too_many_shares` (20 active links). Free.
   */
  createShare(
    id: string,
    body: StudioShareCreateRequest,
    opts: CallOpts = {},
  ): Promise<StudioShareCreated> {
    return this.http.json<StudioShareCreated>(path(id, '/shares'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** The active links (not revoked, not expired), newest first; `url` is always null. Free. */
  listShares(id: string, opts: CallOpts = {}): Promise<StudioShareList> {
    return this.http.json<StudioShareList>(path(id, '/shares'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Revoke a link: it answers 404 from now on. 404 when unknown or already revoked. Free. */
  async revokeShare(id: string, shareId: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(path(id, `/shares/${encodeURIComponent(shareId)}`), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * The review state: `status` (`draft` → `in_review` → `approved` | `changes_requested`), requested / approved
   * version (`approved_is_head` false once the creative changed), decider and thread counts. Free.
   */
  review(id: string, opts: CallOpts = {}): Promise<StudioReview> {
    return this.http.json<StudioReview>(path(id, '/review'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Send the head to review (`in_review`, earlier decision cleared) so approver links can decide. Free. */
  requestReview(id: string, opts: CallOpts = {}): Promise<StudioReview> {
    return this.http.json<StudioReview>(path(id, '/review'), {
      method: 'POST',
      body: { action: 'request' },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Back to `draft` (decision cleared, comments kept). Free. */
  resetReview(id: string, opts: CallOpts = {}): Promise<StudioReview> {
    return this.http.json<StudioReview>(path(id, '/review'), {
      method: 'POST',
      body: { action: 'reset' },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Comment threads, newest first (≤ 200), replies oldest first; `status` `open` | `resolved` | `all`. Free. */
  reviewThreads(
    id: string,
    query: StudioReviewThreadsQuery = {},
    opts: CallOpts = {},
  ): Promise<StudioReviewThreadList> {
    return this.http.json<StudioReviewThreadList>(path(id, '/review/threads'), {
      query: { status: query.status },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Start a thread as the owner, optionally anchored to `node_id` / `scene_id` / `t_ms` (checked against the head:
   * 400 `unknown_node` / `unknown_scene`; HTTP 201). 409 `too_many_comments`. Free.
   */
  createReviewThread(
    id: string,
    body: StudioReviewThreadCreateRequest,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(path(id, '/review/threads'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Reply in a thread as the owner (HTTP 201) — returns the whole thread. Free. */
  replyReviewThread(
    id: string,
    threadId: string,
    body: { body: string },
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(
      path(id, `/review/threads/${encodeURIComponent(threadId)}/replies`),
      {
        method: 'POST',
        body: { body: body.body },
        ext: opts.ext,
        signal: opts.signal,
        noRetry: true,
      },
    );
  }

  /** Resolve a thread. Free. */
  resolveReviewThread(
    id: string,
    threadId: string,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(
      path(id, `/review/threads/${encodeURIComponent(threadId)}/resolve`),
      { method: 'POST', ext: opts.ext, signal: opts.signal },
    );
  }

  /** Reopen a resolved thread. Free. */
  reopenReviewThread(
    id: string,
    threadId: string,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(
      path(id, `/review/threads/${encodeURIComponent(threadId)}/reopen`),
      { method: 'POST', ext: opts.ext, signal: opts.signal },
    );
  }

  /** Delete any comment (owner moderation; deleting a root hides the thread). 404 when unknown. Free. */
  async deleteReviewComment(id: string, commentId: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(path(id, `/review/comments/${encodeURIComponent(commentId)}`), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Poll a frame job: frames when done (`status: 'succeeded'`), `status: 'running'` meanwhile; 404 unknown job. */
  frameJob(id: string, jobId: string, opts: CallOpts = {}): Promise<CreativeFrameResult> {
    return this.http.json<CreativeFrameResult>(path(id, `/frames/${encodeURIComponent(jobId)}`), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
