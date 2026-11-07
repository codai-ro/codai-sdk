/** `POST /v1/systemone` — typed decisions from codai-s1 (Choice / Score / Noul). */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type SystemOneRequest = Mutable<Body<'createSystemOne'>>;
export type SystemOneResponse = Reply<'createSystemOne'>;
type SystemOneState = NonNullable<SystemOneRequest['state']>;
export type SystemOneAnswers = NonNullable<SystemOneResponse['answers']>;

/** Single-state call: `answers` is always present. */
export type SystemOneSingleRequest = Omit<SystemOneRequest, 'items'> & { state: SystemOneState };
export type SystemOneSingleResponse = SystemOneResponse & { answers: SystemOneAnswers };

/** Batch call (1-16 items, same questions, run concurrently). */
export type SystemOneBatchRequest = Omit<SystemOneRequest, 'state' | 'items'> & {
  items: Array<{ id: string; state: SystemOneState }>;
};
export type SystemOneBatchResponse = SystemOneResponse & {
  items: Array<{ id: string; answers: SystemOneAnswers }>;
};

export class SystemOne {
  constructor(private readonly http: HttpClient) {}

  /**
   * Ask one or more typed questions about `state` (or about each of `items`). Throws on 503
   * `s1_unavailable` like any other error — keep a local fallback and catch it. The gateway
   * substitutes a generative model ONLY when you pass `fallback: 'codai-fast'`, and then the
   * response says `fallback_used: true`. `timeout_ms` (100-5000) bounds the s1 call.
   */
  async create(
    body: SystemOneSingleRequest,
    opts?: { ext?: CodaiRequestExtensions; signal?: AbortSignal },
  ): Promise<SystemOneSingleResponse>;
  async create(
    body: SystemOneBatchRequest,
    opts?: { ext?: CodaiRequestExtensions; signal?: AbortSignal },
  ): Promise<SystemOneBatchResponse>;
  async create(
    body: SystemOneRequest,
    opts?: { ext?: CodaiRequestExtensions; signal?: AbortSignal },
  ): Promise<SystemOneResponse>;
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

  /** Same questions about up to 16 states in one call; results come back in `items` order. */
  batch(
    body: SystemOneBatchRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<SystemOneBatchResponse> {
    return this.create(body, opts);
  }
}
