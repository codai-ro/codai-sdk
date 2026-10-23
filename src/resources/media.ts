/**
 * codai Studio media lanes (US-only, English prompts; refused for EU data-residency keys).
 *
 *   `POST /v1/audio/music`  — `codai-music` (Lyria 3 Clip, 30 s MP3 with vocals/lyrics), `codai-music-pro`
 *                             (Lyria 3 Pro, full song up to 184 s), `codai-music-legacy` (Lyria 2, 30 s instrumental WAV).
 *   `POST /v1/videos`       — Veo 3.1 Fast: starts a job (HTTP 202).
 *   `GET  /v1/videos/{id}`  — polls the job; the MP4 is returned (and billed once) when it succeeds.
 *   `POST /v1/studio/renders`      — `codai-render`: renders a HyperFrames HTML composition to MP4 (HTTP 202).
 *   `GET  /v1/studio/renders/{id}` — polls the render; the MP4 asset is returned (and billed once) when it succeeds.
 *   `GET  /v1/studio/renders`      — lists renders (no polling, no URLs); `root_render_id` = one timeline's versions.
 *   `POST /v1/studio/timelines`    — renders a list of image/video scenes (optional narration + music), HTTP 202.
 *   `POST /v1/studio/renders/{id}/scenes/{sceneId}/regenerate` — new render with one timeline scene replaced (202).
 *
 * `response_format: 'url'` (music body, video poll query) returns stored assets with 1 h signed URLs (`assets`)
 * instead of base64 bytes; the default `b64_json` shape is unchanged. Wire types are declared here.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type AssetDto, type MediaResponseFormat, isAssetDto } from './assets';

export interface MusicRequest {
  /** `codai-music` (default, Lyria 3 Clip), `codai-music-pro` (Lyria 3 Pro) or `codai-music-legacy` (Lyria 2). */
  model?: 'codai-music' | 'codai-music-pro' | 'codai-music-legacy' | (string & {});
  /** Music description (genre, mood, instruments; no artist names). English is most reliable. */
  prompt: string;
  /** Lyrics to sing exactly (Lyria 3, <= 3000 chars). Non-English lyrics are best effort (see `lyrics_match`). */
  lyrics?: string;
  /** Instrumental only, no vocals (Lyria 3). */
  instrumental?: boolean;
  /** Target tempo, 40-220 (Lyria 3). */
  bpm?: number;
  /** Target length 10-184 s; `codai-music-pro` only (`codai-music` is always ~30 s). */
  duration_seconds?: number;
  /** Lyrics language hint, e.g. `ro`. */
  language?: string;
  /** `codai-music-legacy` only (400 for Lyria 3). */
  negative_prompt?: string;
  /** `codai-music-legacy` only (400 for Lyria 3). A seed forces a single clip. */
  seed?: number;
  /** Number of clips, 1-4; more than 1 only with `codai-music-legacy` (ignored when `seed` is set). */
  n?: number;
  /** `b64_json` (default) or `url` — store each clip as an asset and return signed URLs in `assets`. */
  response_format?: MediaResponseFormat;
}

/** Extra per-item fields returned by the Lyria 3 models (also present on `AssetDto` items). */
export interface MusicTrackMeta {
  /** Lyrics as sung, with `[start:end]` timing per line (Lyria 3 only). */
  lyrics?: string | null;
  /** The model's description of the track (may include `bpm` / `duration_secs`). */
  caption?: string | null;
  /** 0..1 match between the supplied `lyrics` and the sung words; `null` when not checked. */
  lyrics_match?: number | null;
  /** e.g. `lyrics_mismatch`, `lyrics_check_unavailable`. */
  warnings?: string[];
}

export interface MusicClip extends MusicTrackMeta {
  b64_json: string;
  mime_type: string;
  duration_seconds: number;
  sample_rate?: number;
}

