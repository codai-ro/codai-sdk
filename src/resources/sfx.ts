/**
 * `/v1/studio/sfx` — the codai Studio sound-effects library (`codai-sfx`): curated CC0 sounds (Kenney packs) plus a
 * Freesound CC0-only fallback when the gateway has one configured. Searching and importing are free; an imported
 * sound becomes a studio asset (`kind: 'sfx'`) usable as `asset:<asset_id>` in `renders.create`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type AssetDto } from './assets';
import { type QueryOf, type Reply, type Schema } from './_shared';

/** One sound (always `license: 'CC0-1.0'`). */
export type SfxDto = Schema<'SfxDto'>;
export type SfxCategory = Schema<'SfxCategory'>;
export type SfxList = Reply<'searchSfx'>;
/** `GET /v1/studio/sfx` query; `tags` may also be passed as an array (joined with commas). */
export type SfxSearchParams = Omit<QueryOf<'searchSfx'>, 'tags'> & {
  tags?: string | readonly string[];
};
/** Search result plus whether the Freesound fallback failed (`x-codai-sfx-fallback: unavailable`). */
export type SfxSearchResult = SfxList & { fallbackUnavailable: boolean };

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Sfx {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/studio/sfx` — best match first; `limit` 1–50 (default 20). */
  async search(params: SfxSearchParams = {}, opts: CallOpts = {}): Promise<SfxSearchResult> {
    const tags = Array.isArray(params.tags)
      ? params.tags.join(',')
      : (params.tags as string | undefined);
    const res = await this.http.request('/v1/studio/sfx', {
      query: {
        q: params.q,
        category: params.category,
        tags: tags || undefined,
        max_duration: params.max_duration,
        limit: params.limit,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
    const body = (await res.json()) as SfxList;
    return {
      ...body,
      fallbackUnavailable: res.headers.get('x-codai-sfx-fallback') === 'unavailable',
    };
  }

  /**
   * `POST /v1/studio/sfx/{sfx_id}/import` — copies the sound into your assets (`kind: 'sfx'`, free). Freesound items
   * whose licence is not CC0 are refused with 400 `license_not_allowed`; an unknown id is 404.
   */
  import(sfxId: string, opts: CallOpts = {}): Promise<AssetDto> {
    return this.http.json<AssetDto>(`/v1/studio/sfx/${encodeURIComponent(sfxId)}/import`, {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
