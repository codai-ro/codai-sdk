/**
 * `/v1/assets` — the caller's codai Studio assets (media generated with `response_format: 'url'` and every finished
 * video job). Owner-scoped (a foreign id is 404), kept 90 days; each `ready` asset carries a 1 h V4 signed `url`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type QueryOf, type Reply, type Schema } from './_shared';

/** A stored asset (`GET /v1/assets/{id}`; `data` items with `response_format: 'url'`). */
export type AssetDto = Schema<'AssetDto'>;
export type AssetKind = Schema<'AssetKind'>;
export type AssetList = Reply<'listAssets'>;
export type AssetDeleted = Reply<'deleteAsset'>;
export type AssetListQuery = QueryOf<'listAssets'>;
/** `b64_json` (default, inline bytes) or `url` (stored asset + 1 h signed URL; 503 `assets_unavailable` without storage). */
export type MediaResponseFormat = Schema<'MediaResponseFormat'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

/** True for a `data` item that is a stored asset rather than inline base64. */
export function isAssetDto(item: unknown): item is AssetDto {
  return typeof item === 'object' && item !== null && 'asset_id' in item;
}

export class Assets {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/assets` — newest first, `limit` ≤ 100 (default 30). Paginate by passing `next_before` as `before`. */
  list(query: AssetListQuery = {}, opts: CallOpts = {}): Promise<AssetList> {
    return this.http.json<AssetList>('/v1/assets', {
      query: { kind: query.kind, before: query.before, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Iterate every asset across pages (`list` with `before` = previous `next_before`). */
  async *iterate(
    query: Omit<AssetListQuery, 'before'> = {},
    opts: CallOpts = {},
  ): AsyncGenerator<AssetDto, void, undefined> {
    let before: string | undefined;
    for (;;) {
      const page = await this.list({ ...query, before }, opts);
      yield* page.data;
      if (!page.next_before) return;
      before = page.next_before;
    }
  }

  /** `GET /v1/assets/{id}` — one asset with a fresh 1 h signed `url` (`null` while not `ready`). */
  retrieve(id: string, opts: CallOpts = {}): Promise<AssetDto> {
    return this.http.json<AssetDto>(`/v1/assets/${encodeURIComponent(id)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * A fresh signed URL of the asset's bytes (valid 1 h), from `GET /v1/assets/{id}`. Throws when the asset has no
   * content yet. Use it in `<audio>`/`<video>`/`fetch` — it needs no Authorization header.
   */
  async contentUrl(id: string, opts: CallOpts = {}): Promise<string> {
    const a = await this.retrieve(id, opts);
    if (!a.url) throw new Error(`codai asset ${id} has no content yet (status ${a.status})`);
    return a.url;
  }

  /**
   * The authenticated redirect endpoint `GET /v1/assets/{id}/content` (302 to the signed URL). Useful for tools that
   * follow redirects with the API key (`curl -L -H 'Authorization: Bearer …'`); browsers should use `contentUrl()`.
   */
  contentPath(id: string): string {
    return this.http.url(`/v1/assets/${encodeURIComponent(id)}/content`);
  }

  /** Download the asset's bytes (fetches the signed URL, no API key sent to storage). */
  async content(id: string, opts: CallOpts = {}): Promise<Uint8Array> {
    const url = await this.contentUrl(id, opts);
    const res = await fetch(url, opts.signal ? { signal: opts.signal } : {});
    if (!res.ok) throw new Error(`codai asset ${id} download failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** `DELETE /v1/assets/{id}` — deletes the object; signed URLs already handed out stop working. */
  delete(id: string, opts: CallOpts = {}): Promise<AssetDeleted> {
    return this.http.json<AssetDeleted>(`/v1/assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
