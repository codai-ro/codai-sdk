/**
 * `/v1/tools/*` — verified web search, server-side page fetch and GUI grounding.
 *
 * Same contract as every codai agent surface (packages/agent-core/spec/tools-web.json). Metered per call: $3 / 1k
 * fast searches, $8 / 1k deep, $0.50 / 1k fetches; first 1,000 calls per month free, free inside a codai agent turn.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type ToolSearchRequest = Mutable<Body<'toolsSearch'>>;
export type ToolSearchResponse = Reply<'toolsSearch'>;
export type ToolFetchRequest = Mutable<Body<'toolsFetch'>>;
export type ToolFetchResponse = Reply<'toolsFetch'>;
export type ToolGroundRequest = Mutable<Body<'toolsGround'>>;
export type ToolGroundResponse = Reply<'toolsGround'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Tools {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/tools/search` — verified web search (never falls back to an unverified provider). Filters:
   * `include_domains` / `exclude_domains`, `freshness` or `published_after` / `published_before` (undated pages are
   * dropped), `content_chars` for a verified excerpt per result. Each result carries `published_at` (null when
   * unknown, never the crawl date) and `crawled_at`.
   */
  search(body: ToolSearchRequest, opts: CallOpts = {}): Promise<ToolSearchResponse> {
    return this.http.json<ToolSearchResponse>('/v1/tools/search', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/tools/fetch` — fetch + extract a public page (SSRF-guarded; `max_chars` default 8000, max 40 000). */
  fetch(body: ToolFetchRequest, opts: CallOpts = {}): Promise<ToolFetchResponse> {
    return this.http.json<ToolFetchResponse>('/v1/tools/fetch', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/tools/ground` — find a described UI element on an inline screenshot (`data:image/...;base64`).
   * Returns `x_norm`/`y_norm` in 0..1 (plus `x`/`y` pixels when `width`/`height` are sent); `found: false` = not on it.
   */
  ground(body: ToolGroundRequest, opts: CallOpts = {}): Promise<ToolGroundResponse> {
    return this.http.json<ToolGroundResponse>('/v1/tools/ground', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
