/** `/v1/usage` + `/v1/keys` — the caller's own usage breakdown and API keys (device attribution, tags). */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type UsageReport = Schema<'UsageReport'>;
export type UsageRow = Schema<'UsageRow'>;
export type UsageGroupBy = UsageReport['group_by'];
/** `from` / `to` are inclusive `YYYY-MM-DD` UTC dates; `cost_micro_usd` in the reply is USD micros as a string. */
export type UsageQuery = Mutable<QueryOf<'getUsage'>>;
export type ApiKeyInfo = Schema<'ApiKeyInfo'>;
export type ApiKeyList = Reply<'listKeys'>;
export type ApiKeyTags = Reply<'setKeyTags'>;

export interface ApiKeyListQuery {
  /** Also return revoked keys. */
  include_revoked?: boolean;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Usage {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/usage` — default: last 30 days grouped by `day`; at most 400 days per call. */
  get(query: UsageQuery = {}, opts: CallOpts = {}): Promise<UsageReport> {
    return this.http.json<UsageReport>('/v1/usage', {
      query: {
        from: query.from,
        to: query.to,
        group_by: query.group_by,
        key: query.key,
        device: query.device,
        app: query.app,
        platform: query.platform,
        model: query.model,
        tag: query.tag,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Keys {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/keys` — your keys (never the secret); `current: true` marks the calling key. */
  list(query: ApiKeyListQuery = {}, opts: CallOpts = {}): Promise<ApiKeyList> {
    return this.http.json<ApiKeyList>('/v1/keys', {
      query: { include_revoked: query.include_revoked ? 'true' : undefined },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/keys/{id}` — replace the key's tags (≤ 16, each ≤ 32 chars; `[]` clears). */
  setTags(id: string, tags: string[], opts: CallOpts = {}): Promise<ApiKeyTags> {
    return this.http.json<ApiKeyTags>(`/v1/keys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { tags },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
