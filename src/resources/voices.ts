/**
 * `client.voices` — codai Studio custom voices, D37 voice passport (beta): the SEPARATE, revocable consent that lets
 * your own custom voice sing in your Music Room songs. The consent itself is recorded in the app (a `purpose: singing`
 * recording session: the singing statement read aloud + a sung sample); these calls arm and revoke it. The sung result
 * approximates your timbre; it is not a faithful clone. Only where voice cloning is enabled for the account. Free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema } from './_shared';

/** `{ session_id }` of a finished `purpose: singing` recording session for this voice. */
export type StudioVoiceSingingConsentRequest = Mutable<Schema<'StudioVoiceSingingConsentRequest'>>;
/** A custom voice (never the cloning key or any recording). */
export type StudioVoice = Schema<'StudioVoice'>;
/** `{ status: 'none' | 'active' | 'revoked', consented_at, revoked_at, quality: 'beta' }`. */
export type StudioVoiceSinging = Schema<'StudioVoiceSinging'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const singing = (id: string) => `/v1/studio/voices/${encodeURIComponent(id)}/singing-consent`;

export class Voices {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/studio/voices/{id}/singing-consent` — add the singing purpose from a finished singing recording session
   * (liveness-checked statement + sung sample). Returns the voice with `singing.status: 'active'`. Never retried.
   */
  addSingingConsent(
    id: string,
    body: StudioVoiceSingingConsentRequest,
    opts: CallOpts = {},
  ): Promise<StudioVoice> {
    return this.http.json<StudioVoice>(singing(id), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * `DELETE /v1/studio/voices/{id}/singing-consent` — revoke ONLY the singing purpose (204). The sung sample is deleted
   * at once; the voice keeps working for narration. Idempotent.
   */
  async revokeSingingConsent(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(singing(id), { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }
}
