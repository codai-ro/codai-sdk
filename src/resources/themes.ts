/**
 * `/v1/themes` — the curated third-party colour theme catalogue (licensed themes with provenance). Public: works
 * without an API key on the gateway, but the SDK sends its bearer as usual (harmless). The answer carries a strong
 * `etag`; pass it back as `{ etag }` to revalidate cheaply — a 304 resolves to `{ notModified: true }`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Schema } from './_shared';

export type ThemesCatalog = Schema<'ThemesCatalog'>;
export type CatalogTheme = Schema<'CatalogTheme'>;

/** `themes.list({ etag })` when the catalogue did not change since that ETag (HTTP 304). */
export type ThemesNotModified = { readonly notModified: true };

type ListOpts = { etag?: string; ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Themes {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/themes` — the full catalogue `{ version, etag, themes }`. With `opts.etag` sends `If-None-Match`; when
   * it still matches the gateway answers 304 and this resolves to `{ notModified: true }`.
   */
  async list(opts: ListOpts = {}): Promise<ThemesCatalog | ThemesNotModified> {
    const res = await this.http.request('/v1/themes', {
      ...(opts.etag ? { headers: { 'If-None-Match': opts.etag } } : {}),
      acceptStatus: [304],
      ext: opts.ext,
      signal: opts.signal,
    });
    if (res.status === 304) return { notModified: true };
    return (await res.json()) as ThemesCatalog;
  }
}
