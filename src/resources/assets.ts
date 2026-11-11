/**
 * `/v1/assets` — the caller's codai Studio assets (media generated with `response_format: 'url'` and every finished
 * video job). Owner-scoped (a foreign id is 404), kept 90 days; each `ready` asset carries a 1 h V4 signed `url`.
 *
 * Uploads (`createUpload` / `completeUpload`, or the all-in-one `upload()`) go straight to a Google Cloud Storage
 * resumable session (4 GiB per file, 50 GiB per user); `ingest` / `runIngest` analyse video and audio (transcript,
 * speakers, shots, beats, faces, subjects; priced per minute, money-gated) and `search` finds moments inside them.
 */
import { CodaiError, type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type QueryOf, type Reply, type Schema, stripUndefined } from './_shared';

/** A stored asset (`GET /v1/assets/{id}`; `data` items with `response_format: 'url'`). */
export type AssetDto = Schema<'AssetDto'>;
export type AssetKind = Schema<'AssetKind'>;
export type AssetList = Reply<'listAssets'>;
export type AssetDeleted = Reply<'deleteAsset'>;
export type AssetListQuery = QueryOf<'listAssets'>;
/** `b64_json` (default, inline bytes) or `url` (stored asset + 1 h signed URL; 503 `assets_unavailable` without storage). */
export type MediaResponseFormat = Schema<'MediaResponseFormat'>;
/** Accepted upload media types (video, audio, image). */
export type AssetUploadMime = Schema<'AssetUploadMime'>;
/** Body of `POST /v1/assets/uploads`. */
export type AssetUploadCreate = Mutable<Schema<'AssetUploadCreate'>>;
/** `201` of `POST /v1/assets/uploads` — `upload_url` is a bearer secret: never log it. */
export type AssetUpload = Reply<'createAssetUpload', 201>;
/** `200` of `POST /v1/assets/uploads/{id}/complete`. */
export type AssetUploadCompleted = Reply<'completeAssetUpload'>;
export type AssetIngestDispatch = Schema<'AssetIngestDispatch'>;
export type AssetQuota = Reply<'getAssetQuota'>;
export type AssetIngest = Reply<'getAssetIngest'>;
export type AssetIngestRequest = Mutable<Schema<'AssetIngestRequest'>>;
export type AssetSearchResults = Reply<'searchAssets'>;
export type AssetSearchHit = Schema<'AssetSearchHit'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
type IdemOpts = CallOpts & { idempotencyKey?: string };

/** Every chunk except the last must be a multiple of this (GCS resumable uploads). */
export const UPLOAD_CHUNK_GRANULARITY = 262_144;
/** Default chunk size of `assets.upload()` (8 MiB). */
export const DEFAULT_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

/** What `assets.upload()` accepts. A `ReadableStream` needs `bytes`; it is buffered one chunk at a time. */
export type AssetUploadSource = Blob | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;

export interface AssetUploadOptions {
  filename: string;
  mime: AssetUploadMime;
  /** Total size; required for a `ReadableStream`, otherwise taken from the source. */
  bytes?: number;
  /** Analyse the media after the upload (default `true`; video/audio only, priced per minute). */
  ingest?: boolean;
  /** Browser origin that will PUT the bytes (CORS on the session URL). */
  origin?: string;
  /** Chunk size in bytes, a multiple of 262144 (default 8 MiB). */
  chunkSize?: number;
  signal?: AbortSignal;
  /** Called after every confirmed chunk with the bytes stored so far. */
  onProgress?: (sent: number, total: number) => void;
  /** fetch used for the PUTs to storage (defaults to the global one). */
  fetch?: typeof fetch;
  /** Retries of one failed chunk before giving up (default 5). */
  maxChunkRetries?: number;
  /** Base backoff between chunk retries in ms, doubled each attempt (default 500). */
  retryDelayMs?: number;
  /** `Idempotency-Key` for `POST /v1/assets/uploads`. */
  idempotencyKey?: string;
  ext?: CodaiRequestExtensions;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function idemHeaders(key?: string): Record<string, string> | undefined {
  return key ? { 'Idempotency-Key': key } : undefined;
}

/** Offset confirmed by a 308 `Range: bytes=0-N` header (`N + 1`; `0` without the header). */
function confirmedOffset(res: Response): number {
  const m = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '');
  return m ? Number(m[1]) + 1 : 0;
}

interface ChunkReader {
  read(start: number, end: number): Promise<Uint8Array>;
}

function bytesReader(bytes: Uint8Array): ChunkReader {
  return { read: async (start, end) => bytes.subarray(start, end) };
}

function blobReader(blob: Blob): ChunkReader {
  return { read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()) };
}