export interface MusicResponse {
  created: number;
  model: string;
  /** `MusicClip` items by default; `AssetDto` items with `response_format: 'url'`. */
  data: Array<MusicClip | (AssetDto & MusicTrackMeta)>;
}

export interface MusicResult {
  /** Decoded audio bytes (MP3 for Lyria 3, WAV for legacy), one per clip. Empty with `response_format: 'url'`. */
  clips: Uint8Array[];
  /** MIME type of each clip (`audio/mpeg` or `audio/wav`). */
  mimeTypes: string[];
  /** Stored assets with signed URLs (`response_format: 'url'` only; empty otherwise). */
  assets: AssetDto[];
  /** Per-item lyrics / caption / lyrics_match / warnings, in `data` order. */
  tracks: MusicTrackMeta[];
  /** All warnings across items (deduplicated), e.g. `lyrics_mismatch`. */
  warnings: string[];
  raw: MusicResponse;
  /** Upstream model (`x-codai-routed-to`). */
  routedTo: string | null;
  /** Charge in micro-USD (`x-codai-cost-micro-usd`). */
  costMicroUsd: number | null;
  headers: Headers;
}

export interface VideoRequest {
  model?: string;
  /** English prompt. */
  prompt: string;
  negative_prompt?: string;
  seconds?: 4 | 6 | 8;
  aspect_ratio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  /** Generate an audio track (default true). */
  audio?: boolean;
  /** Optional first frame (image-to-video); forces 8 s. */
  image?: { b64_json: string; mime_type?: 'image/png' | 'image/jpeg' };
  /**
   * Up to 3 of your ready PNG / JPEG Studio image assets showing ONE subject (character or product) that the model
   * keeps consistent (e.g. a creative's cast `refAssetIds`). Not combinable with `image`; always 8 s. A missing or
   * foreign asset is 404, another type 400 — checked before anything is held or charged.
   */
  reference_asset_ids?: string[];
  seed?: number;
}

export interface VideoJob {
  id: string;
  object: 'video.job';
  status: 'running';
  model: string;
  seconds: number;
  /** Price of the job in micro-USD (string, bigint-safe). */
  estimated_cost_micro_usd: string;
}

export type VideoStatus = 'running' | 'succeeded' | 'failed' | 'filtered';

export interface VideoJobStatus {
  id: string;
  object: 'video.job';
  status: VideoStatus;
  error?: string;
  model?: string;
  seconds?: number;
  /** Inline MP4 by default; one `AssetDto` when polled with `responseFormat: 'url'`. */
  data?: Array<{ b64_json: string; mime_type: string } | AssetDto>;
}

export interface VideoResult {
  /** Decoded MP4 bytes. Empty with `responseFormat: 'url'` (use `asset.url`). */
  video: Uint8Array;
  mimeType: string;
  id: string;
  seconds: number | null;
  /** The stored asset (`responseFormat: 'url'` only). */
  asset: AssetDto | null;
  raw: VideoJobStatus;
}

export type RenderAspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type RenderQuality = 'draft' | 'final';
export type RenderStatus = 'queued' | 'rendering' | 'succeeded' | 'failed';
/**
 * Visible AI label burned into the video (EU AI Act art. 50(4)): `corner` = small "AI-generated" label bottom-right
 * for the whole video, `end_card` = final ~2 s card with the label, `none` = nothing. Default: `corner` when the
 * render uses TTS narration or AI-generated images, else `none`; `none` with TTS narration is 400 `ai_label_required`.
 */
export type RenderAiLabel = 'none' | 'corner' | 'end_card';

