/**
 * codai Studio documents (EU-served, everything runs in europe-west1).
 *
 *   `POST /v1/studio/documents`               — `codai-docs`: builds a deck (PPTX), doc (DOCX) or sheet (XLSX)
 *                                               synchronously from a JSON `spec` (free; asset `kind: 'document'`).
 *   `GET  /v1/studio/documents/{id}`          — the document, a fresh signed `file.url` and the stored `spec`.
 *   `POST /v1/studio/documents/{id}/previews` — `codai-docs-preview`: tagged PDF + page PNGs + contact sheet (HTTP 202).
 *   `GET  /v1/studio/previews/{id}`           — polls the preview; billed once ($0.002 / page, min $0.01) when done.
 *   `POST /v1/studio/documents/{id}/video`    — deck -> MP4 slideshow, queued as a `codai-render` (HTTP 202); poll it
 *                                               with `renders.retrieve` (narration is billed at POST).
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { isAssetDto } from './assets';
import { type RenderResult, Renders } from './media';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type DocumentType = 'deck' | 'doc' | 'sheet';
export type DocumentTheme = Schema<'DocumentTheme'>;
export type DeckSpec = Mutable<Schema<'DeckSpec'>>;
export type DocSpec = Mutable<Schema<'DocSpec'>>;
export type SheetSpec = Mutable<Schema<'SheetSpec'>>;
export type DocumentCreateRequest = Mutable<Body<'createDocument'>>;
/** `POST` adds `cost_micro_usd` / `preview`; `GET` adds `spec` / `latest_preview_id`. */
export type StudioDocument = Reply<'createDocument'>;
export type DocumentPreviewRequest = Mutable<Body<'createDocumentPreview'>>;
export type DocumentPreviewAccepted = Reply<'createDocumentPreview', 202>;
export type DocumentPreview = Reply<'retrievePreview'>;
export type DocumentPreviewStatus = DocumentPreview['status'];
export type DocumentVideoRequest = Mutable<Body<'createDocumentVideo'>>;
export type DocumentVideoAccepted = Reply<'createDocumentVideo', 202>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
export interface DocumentPollOptions extends CallOpts {
  /** Delay between polls (default 3000 ms for previews, 5000 ms for videos). */
  pollIntervalMs?: number;
  /** Give up after this long (default 300 000 ms for previews, 900 000 ms for videos). */
  timeoutMs?: number;
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

export class Documents {
  private readonly renders: Renders;

  constructor(private readonly http: HttpClient) {
    this.renders = new Renders(http);
  }

  /**
   * Build a document (`POST /v1/studio/documents`). `spec` must match `type` (`deck` -> `DeckSpec`, `doc` -> `DocSpec`,
   * `sheet` -> `SheetSpec`); invalid specs are 400 `invalid_spec`. Files are free. `based_on` creates the next version
   * of one of your documents; `preview: true` also queues a (billed) preview, returned as `preview`.
   */
  create(body: DocumentCreateRequest, opts: CallOpts = {}): Promise<StudioDocument> {
    return this.http.json<StudioDocument>('/v1/studio/documents', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/studio/documents/{id}` — fresh 1 h signed `file.url`, the stored `spec` and `latest_preview_id`. */
  retrieve(id: string, opts: CallOpts = {}): Promise<StudioDocument> {
    return this.http.json<StudioDocument>(`/v1/studio/documents/${encodeURIComponent(id)}`, {
      method: 'GET',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Queue a preview (`POST /v1/studio/documents/{id}/previews`, HTTP 202): tagged PDF, page PNGs (1280 px) and a
   * contact sheet. Billed once on the first poll that sees the result; at most 3 active previews per user (429).
   */
  preview(
    id: string,
    body: DocumentPreviewRequest = {},
    opts: CallOpts = {},
  ): Promise<DocumentPreviewAccepted> {
    return this.http.json<DocumentPreviewAccepted>(
      `/v1/studio/documents/${encodeURIComponent(id)}/previews`,
      { method: 'POST', body, ext: opts.ext, signal: opts.signal, noRetry: true },
    );
  }

  /** Poll a preview (`GET /v1/studio/previews/{id}`): `queued` | `rendering` | `succeeded` | `failed`. */
  retrievePreview(previewId: string, opts: CallOpts = {}): Promise<DocumentPreview> {
    return this.http.json<DocumentPreview>(`/v1/studio/previews/${encodeURIComponent(previewId)}`, {
      method: 'GET',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Turn a deck into an MP4 (`POST /v1/studio/documents/{id}/video`, HTTP 202). Returns a render: poll it with
   * `renders.retrieve(id)` or use `videoAndWait`. Narration (`narrate`) is synthesized and billed now.
   */
  video(
    id: string,
    body: DocumentVideoRequest = {},
    opts: CallOpts = {},
  ): Promise<DocumentVideoAccepted> {
    return this.http.json<DocumentVideoAccepted>(
      `/v1/studio/documents/${encodeURIComponent(id)}/video`,
      { method: 'POST', body, ext: opts.ext, signal: opts.signal, noRetry: true },
    );
  }

  /** Queue a preview and poll until it succeeds. Throws on `failed` or timeout. */
  async createPreviewAndWait(
    id: string,
    opts: DocumentPollOptions & { body?: DocumentPreviewRequest } = {},
  ): Promise<DocumentPreview> {
    const { pollIntervalMs = 3000, timeoutMs = 300_000, signal, ext, body } = opts;
    const job = await this.preview(id, body ?? {}, { ext, signal });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.retrievePreview(job.id, { ext, signal });
      if (st.status === 'succeeded') return st;
      if (st.status === 'failed') {
        throw new Error(`codai document preview failed: ${st.error ?? 'no details'}`);
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(`codai document preview ${job.id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(pollIntervalMs, signal);
    }
  }

  /** Queue a deck video and poll `renders.retrieve` until it succeeds. Throws on `failed` or timeout. */
  async videoAndWait(
    id: string,
    body: DocumentVideoRequest = {},
    opts: DocumentPollOptions = {},
  ): Promise<RenderResult & { accepted: DocumentVideoAccepted }> {
    const { pollIntervalMs = 5000, timeoutMs = 900_000, signal, ext } = opts;
    const accepted = await this.video(id, body, { ext, signal });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.renders.retrieve(accepted.id, { ext, signal });
      if (st.status === 'succeeded') {
        const asset = st.data?.find(isAssetDto);
        if (!asset) throw new Error(`codai render ${accepted.id} succeeded without an asset`);
        const cost = st.cost_micro_usd;
        return {
          id: accepted.id,
          asset,
          posterUrl: st.poster_url ?? null,
          qa: st.qa ?? null,
          costMicroUsd: cost === null || cost === undefined ? null : Number(cost),
          raw: st,
          accepted,
        };
      }
      if (st.status === 'failed') {
        throw new Error(`codai deck video failed: ${st.error ?? 'no details'}`);
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(`codai deck video ${accepted.id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(pollIntervalMs, signal);
    }
  }
}