/** Keeps only the current chunk of a stream in memory; can re-read from any offset inside it. */
function streamReader(stream: ReadableStream<Uint8Array>): ChunkReader {
  const reader = stream.getReader();
  let buf = new Uint8Array(0);
  let bufStart = 0;
  let done = false;
  return {
    async read(start, end) {
      if (start < bufStart) throw new Error('codai upload: cannot rewind a ReadableStream source');
      const parts: Uint8Array[] = [buf.subarray(Math.min(start - bufStart, buf.length))];
      let have = parts[0]!.length;
      let skip = Math.max(0, start - bufStart - buf.length);
      while (have < end - start && !done) {
        const r = await reader.read();
        if (r.done) {
          done = true;
          break;
        }
        let v = r.value;
        if (skip > 0) {
          const drop = Math.min(skip, v.length);
          skip -= drop;
          v = v.subarray(drop);
        }
        parts.push(v);
        have += v.length;
      }
      const joined = new Uint8Array(have);
      let at = 0;
      for (const p of parts) {
        joined.set(p, at);
        at += p.length;
      }
      if (have < end - start)
        throw new Error('codai upload: stream ended before the declared size');
      buf = joined;
      bufStart = start;
      return joined.subarray(0, end - start);
    },
  };
}

function sourceReader(
  source: AssetUploadSource,
  bytes?: number,
): { reader: ChunkReader; total: number } {
  if (typeof Blob !== 'undefined' && source instanceof Blob)
    return { reader: blobReader(source), total: source.size };
  if (source instanceof Uint8Array)
    return { reader: bytesReader(source), total: source.byteLength };
  if (source instanceof ArrayBuffer)
    return { reader: bytesReader(new Uint8Array(source)), total: source.byteLength };
  if (bytes === undefined)
    throw new Error('codai upload: `bytes` is required for a ReadableStream source');
  return { reader: streamReader(source as ReadableStream<Uint8Array>), total: bytes };
}

const RETRYABLE_PUT = (status: number) => status === 408 || status === 429 || status >= 500;

/** True for a `data` item that is a stored asset rather than inline base64. */
export function isAssetDto(item: unknown): item is AssetDto {
  return typeof item === 'object' && item !== null && 'asset_id' in item;
}

