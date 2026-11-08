/**
 * codai Studio brand kits — reusable brand tokens (5 colour roles + extras, 2 fonts, optional radius) stored as a
 * Design Tokens (DTCG 2025.10) document, plus a logo.
 *
 *   `POST   /v1/studio/brand-kits`             — create from flat `tokens` or a DTCG document (`create`), HTTP 201
 *   `PATCH  /v1/studio/brand-kits/{id}`        — edit name / tokens (merged) / dtcg (replaced) / logo (`update`)
 *   `GET    /v1/studio/brand-kits/{id}/dtcg`   — the kit as a DTCG JSON document (`exportDtcg`)
 *   `POST   /v1/studio/brand-kits/extract`     — from a public https page (`{ url }`) or a logo image asset
 *                                                (`{ logo_asset_id }`); one `codai` turn (`extract`, token-metered)
 *   `GET    /v1/studio/brand-kits`             — your kits, newest first (`list`)
 *   `GET    /v1/studio/brand-kits/{id}`        — one kit with a signed logo URL (`retrieve`)
 *   `DELETE /v1/studio/brand-kits/{id}`        — soft delete (`delete`)
 *
 * Apply a kit when creating a creative (`creatives.create({ kind, brand_kit_id })`), re-apply it to an existing one
 * with `creatives.restyle(id, { brand_kit_id })`, or set tokens directly with a `setBrand` op.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type BrandKit = Schema<'BrandKit'>;
export type BrandKitTokens = Schema<'BrandKitTokens'>;
export type BrandKitDtcg = Mutable<Schema<'BrandKitDtcg'>>;
export type BrandKitContrastPair = Schema<'BrandKitContrastPair'>;
/** `{ url, name? }` (a web page) or `{ logo_asset_id, name? }` (one of your image assets) — exactly one source. */
export type BrandKitExtractRequest = Mutable<Body<'extractBrandKit'>>;
/** `{ name, tokens }` or `{ name, dtcg }` (exactly one), optional `logo_asset_id` / `source_url`. */
export type BrandKitCreateRequest = Mutable<Body<'createBrandKit'>>;
/** At least one of `name`, `tokens` (partial, merged), `dtcg` (replaces), `logo_asset_id` (`null` removes). */
export type BrandKitUpdateRequest = Mutable<Body<'updateBrandKit'>>;
export type BrandKitList = Reply<'listBrandKits'>;
export type BrandKitDeleted = Reply<'deleteBrandKit'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const path = (id: string, tail = '') => `/v1/studio/brand-kits/${encodeURIComponent(id)}${tail}`;

export class BrandKits {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a kit you define: flat `tokens` (the 5 colours `#rrggbb`, optional fonts) or a DTCG document in `dtcg`
   * (import) — exactly one. 400 `invalid_tokens` (with `details.issues`) for an invalid DTCG document, 404 when
   * `logo_asset_id` is not one of your ready image assets. Free.
   */
  create(body: BrandKitCreateRequest, opts: CallOpts = {}): Promise<BrandKit> {
    return this.http.json<BrandKit>('/v1/studio/brand-kits', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /**
   * Edit a kit: `tokens` is merged onto the current kit, `dtcg` replaces the whole document (not both),
   * `logo_asset_id: null` removes the logo. Creatives keep their tokens until `creatives.restyle`. Free.
   */
  update(id: string, body: BrandKitUpdateRequest, opts: CallOpts = {}): Promise<BrandKit> {
    return this.http.json<BrandKit>(path(id), {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** The kit as a DTCG 2025.10 JSON document (`$extensions['ro.codai']` = kit id, name, logo asset id). Free. */
  exportDtcg(id: string, opts: CallOpts = {}): Promise<BrandKitDtcg> {
    return this.http.json<BrandKitDtcg>(path(id, '/dtcg'), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * Extract a brand kit from a public `https` page (`{ url }`) or from one of your logo images
   * (`{ logo_asset_id }`, PNG / JPEG / WebP up to 5 MB; it becomes the kit logo): palette (primary, secondary, accent,
   * background, text) and heading / body fonts. One bounded `codai` model call (token-metered); 400 `url_blocked` for
   * private hosts, 400 `unsupported_media` for a bad logo, 422 `fetch_failed` / `extract_failed`, 504 `timeout`.
   */
  extract(body: BrandKitExtractRequest, opts: CallOpts = {}): Promise<BrandKit> {
    return this.http.json<BrandKit>('/v1/studio/brand-kits/extract', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Your brand kits, newest first (`limit` 1–100, default 50). Free. */
  list(query: { limit?: number } = {}, opts: CallOpts = {}): Promise<BrandKitList> {
    return this.http.json<BrandKitList>('/v1/studio/brand-kits', {
      query: { limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** One kit with a signed logo URL (1 h), its `dtcg` and the WCAG `contrast` pairs. Free. */
  retrieve(id: string, opts: CallOpts = {}): Promise<BrandKit> {
    return this.http.json<BrandKit>(path(id), { ext: opts.ext, signal: opts.signal });
  }

  /** Delete a kit (creatives keep their tokens; the logo asset stays). Free. */
  delete(id: string, opts: CallOpts = {}): Promise<BrandKitDeleted> {
    return this.http.json<BrandKitDeleted>(path(id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