export interface RenderRequest {
  /** Defaults to `codai-render`. */
  model?: string;
  /**
   * A complete HyperFrames composition (`index.html`, <= 2,000,000 chars). Reference Studio assets as
   * `asset:<asset_id>` in any `src` / `href` / `url(...)` (max 50 distinct assets).
   */
  html: string;
  /** HyperFrames composition variables. */
  variables?: Record<string, unknown>;
  /** Must match the root `data-width` / `data-height` (default `16:9`). */
  aspect_ratio?: RenderAspectRatio;
  /** `final` (default) or `draft` (15 fps, 540p short side, no loudness pass, half price). */
  quality?: RenderQuality;
  /** `final` only (default 30). */
  fps?: 24 | 25 | 30;
  title?: string;
  /** EU AI Act art. 50(4) label; omit for the default (`corner` with TTS narration or AI images, else `none`). */
  ai_label?: RenderAiLabel;
}

export interface RenderJob {
  id: string;
  object: 'studio.render';
  status: 'queued';
  model: string;
  quality: RenderQuality;
  aspect_ratio: RenderAspectRatio;
  fps: number;
  /** Micro-USD per output second (string, bigint-safe). */
  price_micro_usd_per_second: string;
  /** Minimum charge in micro-USD (string, bigint-safe). */
  minimum_micro_usd: string;
  /** The resolved AI label. */
  ai_label?: RenderAiLabel;
}

export interface RenderQa {
  duration_seconds: number;
  width: number;
  height: number;
  lufs: number | null;
  warnings: Array<'silent_audio' | 'no_audio' | 'lufs_off_target'>;
}

export interface RenderJobStatus {
  id: string;
  object: 'studio.render';
  status: RenderStatus;
  /** 0..1 */
  progress: number;
  quality: RenderQuality;
  aspect_ratio: RenderAspectRatio;
  fps: number;
  /** `<code>: <message>` when `failed`. */
  error: string | null;
  qa?: RenderQa | null;
  /** Charge in micro-USD (string), once succeeded. */
  cost_micro_usd?: string | null;
  /** The MP4 as one `AssetDto` (`kind: 'render'`), only when succeeded. */
  data?: AssetDto[];
  /** Signed JPEG poster URL, only when succeeded. */
  poster_url?: string | null;
  /** Worker stage while rendering; `generating_scene` while a regenerated video scene is generated (status `queued`). */
  stage?: string | null;
  title?: string | null;
  /** Timeline renders: the render this one was regenerated from. */
  parent_render_id?: string | null;
  /** Timeline renders: the original render of the version chain. */
  root_render_id?: string | null;
  /** Scenes of a timeline render; `null` for HTML and deck renders. */
  timeline?: RenderTimeline | null;
  /** The resolved AI label (EU AI Act art. 50(4)). */
  ai_label?: RenderAiLabel;
}

export type SceneKind = 'image' | 'video';
export type SceneFit = 'cover' | 'contain';

export interface SceneNarration {
  text: string;
  asset_id: string | null;
  seconds: number | null;
}

export interface TimelineScene {
  /** Stable id (`^[a-z0-9-]{1,32}$`); pass it to `regenerateScene`. */
  id: string;
  kind: SceneKind;
  asset_id: string;
  seconds: number;
  fit: SceneFit;
  /** Video scenes only. */
  video_volume?: number;
  prompt: string | null;
  narration: SceneNarration | null;
  revision: number;
  /** The visual (`url` signed only with `expandAssets`). */
  asset: AssetDto | null;
  /** The narration audio (`url` signed only with `expandAssets`). */
  narration_asset: AssetDto | null;
}

export interface RenderTimeline {
  transition: 'fade' | 'none';
  music: { asset_id: string; volume: number } | null;
  scenes: TimelineScene[];
}

export interface RenderListItem {
  id: string;
  object: 'studio.render';
  status: RenderStatus;
  title: string | null;
  quality: RenderQuality;
  aspect_ratio: RenderAspectRatio;
  fps: number;
  duration_seconds: number | null;
  /** Micro-USD (string); `"0"` until succeeded. */
  cost_micro_usd: string;
  created_at: string;
  parent_render_id: string | null;
  root_render_id: string | null;
  has_timeline: boolean;
  scene_count: number;
}