export class Assets {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/assets` — newest first, `limit` ≤ 100 (default 30). Paginate by passing `next_before` as `before`. */
  list(query: AssetListQuery = {}, opts: CallOpts = {}): Promise<AssetList> {
    return this.http.json<AssetList>('/v1/assets', {
      query: { kind: query.kind, before: query.before, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Iterate every asset across pages (`list` with `before` = previous `next_before`). */
  async *iterate(
    query: Omit<AssetListQuery, 'before'> = {},
    opts: CallOpts = {},
  ): AsyncGenerator<AssetDto, void, undefined> {
    let before: string | undefined;
    for (;;) {
      const page = await this.list({ ...query, before }, opts);
      yield* page.data;
      if (!page.next_before) return;
      before = page.next_before;
    }
  }

  /** `GET /v1/assets/{id}` — one asset with a fresh 1 h signed `url` (`null` while not `ready`). */
  retrieve(id: string, opts: CallOpts = {}): Promise<AssetDto> {
    return this.http.json<AssetDto>(`/v1/assets/${encodeURIComponent(id)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * A fresh signed URL of the asset's bytes (valid 1 h), from `GET /v1/assets/{id}`. Throws when the asset has no
   * content yet. Use it in `<audio>`/`<video>`/`fetch` — it needs no Authorization header.
   */
  async contentUrl(id: string, opts: CallOpts = {}): Promise<string> {
    const a = await this.retrieve(id, opts);
    if (!a.url) throw new Error(`codai asset ${id} has no content yet (status ${a.status})`);
    return a.url;
  }

  /**
   * The authenticated redirect endpoint `GET /v1/assets/{id}/content` (302 to the signed URL). Useful for tools that
   * follow redirects with the API key (`curl -L -H 'Authorization: Bearer …'`); browsers should use `contentUrl()`.
   */
  contentPath(id: string): string {
    return this.http.url(`/v1/assets/${encodeURIComponent(id)}/content`);
  }

  /** Download the asset's bytes (fetches the signed URL, no API key sent to storage). */
  async content(id: string, opts: CallOpts = {}): Promise<Uint8Array> {
    const url = await this.contentUrl(id, opts);
    const res = await fetch(url, opts.signal ? { signal: opts.signal } : {});
    if (!res.ok) throw new Error(`codai asset ${id} download failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** `DELETE /v1/assets/{id}` — deletes the object; signed URLs already handed out stop working. */
  delete(id: string, opts: CallOpts = {}): Promise<AssetDeleted> {
    return this.http.json<AssetDeleted>(`/v1/assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/assets/uploads` — opens a GCS resumable session (≤ 4 GiB per file, 50 GiB per user). PUT the bytes to
   * `upload_url` yourself (no Authorization header) or use `upload()`. Errors: 413 `file_too_large` /
   * `storage_quota_exceeded`, 415 `unsupported_media_type`, 400 `invalid_origin`.
   */
  createUpload(body: AssetUploadCreate, opts: IdemOpts = {}): Promise<AssetUpload> {
    return this.http.json<AssetUpload>('/v1/assets/uploads', {
      method: 'POST',
      body: stripUndefined(body as unknown as Record<string, unknown>),
      headers: idemHeaders(opts.idempotencyKey),
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/assets/uploads/{id}/complete` — marks the asset ready and dispatches ingest when asked (409 `upload_incomplete`). */
  completeUpload(id: string, opts: CallOpts = {}): Promise<AssetUploadCompleted> {
    return this.http.json<AssetUploadCompleted>(
      `/v1/assets/uploads/${encodeURIComponent(id)}/complete`,
      { method: 'POST', ext: opts.ext, signal: opts.signal },
    );
  }

  /** `GET /v1/assets/quota` — `{ used_bytes, limit_bytes, max_file_bytes }`. */
  quota(opts: CallOpts = {}): Promise<AssetQuota> {
    return this.http.json<AssetQuota>('/v1/assets/quota', { ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/assets/{id}/ingest` — ingest status; `result` (ingest.json v1) and `sprite_url` once `succeeded`. */
  ingest(id: string, opts: CallOpts = {}): Promise<AssetIngest> {
    return this.http.json<AssetIngest>(`/v1/assets/${encodeURIComponent(id)}/ingest`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/assets/{id}/ingest` — (re)runs the analysis of a ready video/audio asset; quoted per minute and held on
   * the wallet (402 `insufficient_funds`, 409 `asset_not_ready`, 415 `unsupported_media_type`).
   */
  runIngest(
    id: string,
    body: AssetIngestRequest = {},
    opts: IdemOpts = {},
  ): Promise<AssetIngestDispatch> {
    return this.http.json<AssetIngestDispatch>(`/v1/assets/${encodeURIComponent(id)}/ingest`, {
      method: 'POST',
      body: stripUndefined(body as Record<string, unknown>),
      headers: idemHeaders(opts.idempotencyKey),
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/assets/search` — moments (shot keyframes, transcript segments) of your ingested media matching `q`. */
  search(
    q: string,
    query: { limit?: number } = {},
    opts: CallOpts = {},
  ): Promise<AssetSearchResults> {
    return this.http.json<AssetSearchResults>('/v1/assets/search', {
      query: { q, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Upload a file end to end: `createUpload` → chunked PUTs to the GCS session (`Content-Range`, 308 = continue,
   * no API key sent to storage) → `completeUpload`. A failed or interrupted chunk is retried up to
   * `maxChunkRetries` times after asking the session how far it got (`Content-Range: bytes *\/total`).
   */
  async upload(source: AssetUploadSource, opts: AssetUploadOptions): Promise<AssetUploadCompleted> {
    const { reader, total } = sourceReader(source, opts.bytes);
    if (!Number.isInteger(total) || total <= 0)
      throw new Error('codai upload: empty or invalid size');
    const chunkSize = opts.chunkSize ?? DEFAULT_UPLOAD_CHUNK_SIZE;
    if (chunkSize <= 0 || chunkSize % UPLOAD_CHUNK_GRANULARITY !== 0)
      throw new Error(
        `codai upload: chunkSize must be a positive multiple of ${UPLOAD_CHUNK_GRANULARITY}`,
      );
    const doFetch: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
    const maxRetries = opts.maxChunkRetries ?? 5;
    const baseDelay = opts.retryDelayMs ?? 500;
    const signal = opts.signal;

    const session = await this.createUpload(
      {
        filename: opts.filename,
        mime: opts.mime,
        bytes: total,
        ingest: opts.ingest,
        origin: opts.origin,
      },
      { idempotencyKey: opts.idempotencyKey, ext: opts.ext, signal },
    );
    const url = session.upload_url;
    const fail = (status: number) =>
      new CodaiError(`codai upload ${session.id} → storage HTTP ${status}`, status, null);

    /** Ask the session how far it got: `total` when finished, otherwise the next byte to send. */
    const status = async (): Promise<number> => {
      const res = await doFetch(url, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes */${total}` },
        ...(signal ? { signal } : {}),
      });
      if (res.status === 200 || res.status === 201) return total;
      if (res.status === 308) return confirmedOffset(res);
      throw fail(res.status);
    };

    let offset = 0;
    while (offset < total) {
      const end = Math.min(offset + chunkSize, total);
      const data = await reader.read(offset, end);
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await doFetch(url, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
            body: data as unknown as BodyInit,
            ...(signal ? { signal } : {}),
          });
          if (res.status === 200 || res.status === 201) offset = total;
          else if (res.status === 308) offset = confirmedOffset(res);
          else if (RETRYABLE_PUT(res.status)) throw fail(res.status);
          else throw Object.assign(fail(res.status), { fatal: true });
          break;
        } catch (err) {
          if (signal?.aborted || (err as { fatal?: boolean }).fatal || attempt >= maxRetries)
            throw err;
          await sleep(baseDelay * 2 ** attempt);
          let at: number;
          try {
            at = await status();
          } catch (e) {
            if (signal?.aborted || (e instanceof CodaiError && !RETRYABLE_PUT(e.status))) throw e;
            continue;
          }
          if (at !== offset) {
            offset = at;
            break;
          }
        }
      }
      opts.onProgress?.(offset, total);
    }
    return this.completeUpload(session.id, { ext: opts.ext, signal });
  }
}
