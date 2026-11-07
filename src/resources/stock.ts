/**
 * `/v1/studio/stock` — royalty-free stock b-roll for codai Studio (SX-08): Pexels first, Pixabay as the fallback
 * (each only when the gateway has its key; Pixabay AI-generated items are filtered out). Searching and importing are
 * free (600 searches and 200 new imports per user per day).
 *
 * Licence: Pexels License / Pixabay Content License — use inside a new work (commercial included), never redistribute
 * the raw files, never build a competing stock service, bulk-copy or train models on them. Show every item's `credit`
 * (e.g. "Video by Jane Doe on Pexels", linked to `page_url`) wherever you display it, and keep the imported asset's
 * `credit` visible wherever you publish the work. `preview_url` / `files[].url` are for temporary display only.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type QueryOf, type Schema } from './_shared';

export type StudioStockItem = Schema<'StudioStockItem'>;
export type StudioStockFile = Schema<'StudioStockFile'>;
export type StudioStockProvider = Schema<'StudioStockProvider'>;
export type StudioStockList = Schema<'StudioStockList'>;
/** `GET /v1/studio/stock/search` query (`q` required; `kind` default `video`, `limit` 1–30 default 15). */
export type StudioStockSearchParams = QueryOf<'searchStudioStock'>;
export type StudioStockImportRequest = Mutable<Schema<'StudioStockImportRequest'>>;
export type StudioStockImport = Schema<'StudioStockImport'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Stock {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/studio/stock/search` — best match first, with `providers_tried`, provider `warnings` and the
   * `attribution` links. 503 `stock_unavailable` when no provider is configured, 429 `stock_rate_limited` when every
   * provider is rate limited.
   */
  search(params: StudioStockSearchParams, opts: CallOpts = {}): Promise<StudioStockList> {
    return this.http.json<StudioStockList>('/v1/studio/stock/search', {
      query: {
        q: params.q,
        kind: params.kind,
        orientation: params.orientation,
        locale: params.locale,
        min_duration: params.min_duration,
        max_duration: params.max_duration,
        limit: params.limit,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/stock/import` — copies one item (the variant closest to `target_width` × `target_height`) into
   * your assets with its licence recorded; usable only inside your creatives. Idempotent per item (the server answers
   * 201 for a new copy, 200 with the existing asset otherwise).
   */
  import(body: StudioStockImportRequest, opts: CallOpts = {}): Promise<StudioStockImport> {
    return this.http.json<StudioStockImport>('/v1/studio/stock/import', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