export interface RenderList {
  object: 'list';
  data: RenderListItem[];
  /** Pass as `before` for the next page; `null` on the last page. */
  next_before: string | null;
}

export interface TimelineSceneInput {
  /** Optional stable id, unique in the timeline (default `s1`…`sN`). */
  id?: string;
  kind: SceneKind;
  /** One of your ready image (kind `image`) or video (kind `video`) assets. */
  asset_id: string;
  /** 2..30 (default 5); a narrated scene lasts at least narration + 0.6 s. */
  seconds?: number;
  fit?: SceneFit;
  /** 0..1, video scenes only (default 1, or 0 when narrated). */
  video_volume?: number;
  /** Stored and reused by a later `regenerateScene` without a prompt. */
  prompt?: string;
  /** Narrated now (billed per call); not available for EU data-residency accounts. */
  narration?: { text: string; voice?: string; language?: string };
}

export interface TimelineRequest {
  /** Defaults to `codai-render`. */
  model?: string;
  title?: string;
  aspect_ratio?: RenderAspectRatio;
  quality?: RenderQuality;
  /** `final` only (default 30). */
  fps?: 24 | 25 | 30;
  /** Default `fade` (0.5 s crossfade). */
  transition?: 'fade' | 'none';
  /** One of your ready audio assets, played under the whole timeline. */
  music_asset_id?: string;
  /** 0..1 (default 0.126). */
  music_volume?: number;
  narration_defaults?: {
    model?: 'codai-speech' | 'codai-speech-expressive';
    voice?: string;
    /** BCP-47, default `ro-RO`. */
    language?: string;
    instructions?: string;
  };
  /** 1..30 scenes, at most 180 s in total. */
  scenes: TimelineSceneInput[];
}

export interface TimelineJob extends RenderJob {
  /** Narration already charged by this request, micro-USD (string). */
  narration_cost_micro_usd: string;
  scene_count: number;
  duration_seconds: number;
  /** Equal to `id`; regenerated versions keep it. */
  root_render_id: string;
}

export interface SceneRegenerateRequest {
  /** Reuse an owned image/video asset, or generate: `codai-image` (image scene) / `codai-video` 4|6|8 s (video scene). */
  visual?: { asset_id: string } | { prompt?: string; model?: string; seconds?: 4 | 6 | 8 };
  /** Reuse an owned audio asset, re-narrate (`text` omitted = stored text), or `null` to remove the narration. */
  narration?: { asset_id: string } | { text?: string; voice?: string } | null;
  quality?: RenderQuality;
}

export interface SceneRegenerateJob {
  id: string;
  object: 'studio.render';
  status: 'queued';
  parent_render_id: string;
  root_render_id: string;
  scene_id: string;
  /** Generation already charged (image, narration, video clip), micro-USD (string). */
  scene_cost_micro_usd: string;
  price_micro_usd_per_second: string;
  minimum_micro_usd: string;
  /** The resolved AI label of the new render. */
  ai_label?: RenderAiLabel;
}

export interface RenderResult {
  id: string;
  /** The stored MP4 (1 h signed `url`; refresh with `assets.retrieve(id)`). */
  asset: AssetDto;
  posterUrl: string | null;
  qa: RenderQa | null;
  costMicroUsd: number | null;
  raw: RenderJobStatus;
}

/** Lyria 3 Pro can take minutes for a long song; the gateway allows 240 s upstream (+ lyrics check). */
const MIN_MUSIC_TIMEOUT_MS = 300_000;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

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

export class Music {
  constructor(private readonly http: HttpClient) {}

