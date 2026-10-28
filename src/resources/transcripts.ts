/**
 * `/v1/transcripts/*` + `/v1/transcript-folders` + `/v1/transcript-vocabulary` + tus `/v1/uploads` — voice
 * recordings → diarized RO/EN transcripts → insights (summary, key points, actions, suggested agent prompts).
 * Feature-flagged per account (404 until enabled). Bodies are snake_case.
 */
import { CodaiError, type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type Transcript = Schema<'Transcript'>;
export type TranscriptDetail = Schema<'TranscriptDetail'>;
export type TranscriptStatus = Schema<'TranscriptStatus'>;
export type TranscriptFolder = Schema<'TranscriptFolder'>;
export type TranscriptList = Reply<'listTranscripts'>;
export type TranscriptListQuery = Mutable<QueryOf<'listTranscripts'>>;
export type TranscriptCreateRequest = Mutable<Body<'createTranscript'>>;
export type TranscriptPatch = Mutable<Body<'updateTranscript'>>;
export type TranscriptFinalizeRequest = Mutable<Body<'finalizeTranscript'>>;
export type TranscriptUsage = Reply<'getTranscriptUsage'>;
export type TranscriptSearchQuery = Mutable<QueryOf<'searchTranscripts'>>;
export type TranscriptSearchResult = Reply<'searchTranscripts'>;
export type TranscriptAskRequest = Mutable<Body<'askTranscripts'>>;
export type TranscriptAskResult = Reply<'askTranscripts'>;
export type TranscriptAudio = Reply<'getTranscriptAudio'>;
export type TranscriptBookmarkRequest = Mutable<Body<'addTranscriptBookmark'>>;
export type TranscriptSpeakerPatch = Mutable<Body<'updateTranscriptSpeaker'>>;
export type TranscriptExportFormat = 'md' | 'txt' | 'srt' | 'vtt' | 'json' | 'pdf' | 'docx';
export type TranscriptBinaryExportFormat = 'pdf' | 'docx';
export type TranscriptShareCreateRequest = Mutable<Schema<'TranscriptShareCreateRequest'>>;
export type TranscriptShareCreated = Schema<'TranscriptShareCreated'>;
export type TranscriptShare = Schema<'TranscriptShare'>;
export type PublicTranscript = Schema<'PublicTranscript'>;

/** A text export (`md` / `txt` / `srt` / `vtt` / `json`). */
export interface TranscriptTextExport {
  text: string;
  filename: string | null;
  contentType: string | null;
}

/** A binary export (`pdf` / `docx`): raw bytes, save them as-is. */
export interface TranscriptBinaryExport {
  bytes: Uint8Array;
  filename: string | null;
  contentType: string | null;
}

/** One `event: transcript` frame of `GET /v1/transcripts/stream`. */
export interface TranscriptStreamEvent {
  op: 'upsert' | 'delete' | 'progress' | 'live';
  id: string;
  status?: TranscriptStatus;
  /** 0..1 on `progress`. */
  progress?: number;
  title?: string;
  /** `live`: rolling caption from the recording device (committed tail + partial); never persisted. */
  finals?: string;
  partial?: string;
  /** `live`: 0..1 input level. */
  level?: number;
  /** `live`: phone | wear | desktop. */
  device?: string;
  elapsed_ms?: number;
  paused?: boolean;
}

/** Body of `POST /v1/transcripts/{id}/live` (the recording device's caption, ~1/s). */
export interface TranscriptLiveCaption {
  finals?: string;
  partial?: string;
  level?: number;
  device: 'phone' | 'wear' | 'desktop';
  elapsed_ms: number;
  paused?: boolean;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const one = (id: string, suffix = '') => `/v1/transcripts/${encodeURIComponent(id)}${suffix}`;

const TUS = { 'Tus-Resumable': '1.0.0' } as const;
export const TUS_CHUNK_BYTES = 8 * 1024 * 1024;

/** base64 of a UTF-8 string, without Buffer (browser + node). */
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Last path segment of a tus `Location` (absolute or relative). Exported for tests. */
export function uploadIdFromLocation(location: string): string {
  const path = location.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const id = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  if (!id) throw new CodaiError(`tus: no upload id in Location ${location}`, 0, null);
  return id;
}

export interface UploadAudioOptions extends CallOpts {
  track?: 'mic' | 'system' | 'mixed';
  transcriptId?: string;
  durationMs?: number;
  chunkSize?: number;
  /** Resume a previous upload (its id) instead of creating one. */
  uploadId?: string;
  onProgress?: (sent: number, total: number) => void;
}

class TranscriptFolders {
  constructor(private readonly http: HttpClient) {}
  /** `GET /v1/transcript-folders`. */
  list(opts: CallOpts = {}): Promise<Reply<'listTranscriptFolders'>> {
    return this.http.json('/v1/transcript-folders', { ext: opts.ext, signal: opts.signal });
  }
  /** `POST /v1/transcript-folders` — upsert on `name`. */
  create(
    body: Mutable<Body<'createTranscriptFolder'>>,
    opts: CallOpts = {},
  ): Promise<TranscriptFolder> {
    return this.http.json('/v1/transcript-folders', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
  /** `PATCH /v1/transcript-folders/{id}`. */
  update(
    id: string,
    body: Mutable<Body<'updateTranscriptFolder'>>,
    opts: CallOpts = {},
  ): Promise<TranscriptFolder> {
    return this.http.json(`/v1/transcript-folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
  /** `DELETE /v1/transcript-folders/{id}` — transcripts stay, `folder_id` cleared. */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(`/v1/transcript-folders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

class TranscriptVocabulary {
  constructor(private readonly http: HttpClient) {}
  /** `GET /v1/transcript-vocabulary`. */
  get(opts: CallOpts = {}): Promise<Reply<'getTranscriptVocabulary'>> {
    return this.http.json('/v1/transcript-vocabulary', { ext: opts.ext, signal: opts.signal });
  }
  /** `PUT /v1/transcript-vocabulary` — replaces the whole list. */
  put(terms: string[], opts: CallOpts = {}): Promise<Reply<'putTranscriptVocabulary'>> {
    return this.http.json('/v1/transcript-vocabulary', {
      method: 'PUT',
      body: { terms },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

class TranscriptShares {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/transcripts/{id}/shares` — read-only public link (`https://hub.codai.ro/t/<token>`). The token/url
   * are returned ONCE (only a hash is stored). Omit `expiresInDays` for a link that never expires.
   */
  create(
    id: string,
    body: TranscriptShareCreateRequest = {},
    opts: CallOpts = {},
  ): Promise<TranscriptShareCreated> {
    return this.http.json<TranscriptShareCreated>(one(id, '/shares'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/transcripts/{id}/shares` — active links; `url` is always null (token not recoverable). */
  async list(id: string, opts: CallOpts = {}): Promise<TranscriptShare[]> {
    const r = await this.http.json<{ data: TranscriptShare[] }>(one(id, '/shares'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return r.data;
  }

  /** `DELETE /v1/transcripts/{id}/shares/{shareId}` — the public URL answers 404 from then on. */
  async revoke(id: string, shareId: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(one(id, `/shares/${encodeURIComponent(shareId)}`), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

class Uploads {
  constructor(private readonly http: HttpClient) {}

  /** `OPTIONS /v1/uploads` — tus capabilities (headers). */
  async capabilities(
    opts: CallOpts = {},
  ): Promise<{ version: string | null; extensions: string[]; maxSize: number | null }> {
    const res = await this.http.request('/v1/uploads', {
      method: 'OPTIONS',
      headers: TUS,
      ext: opts.ext,
      signal: opts.signal,
    });
    const max = res.headers.get('tus-max-size');
    return {
      version: res.headers.get('tus-version'),
      extensions: (res.headers.get('tus-extension') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      maxSize: max ? Number(max) : null,
    };
  }

  /** `POST /v1/uploads` — tus creation; returns the upload id. */
  async create(
    length: number | null,
    metadata: Record<string, string>,
    opts: CallOpts = {},
  ): Promise<string> {
    const md = Object.entries(metadata)
      .map(([k, v]) => `${k} ${b64(v)}`)
      .join(',');
    const res = await this.http.request('/v1/uploads', {
      method: 'POST',
      headers: {
        ...TUS,
        ...(length === null ? { 'Upload-Defer-Length': '1' } : { 'Upload-Length': String(length) }),
        ...(md ? { 'Upload-Metadata': md } : {}),
      },
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
    const loc = res.headers.get('location');
    if (!loc) throw new CodaiError('tus: create response has no Location header', res.status, null);
    return uploadIdFromLocation(loc);
  }

  /** tus HEAD `/v1/uploads/{id}` — bytes the server holds (resume point). */
  async offset(
    id: string,
    opts: CallOpts = {},
  ): Promise<{ offset: number; length: number | null }> {
    const res = await this.http.request(`/v1/uploads/${encodeURIComponent(id)}`, {
      method: 'HEAD',
      headers: TUS,
      ext: opts.ext,
      signal: opts.signal,
    });
    const len = res.headers.get('upload-length');
    return {
      offset: Number(res.headers.get('upload-offset') ?? 0),
      length: len ? Number(len) : null,
    };
  }

  /** tus PATCH `/v1/uploads/{id}` — append one chunk at `offset`; returns the new offset. */
  async append(
    id: string,
    offset: number,
    chunk: Uint8Array,
    opts: CallOpts & { length?: number } = {},
  ): Promise<number> {
    const res = await this.http.request(`/v1/uploads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        ...TUS,
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
        ...(opts.length !== undefined ? { 'Upload-Length': String(opts.length) } : {}),
      },
      rawBody: chunk as unknown as BodyInit,
      ext: opts.ext,
      signal: opts.signal,
    });
    const next = Number(res.headers.get('upload-offset') ?? -1);
    if (!(next > offset))
      throw new CodaiError(
        `tus: server offset ${next} did not advance past ${offset}`,
        res.status,
        null,
      );
    return next;
  }
}

export class Transcripts {
  readonly folders: TranscriptFolders;
  readonly vocabulary: TranscriptVocabulary;
  readonly uploads: Uploads;
  readonly shares: TranscriptShares;

  constructor(private readonly http: HttpClient) {
    this.folders = new TranscriptFolders(http);
    this.vocabulary = new TranscriptVocabulary(http);
    this.uploads = new Uploads(http);
    this.shares = new TranscriptShares(http);
  }

  /** `GET /v1/transcripts` — pinned first, newest next; page with `next_cursor`. */
  list(query: TranscriptListQuery = {}, opts: CallOpts = {}): Promise<TranscriptList> {
    return this.http.json<TranscriptList>('/v1/transcripts', {
      query: query as Record<string, string | number | boolean | undefined>,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/transcripts` — status `recording`; idempotent on `client_id`. */
  create(body: TranscriptCreateRequest, opts: CallOpts = {}): Promise<Transcript> {
    return this.http.json<Transcript>('/v1/transcripts', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/transcripts/{id}` — speakers, utterances (word timings), bookmarks, latest insights. */
  get(id: string, opts: CallOpts = {}): Promise<TranscriptDetail> {
    return this.http.json<TranscriptDetail>(one(id), { ext: opts.ext, signal: opts.signal });
  }

  /** `PATCH /v1/transcripts/{id}` — setting `title` locks it. */
  update(id: string, body: TranscriptPatch, opts: CallOpts = {}): Promise<Transcript> {
    return this.http.json<Transcript>(one(id), {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/transcripts/{id}` — row + audio objects. */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(one(id), { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/transcripts/{id}/finalize` — attach tus uploads + bookmarks → `queued`. */
  finalize(id: string, body: TranscriptFinalizeRequest, opts: CallOpts = {}): Promise<Transcript> {
    return this.http.json<Transcript>(one(id, '/finalize'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [202],
    });
  }

  /** `POST /v1/transcripts/{id}/retranscribe`. */
  retranscribe(id: string, opts: CallOpts = {}): Promise<Transcript> {
    return this.http.json<Transcript>(one(id, '/retranscribe'), {
      method: 'POST',
      body: {},
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/transcripts/{id}/reanalyze` — new insights version. */
  reanalyze(id: string, opts: CallOpts = {}): Promise<Transcript> {
    return this.http.json<Transcript>(one(id, '/reanalyze'), {
      method: 'POST',
      body: {},
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * `POST /v1/transcripts/{id}/live` — publish the recording device's live caption to every viewer of the transcript
   * (`stream()` / hub live view). Only while `recording`; frames closer than 250 ms are dropped. Returns nothing (204).
   */
  async publishLive(id: string, body: TranscriptLiveCaption, opts: CallOpts = {}): Promise<void> {
    await this.http.request(one(id, '/live'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/transcripts/{id}/bookmarks`. */
  addBookmark(
    id: string,
    body: TranscriptBookmarkRequest,
    opts: CallOpts = {},
  ): Promise<Reply<'addTranscriptBookmark', 201>> {
    return this.http.json(one(id, '/bookmarks'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/transcripts/{id}/speakers/{label}` — name a speaker / mark yourself (`is_owner`). */
  renameSpeaker(
    id: string,
    label: string,
    body: TranscriptSpeakerPatch,
    opts: CallOpts = {},
  ): Promise<Reply<'updateTranscriptSpeaker'>> {
    return this.http.json(one(id, `/speakers/${encodeURIComponent(label)}`), {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/transcripts/{id}/utterances/{seq}` — correct one utterance. */
  editUtterance(
    id: string,
    seq: number,
    text: string,
    opts: CallOpts = {},
  ): Promise<Reply<'updateTranscriptUtterance'>> {
    return this.http.json(one(id, `/utterances/${seq}`), {
      method: 'PATCH',
      body: { text },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/transcripts/{id}/audio` — signed playback URLs per track (empty after the 30-day retention). */
  audio(id: string, opts: CallOpts = {}): Promise<TranscriptAudio> {
    return this.http.json<TranscriptAudio>(one(id, '/audio'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/transcripts/{id}/export?format=` — text for md/txt/srt/vtt/json, bytes for pdf/docx. */
  export(
    id: string,
    format: TranscriptBinaryExportFormat,
    opts?: CallOpts,
  ): Promise<TranscriptBinaryExport>;
  export(
    id: string,
    format?: Exclude<TranscriptExportFormat, TranscriptBinaryExportFormat>,
    opts?: CallOpts,
  ): Promise<TranscriptTextExport>;
  async export(
    id: string,
    format: TranscriptExportFormat = 'md',
    opts: CallOpts = {},
  ): Promise<TranscriptTextExport | TranscriptBinaryExport> {
    const res = await this.http.request(one(id, '/export'), {
      query: { format },
      ext: opts.ext,
      signal: opts.signal,
    });
    const cd = res.headers.get('content-disposition') ?? '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]!) : null;
    const contentType = res.headers.get('content-type');
    if (format === 'pdf' || format === 'docx')
      return { bytes: new Uint8Array(await res.arrayBuffer()), filename, contentType };
    return { text: await res.text(), filename, contentType };
  }

  /**
   * `GET /v1/public/transcripts/{token}` — the read-only view behind a share link (no API key needed; the
   * client's key is sent but ignored). 404 for unknown / expired / revoked links.
   */
  publicView(token: string, opts: CallOpts = {}): Promise<PublicTranscript> {
    return this.http.json<PublicTranscript>(`/v1/public/transcripts/${encodeURIComponent(token)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/transcripts/{id}/prompts/{index}/accept` — suggested agent prompt → pending prompt. */
  acceptPrompt(
    id: string,
    index: number,
    opts: CallOpts = {},
  ): Promise<Reply<'acceptTranscriptPrompt', 201>> {
    return this.http.json(one(id, `/prompts/${index}/accept`), {
      method: 'POST',
      body: {},
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/transcripts/usage` — this month's allowance. */
  usage(opts: CallOpts = {}): Promise<TranscriptUsage> {
    return this.http.json<TranscriptUsage>('/v1/transcripts/usage', {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/transcripts/search` — full-text (+ semantic in `hybrid`). */
  search(query: TranscriptSearchQuery, opts: CallOpts = {}): Promise<TranscriptSearchResult> {
    return this.http.json<TranscriptSearchResult>('/v1/transcripts/search', {
      query: query as Record<string, string | number | undefined>,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/transcripts/ask` — answer across your recordings with `[n]` citations. */
  ask(body: TranscriptAskRequest, opts: CallOpts = {}): Promise<TranscriptAskResult> {
    return this.http.json<TranscriptAskResult>('/v1/transcripts/ask', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/transcripts/stream` — live `transcript` events (keepalives skipped). Server closes after 55 min. */
  async *stream(opts: CallOpts = {}): AsyncGenerator<TranscriptStreamEvent, void, undefined> {
    const frames = this.http.sse('/v1/transcripts/stream', { ext: opts.ext, signal: opts.signal });
    for await (const frame of frames) {
      if (frame.event !== 'transcript') continue;
      const data = frameJson<TranscriptStreamEvent>(frame);
      if (data) yield data;
    }
  }

  /**
   * Upload one audio track with tus 1.0 (resumable): creates the upload (or resumes `uploadId` from the server's
   * offset), PATCHes ≤ 8 MB chunks and returns the upload id to pass to `finalize`.
   */
  async uploadAudio(
    data: Uint8Array | ArrayBuffer | Blob,
    opts: UploadAudioOptions = {},
  ): Promise<string> {
    const bytes =
      data instanceof Uint8Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(await data.arrayBuffer());
    const total = bytes.byteLength;
    const chunk = Math.max(1, Math.min(opts.chunkSize ?? TUS_CHUNK_BYTES, TUS_CHUNK_BYTES));
    let id = opts.uploadId;
    let offset = 0;
    if (id) offset = (await this.uploads.offset(id, opts)).offset;
    else {
      const md: Record<string, string> = { track: opts.track ?? 'mic' };
      if (opts.transcriptId) md.transcript = opts.transcriptId;
      if (opts.durationMs !== undefined) md.durationMs = String(opts.durationMs);
      id = await this.uploads.create(total, md, opts);
    }
    opts.onProgress?.(offset, total);
    while (offset < total) {
      offset = await this.uploads.append(
        id,
        offset,
        bytes.subarray(offset, Math.min(total, offset + chunk)),
        opts,
      );
      opts.onProgress?.(offset, total);
    }
    return id;
  }
}
