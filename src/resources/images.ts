/**
 * `POST /v1/images/generations` and `POST /v1/images/edits` — Gemini image models on Vertex AI.
 * `codai-image` (default, gemini-3.1-flash-image, EU), `codai-image-fast`, `codai-image-pro`.
 * Output from the EU endpoint carries C2PA credentials + SynthID: keep the bytes as returned.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type ImagesRequest = Mutable<Body<'createImage'>>;
export type ImagesResponse = Reply<'createImage'>;
export type ImageEditRequest = Mutable<Body<'editImage'>>;

export interface ImagesResult {
  /** Decoded image bytes, one per generated image (see `mimeTypes`). */
  images: Uint8Array[];
  /** MIME type of each entry in `images` (usually `image/png`). */
  mimeTypes: string[];
  raw: ImagesResponse;
  /** Upstream model that produced the images (`x-codai-routed-to`). */
  routedTo: string | null;
  /** Vertex location that processed the request, `eu` or `global` (`x-codai-data-region`). */
  dataRegion: string | null;
  /** Usage-based charge for this request in micro-USD (`x-codai-cost-micro-usd`). */
  costMicroUsd: number | null;
  headers: Headers;
}

/** Image generation typically takes 5–30 s; the gateway allows 120 s upstream. */
const MIN_IMAGE_TIMEOUT_MS = 150_000;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Images {
  constructor(private readonly http: HttpClient) {}

  /**
   * Generate images. Needs a real API key (ephemeral tokens are rejected).
   * Pass `reference_images` to keep a logo/palette/product consistent.
   */
  async generate(
    body: Omit<ImagesRequest, 'model'> & { model?: string },
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<ImagesResult> {
    return this.post(
      '/v1/images/generations',
      { ...body, model: body.model ?? 'codai-image' },
      opts,
    );
  }

  /**
   * Edit one or more input images (`image`: one `{ b64_json, mime_type }` or an array of up to 14)
   * from a text instruction. JSON body; `mask` is not supported — describe the region in `prompt`.
   */
  async edit(
    body: Omit<ImageEditRequest, 'model'> & { model?: string },
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<ImagesResult> {
    return this.post('/v1/images/edits', { ...body, model: body.model ?? 'codai-image' }, opts);
  }

  private async post(
    path: string,
    body: unknown,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal },
  ): Promise<ImagesResult> {
    const res = await this.http.request(path, {
      body,
      ext: opts.ext,
      signal: opts.signal,
      // 0 = timeout disabled on the client; otherwise never cap below the image floor.
      timeoutMs:
        this.http.timeoutMs === 0 ? 0 : Math.max(this.http.timeoutMs, MIN_IMAGE_TIMEOUT_MS),
    });
    const raw = (await res.json()) as ImagesResponse;
    const cost = res.headers.get('x-codai-cost-micro-usd');
    const data = raw.data ?? [];
    return {
      images: data.map((d) => decodeBase64(d.b64_json)),
      mimeTypes: data.map((d) => d.mime_type ?? 'image/png'),
      raw,
      routedTo: res.headers.get('x-codai-routed-to'),
      dataRegion: res.headers.get('x-codai-data-region'),
      costMicroUsd: cost === null ? null : Number(cost),
      headers: res.headers,
    };
  }
}
