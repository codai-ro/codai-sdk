/** `POST /v1/systemone` — typed decisions from codai-s1 (Choice / Score / Noul). */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type SystemOneRequest = Mutable<Body<'createSystemOne'>>;
export type SystemOneResponse = Reply<'createSystemOne'>;

export class SystemOne {
  constructor(private readonly http: HttpClient) {}

  /**
   * Ask one or more typed questions about `state`. Throws on 503 `s1_unavailable` like any other
   * error — keep a local fallback and catch it: the gateway never substitutes a generative model.
   */
  async create(
    body: SystemOneRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<SystemOneResponse> {
    const res = await this.http.request('/v1/systemone', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
    return (await res.json()) as SystemOneResponse;
  }
}
