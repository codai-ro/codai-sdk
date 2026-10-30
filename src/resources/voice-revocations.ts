/**
 * `POST /v1/studio/voice-revocations` — ask for a voice cloned in codai Studio to be taken down (for people without a
 * codai account). Public: the key is not required by the route; nothing in the request is echoed back. Free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema, stripUndefined } from './_shared';

/** `email`, `voice_owner_name`, `details`, optional `evidence_url`. */
export type StudioVoiceRevocationRequest = Mutable<Schema<'StudioVoiceRevocationRequest'>>;
/** `{ id, object: 'studio.voice_revocation', status: 'open' }`. */
export type StudioVoiceRevocation = Schema<'StudioVoiceRevocation'>;

export class VoiceRevocations {
  constructor(private readonly http: HttpClient) {}

  /** Store a takedown ticket for manual review (HTTP 202). Rate-limited per IP; never retried. */
  create(
    body: StudioVoiceRevocationRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<StudioVoiceRevocation> {
    return this.http.json<StudioVoiceRevocation>('/v1/studio/voice-revocations', {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }
}
