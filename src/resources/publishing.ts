/**
 * codai Studio direct publishing (SX-30) — connect a YouTube channel and upload a finished video render with the
 * fields the user approved. Free. Until codai enables publishing, `listConnections` reports `enabled: false` and the
 * connect / draft / publish calls answer 404 `not_found`.
 *
 *   `GET    /v1/studio/connections`                     — connected channels (`listConnections`)
 *   `POST   /v1/studio/connections/youtube/start`       — Google authorization URL + state + PKCE verifier (`startConnection`)
 *   `POST   /v1/studio/connections/youtube/exchange`    — finish with the code from the redirect (`exchangeConnection`)
 *   `DELETE /v1/studio/connections/{id}`                — revoke at Google + delete tokens (`deleteConnection`)
 *   `POST   /v1/studio/publish/draft`                   — pre-filled draft, nothing uploaded (`draft`)
 *   `POST   /v1/studio/publish`                         — upload (202, `create`; idempotent with `client_request_id`)
 *   `GET    /v1/studio/publish/{id}`                    — phase / progress / link / error (`retrieve`)
 *   `POST   /v1/studio/publish/{id}/cancel`             — before the upload starts (`cancel`)
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema } from './_shared';

export type StudioConnection = Schema<'StudioConnection'>;
export type StudioPublishRequest = Mutable<Schema<'StudioPublishRequest'>>;
export type StudioPublishDraft = Schema<'StudioPublishDraft'>;
export type StudioPublication = Schema<'StudioPublication'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
const enc = encodeURIComponent;

export class Publishing {
  constructor(private readonly http: HttpClient) {}

  /** Connected channels; `enabled` is false while publishing is off. */
  listConnections(
    opts: CallOpts = {},
  ): Promise<{ object: 'list'; enabled: boolean; data: StudioConnection[] }> {
    return this.http.json('/v1/studio/connections', { ext: opts.ext, signal: opts.signal });
  }

  /** Start the Google OAuth flow; keep `state` + `code_verifier` and send them to `exchangeConnection` within 10 min. */
  startConnection(
    platform: 'youtube' = 'youtube',
    opts: CallOpts = {},
  ): Promise<{
    authorize_url: string;
    state: string;
    code_verifier: string;
    expires_in_s: number;
  }> {
    return this.http.json(`/v1/studio/connections/${enc(platform)}/start`, {
      method: 'POST',
      body: {},
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  exchangeConnection(
    body: { code: string; state: string; code_verifier: string },
    platform: 'youtube' = 'youtube',
    opts: CallOpts = {},
  ): Promise<StudioConnection> {
    return this.http.json<StudioConnection>(`/v1/studio/connections/${enc(platform)}/exchange`, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Revoke at Google, delete the stored tokens, cancel queued uploads (published videos stay on YouTube). */
  deleteConnection(
    id: string,
    opts: CallOpts = {},
  ): Promise<{
    object: 'studio.connection';
    id: string;
    deleted: boolean;
    revoked_at_platform: boolean;
  }> {
    return this.http.json(`/v1/studio/connections/${enc(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** A pre-filled draft (title, description, tags, AI disclosure); privacy and made-for-kids are left to the person. */
  draft(
    body: {
      render_id: string;
      title: string;
      description?: string;
      hashtags?: string[];
      language?: string | null;
    },
    opts: CallOpts = {},
  ): Promise<StudioPublishDraft> {
    return this.http.json<StudioPublishDraft>('/v1/studio/publish/draft', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Upload a finished render (HTTP 202). Validated like YouTube (description in bytes, explicit privacy, …). */
  create(body: StudioPublishRequest, opts: CallOpts = {}): Promise<StudioPublication> {
    return this.http.json<StudioPublication>('/v1/studio/publish', {
      method: 'POST',
      body,
      noRetry: !body.client_request_id,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  retrieve(id: string, opts: CallOpts = {}): Promise<StudioPublication> {
    return this.http.json<StudioPublication>(`/v1/studio/publish/${enc(id)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  cancel(id: string, opts: CallOpts = {}): Promise<StudioPublication> {
    return this.http.json<StudioPublication>(`/v1/studio/publish/${enc(id)}/cancel`, {
      method: 'POST',
      body: {},
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