  /**
   * Generate music (`POST /v1/audio/music`): `codai-music` 30 s clip with vocals, `codai-music-pro` full song up to
   * 184 s, `codai-music-legacy` instrumental Lyria 2. List price $0.04 / $0.08 / $0.06 per call.
   */
  async generate(
    body: MusicRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<MusicResult> {
    const res = await this.http.request('/v1/audio/music', {
      body,
      ext: opts.ext,
      signal: opts.signal,
      // 0 = timeout disabled on the client; otherwise never cap below the music floor.
      timeoutMs:
        this.http.timeoutMs === 0 ? 0 : Math.max(this.http.timeoutMs, MIN_MUSIC_TIMEOUT_MS),
    });
    const raw = (await res.json()) as MusicResponse;
    const cost = res.headers.get('x-codai-cost-micro-usd');
    const data = raw.data ?? [];
    const inline = data.filter((d): d is MusicClip => !isAssetDto(d));
    const tracks = data.map((d): MusicTrackMeta => ({
      lyrics: d.lyrics ?? null,
      caption: d.caption ?? null,
      lyrics_match: d.lyrics_match ?? null,
      warnings: d.warnings ?? [],
    }));
    return {
      clips: inline.map((d) => decodeBase64(d.b64_json)),
      mimeTypes: data.map((d) => d.mime_type ?? 'audio/wav'),
      assets: data.filter(isAssetDto),
      tracks,
      warnings: [...new Set(tracks.flatMap((t) => t.warnings ?? []))],
      raw,
      routedTo: res.headers.get('x-codai-routed-to'),
      costMicroUsd: cost === null ? null : Number(cost),
      headers: res.headers,
    };
  }
}

export class Videos {
  constructor(private readonly http: HttpClient) {}

