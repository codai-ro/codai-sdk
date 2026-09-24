/** `POST /v1/tokens` — ephemeral scoped tokens for browsers / webviews. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply } from './_shared';

export type EphemeralScope = 'realtime' | 'audio' | 'embeddings';
export type EphemeralTokenResponse = Reply<'createEphemeralToken'>;

export interface EphemeralToken {
  token: string;
  expiresAt: string;
  scope: EphemeralScope;
  raw: EphemeralTokenResponse;
}

export class Tokens {
  constructor(private readonly http: HttpClient) {}

  /**
   * Mint a short-lived token (60–3600 s, default 600) bound to one surface.
   * Only a real `codai_` key may mint.
   */
  async create(
    scope: EphemeralScope,
    ttlSeconds?: number,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<EphemeralToken> {
    const raw = await this.http.json<EphemeralTokenResponse>('/v1/tokens', {
      body: { scope, ...(ttlSeconds !== undefined ? { ttl_seconds: ttlSeconds } : {}) },
      ext: opts.ext,
      signal: opts.signal,
    });
    return { token: raw.token, expiresAt: raw.expires_at, scope: raw.scope, raw };
  }
}
