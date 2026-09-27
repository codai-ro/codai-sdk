/** `/v1/tools/*` — verified web search and server-side page fetch. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type ToolSearchRequest = Mutable<Body<'toolsSearch'>>;
export type ToolSearchResponse = Reply<'toolsSearch'>;
export type ToolFetchRequest = Mutable<Body<'toolsFetch'>>;
export type ToolFetchResponse = Reply<'toolsFetch'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Tools {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/tools/search` — verified web search (never falls back to an unverified provider). */
  search(body: ToolSearchRequest, opts: CallOpts = {}): Promise<ToolSearchResponse> {
    return this.http.json<ToolSearchResponse>('/v1/tools/search', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/tools/fetch` — fetch + extract a public page (SSRF-guarded). */
  fetch(body: ToolFetchRequest, opts: CallOpts = {}): Promise<ToolFetchResponse> {
    return this.http.json<ToolFetchResponse>('/v1/tools/fetch', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