  /** Start a video job (`POST /v1/videos`, HTTP 202). Nothing is charged until it succeeds. */
  async create(
    body: VideoRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<VideoJob> {
    const res = await this.http.request('/v1/videos', {
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    return (await res.json()) as VideoJob;
  }

  /**
   * Poll a job (`GET /v1/videos/{id}`). Billed exactly once ($0.10 / s) on the first `succeeded` poll, across gateway
   * instances. `responseFormat: 'url'` returns the stored MP4 as one `AssetDto` (1 h signed URL) instead of base64.
   */
  async retrieve(
    id: string,
    opts: {
      ext?: CodaiRequestExtensions;
      signal?: AbortSignal;
      responseFormat?: MediaResponseFormat;
    } = {},
  ): Promise<VideoJobStatus> {
    const res = await this.http.request(`/v1/videos/${encodeURIComponent(id)}`, {
      method: 'GET',
      query: { response_format: opts.responseFormat },
      ext: opts.ext,
      signal: opts.signal,
    });
    return (await res.json()) as VideoJobStatus;
  }

  /** Create a job and poll until it succeeds. Throws on `failed`, `filtered` or timeout. */
  async generate(
    body: VideoRequest,
    opts: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      ext?: CodaiRequestExtensions;
      /** `url`: the final poll returns the stored asset (`result.asset`) instead of the MP4 bytes. */
      responseFormat?: MediaResponseFormat;
    } = {},
  ): Promise<VideoResult> {
    const { pollIntervalMs = 5000, timeoutMs = 300_000, signal, ext, responseFormat } = opts;
    const job = await this.create(body, { ext, signal });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.retrieve(job.id, { ext, signal, responseFormat });
      if (st.status === 'succeeded') {
        const d = st.data?.[0];
        if (isAssetDto(d)) {
          return {
            video: new Uint8Array(0),
            mimeType: d.mime_type,
            id: job.id,
            seconds: st.seconds ?? job.seconds ?? null,
            asset: d,
            raw: st,
          };
        }
        if (!d?.b64_json) throw new Error(`codai video job ${job.id} succeeded without video data`);
        return {
          video: decodeBase64(d.b64_json),
          mimeType: d.mime_type ?? 'video/mp4',
          id: job.id,
          seconds: st.seconds ?? job.seconds ?? null,
          asset: null,
          raw: st,
        };
      }
      if (st.status === 'failed' || st.status === 'filtered') {
        throw new Error(`codai video job ${st.status}: ${st.error ?? 'no details'}`);
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(`codai video job ${job.id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(pollIntervalMs, signal);
    }
  }
}

export class Renders {
  constructor(private readonly http: HttpClient) {}

  /** Queue a render (`POST /v1/studio/renders`, HTTP 202). Nothing is charged until it succeeds. */
  async create(
    body: RenderRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<RenderJob> {
    const res = await this.http.request('/v1/studio/renders', {
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    return (await res.json()) as RenderJob;
  }

  /**
   * Poll a render (`GET /v1/studio/renders/{id}`). Billed exactly once (final $0.01 / s, min $0.05; draft half) on the
   * first poll that sees the finished render; failed renders cost nothing.
   * `expandAssets` signs the timeline's scene and narration assets (`?expand=assets`).
   */
  async retrieve(
    id: string,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal; expandAssets?: boolean } = {},
  ): Promise<RenderJobStatus> {
    const res = await this.http.request(`/v1/studio/renders/${encodeURIComponent(id)}`, {
      method: 'GET',
      query: { expand: opts.expandAssets ? 'assets' : undefined },
      ext: opts.ext,
      signal: opts.signal,
    });
    return (await res.json()) as RenderJobStatus;
  }

  /**
   * List renders newest first (`GET /v1/studio/renders`) — no polling, no signed URLs. `rootRenderId` restricts the
   * list to one timeline's version chain; pass `next_before` as `before` for the next page.
   */
  async list(
    params: { before?: string; limit?: number; rootRenderId?: string } = {},
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<RenderList> {
    const res = await this.http.request('/v1/studio/renders', {
      method: 'GET',
      query: {
        before: params.before,
        limit: params.limit,
        root_render_id: params.rootRenderId,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
    return (await res.json()) as RenderList;
  }

  /**
   * Render a scene timeline (`POST /v1/studio/timelines`, HTTP 202): image/video scenes, optional narration (billed
   * now, `narration_cost_micro_usd`) and music. Poll with `retrieve(id)`; the render is billed once when it succeeds.
   */
  async createTimeline(
    body: TimelineRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<TimelineJob> {
    const res = await this.http.request('/v1/studio/timelines', {
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    return (await res.json()) as TimelineJob;
  }

  /**
   * Regenerate one scene (`POST /v1/studio/renders/{id}/scenes/{sceneId}/regenerate`, HTTP 202): a NEW render with
   * `parent_render_id` = `renderId`; the source must be a succeeded timeline render (409 `not_a_timeline`).
   */
  async regenerateScene(
    renderId: string,
    sceneId: string,
    body: SceneRegenerateRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<SceneRegenerateJob> {
    const res = await this.http.request(
      `/v1/studio/renders/${encodeURIComponent(renderId)}/scenes/${encodeURIComponent(sceneId)}/regenerate`,
      { body, ext: opts.ext, signal: opts.signal, noRetry: true },
    );
    return (await res.json()) as SceneRegenerateJob;
  }

  /** Queue a render and poll until it succeeds. Throws on `failed` or timeout. */
  async render(
    body: RenderRequest,
    opts: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      ext?: CodaiRequestExtensions;
    } = {},
  ): Promise<RenderResult> {
    const { pollIntervalMs = 5000, timeoutMs = 900_000, signal, ext } = opts;
    const job = await this.create(body, { ext, signal });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.retrieve(job.id, { ext, signal });
      if (st.status === 'succeeded') {
        const asset = st.data?.find(isAssetDto);
        if (!asset) throw new Error(`codai render ${job.id} succeeded without an asset`);
        const cost = st.cost_micro_usd;
        return {
          id: job.id,
          asset,
          posterUrl: st.poster_url ?? null,
          qa: st.qa ?? null,
          costMicroUsd: cost === null || cost === undefined ? null : Number(cost),
          raw: st,
        };
      }
      if (st.status === 'failed') {
        throw new Error(`codai render failed: ${st.error ?? 'no details'}`);
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(`codai render ${job.id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(pollIntervalMs, signal);
    }
  }
}
