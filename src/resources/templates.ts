/**
 * codai Studio templates — private, reusable creative documents with variables, saved from your own creatives.
 *
 *   `POST   /v1/studio/creatives/{id}/template` — save a creative as a template (`creatives.saveTemplate`), HTTP 201
 *   `GET    /v1/studio/templates`               — your templates, newest first (`list`, without `doc`)
 *   `GET    /v1/studio/templates/{id}`          — one template with its `doc` (`retrieve`)
 *   `DELETE /v1/studio/templates/{id}`          — soft delete (`delete`)
 *
 * Create a creative from a template with `creatives.create({ kind, template, vars })`. Everything here is free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type QueryOf, type Reply, type Schema } from './_shared';

export type CreativeTemplateVar = Schema<'CreativeTemplateVar'>;
export type CreativeTemplateList = Reply<'listCreativeTemplates'>;
export type CreativeTemplateListQuery = QueryOf<'listCreativeTemplates'>;
export type CreativeTemplateDeleted = Reply<'deleteCreativeTemplate'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const path = (id: string) => `/v1/studio/templates/${encodeURIComponent(id)}`;

export class Templates {
  constructor(private readonly http: HttpClient) {}

  /** Your templates, newest first (`kind` filter, `limit` 1–100, default 50); without `doc`. Free. */
  list(query: CreativeTemplateListQuery = {}, opts: CallOpts = {}): Promise<CreativeTemplateList> {
    return this.http.json<CreativeTemplateList>('/v1/studio/templates', {
      query: { kind: query.kind, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** One template with its variables and `doc`. Free. */
  retrieve(id: string, opts: CallOpts = {}): Promise<Schema<'CreativeTemplate'>> {
    return this.http.json<Schema<'CreativeTemplate'>>(path(id), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Delete a template (creatives made from it are not affected). Free. */
  delete(id: string, opts: CallOpts = {}): Promise<CreativeTemplateDeleted> {
    return this.http.json<CreativeTemplateDeleted>(path(id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
