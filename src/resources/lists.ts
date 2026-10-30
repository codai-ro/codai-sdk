/** `/v1/lists/*`, `/v1/share` — lists and the share-sheet entry point. */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type List = Schema<'List'>;
export type ListItem = Schema<'ListItem'>;
export type ListCreateInput = Mutable<Schema<'ListCreateInput'>>;
export type ListPatchInput = Mutable<Schema<'ListPatchInput'>>;
export type ListItemInput = Mutable<Schema<'ListItemInput'>>;
export type ListItemPatchInput = Mutable<Schema<'ListItemPatchInput'>>;
export type ListItemCreated = Schema<'ListItemCreated'>;
export type ListOk = Schema<'ListOk'>;
export type ShareRequest = Mutable<Body<'shareToList'>>;
export type ShareResponse = Schema<'ShareResponse'>;

/** One `event: list` frame of `GET /v1/lists/stream`. */
export interface ListStreamEvent {
  op: 'lists' | 'item' | 'item_delete';
  listId?: string;
  itemId?: string;
}

/** An item image (`GET /v1/lists/items/{itemId}/image`). */
export interface ListItemImage {
  bytes: Uint8Array;
  contentType: string;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const one = (id: string, suffix = '') => `/v1/lists/${encodeURIComponent(id)}${suffix}`;
const item = (id: string, suffix = '') => `/v1/lists/items/${encodeURIComponent(id)}${suffix}`;

export class Lists {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/lists` — share-sheet order; presets are created on the first call. */
  async list(params: { archived?: boolean } = {}, opts: CallOpts = {}): Promise<List[]> {
    const r = await this.http.json<Reply<'listLists'>>('/v1/lists', {
      query: { archived: params.archived ? '1' : undefined },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.lists];
  }

  /** `POST /v1/lists` — a custom list. */
  async create(body: ListCreateInput, opts: CallOpts = {}): Promise<List> {
    const r = await this.http.json<Reply<'createList', 201>>('/v1/lists', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [201],
    });
    return r.list;
  }

  /** `PATCH /v1/lists/order` — the order of your lists (and of the share-sheet targets). */
  reorder(ids: string[], opts: CallOpts = {}): Promise<ListOk> {
    return this.http.json<ListOk>('/v1/lists/order', {
      method: 'PATCH',
      body: { ids },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/lists/stream` — live `list` events (keepalives skipped). */
  async *stream(opts: CallOpts = {}): AsyncGenerator<ListStreamEvent, void, undefined> {
    for await (const frame of this.http.sse('/v1/lists/stream', {
      ext: opts.ext,
      signal: opts.signal,
    })) {
      if (frame.event !== 'list') continue;
      const data = frameJson<ListStreamEvent>(frame);
      if (data) yield data;
    }
  }

  /** `PATCH /v1/lists/{id}` — name, icon, color, share-sheet visibility, price watch, archived. */
  async update(id: string, patch: ListPatchInput, opts: CallOpts = {}): Promise<List> {
    const r = await this.http.json<Reply<'updateList'>>(one(id), {
      method: 'PATCH',
      body: patch,
      ext: opts.ext,
      signal: opts.signal,
    });
    return r.list;
  }

  /** `DELETE /v1/lists/{id}` — custom lists only (presets → 409 `preset_list`). */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(one(id), { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/lists/{id}/items` — pinned first, then newest; done items only with `done: true`. */
  async items(
    id: string,
    params: { done?: boolean; limit?: number } = {},
    opts: CallOpts = {},
  ): Promise<ListItem[]> {
    const r = await this.http.json<Reply<'listListItems'>>(one(id, '/items'), {
      query: { done: params.done ? '1' : undefined, limit: params.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.items];
  }

  /** `POST /v1/lists/{id}/items` — 201 created, or 200 with the existing item (`created: false`). */
  add(id: string, body: ListItemInput, opts: CallOpts = {}): Promise<ListItemCreated> {
    return this.http.json<ListItemCreated>(one(id, '/items'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [200, 201],
    });
  }

  /** `PATCH /v1/lists/items/{itemId}` — title, body, done, pinned, reminder; `list_id` moves it. */
  async updateItem(
    itemId: string,
    patch: ListItemPatchInput,
    opts: CallOpts = {},
  ): Promise<ListItem> {
    const r = await this.http.json<Reply<'updateListItem'>>(item(itemId), {
      method: 'PATCH',
      body: patch,
      ext: opts.ext,
      signal: opts.signal,
    });
    return r.item;
  }

  /** `DELETE /v1/lists/items/{itemId}` — also deletes its uploaded media. */
  async deleteItem(itemId: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(item(itemId), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/lists/items/{itemId}/image` — the uploaded image or the unfurled preview image. */
  async image(itemId: string, opts: CallOpts = {}): Promise<ListItemImage> {
    const res = await this.http.request(item(itemId, '/image'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  /** `GET /v1/lists/{id}/export.md` — the whole list as GitHub-flavoured Markdown. */
  async exportMarkdown(id: string, opts: CallOpts = {}): Promise<string> {
    const res = await this.http.request(one(id, '/export.md'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return res.text();
  }

  /** `POST /v1/share` — share-sheet entry point (`list_id`, `preset`, or auto → Inbox + suggestion). */
  share(body: ShareRequest, opts: CallOpts = {}): Promise<ShareResponse> {
    return this.http.json<ShareResponse>('/v1/share', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [200, 201],
    });
  }
}
