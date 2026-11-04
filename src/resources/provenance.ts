/**
 * `POST /v1/public/provenance/check` — check a file for the AI-provenance marks codai writes (C2PA manifest presence +
 * claimed issuer, WAV RIFF INFO, MP3 ID3 TXXX, MP4 udta/meta, image XMP). Public: the route does not require the key;
 * the file is not stored. C2PA signatures are not verified and SynthID is never checked (see the result flags). Free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Schema } from './_shared';

/** `{ media_type, findings, codai_generated, synthid_checked: false, signature_verified: false }`. */
export type ProvenanceCheckResult = Schema<'ProvenanceCheckResult'>;
/** One mark: `{ kind, present, ai_marked, codai, details }`. */
export type ProvenanceFinding = Schema<'ProvenanceFinding'>;

/** Largest file the checker accepts (25 MB). */
export const PROVENANCE_MAX_BYTES = 25 * 1024 * 1024;

export class Provenance {
  constructor(private readonly http: HttpClient) {}

  /**
   * Upload `file` (PNG, JPEG, WebP, WAV, MP3 or MP4, ≤ 25 MB) and return what was found. A `Blob`/`File` sends its own
   * `type`; raw bytes need `contentType` (default `application/octet-stream`). Never retried.
   */
  check(
    file: Blob | Uint8Array<ArrayBuffer> | ArrayBuffer,
    opts: { contentType?: string; ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<ProvenanceCheckResult> {
    const type =
      opts.contentType ||
      (file instanceof Blob && file.type ? file.type : 'application/octet-stream');
    return this.http.json<ProvenanceCheckResult>('/v1/public/provenance/check', {
      method: 'POST',
      rawBody: file,
      headers: { 'Content-Type': type },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }
}
