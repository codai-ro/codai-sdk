/** `/v1/memory` — your persistent memory (same store as the MCP memory tools). */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type MemoryItem = Schema<'MemoryItem'>;
export type MemoryHit = Schema<'MemoryHit'>;
export type MemoryTier = MemoryItem['tier'];
export type MemoryList = Reply<'listMemories'>;
export type MemorySearchResult = Reply<'searchMemories'>;
export type MemoryListQuery = Mutable<QueryOf<'listMemories'>>;
export type MemorySearchQuery = Mutable<QueryOf<'searchMemories'>>;
export type MemoryCreateInput = Mutable<Body<'createMemory'>>;
export type MemoryCreated = Reply<'createMemory', 201>;
export type MemoryDeleted = Reply<'deleteMemory'>;
export type MemoryDeletedAll = Reply<'deleteAllMemories'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Memory {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/memory` — newest first; `limit` 1–100 (20), optional `tier`. Not metered. */
  list(query: MemoryListQuery = {}, opts: CallOpts = {}): Promise<MemoryList> {
    return this.http.json<MemoryList>('/v1/memory', {
      query: { tier: query.tier, limit: query.limit, offset: query.offset },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/memory/search` — semantic recall, most relevant first; `limit` 1–10 (5). One embedding. */
  search(query: MemorySearchQuery, opts: CallOpts = {}): Promise<MemorySearchResult> {
    return this.http.json<MemorySearchResult>('/v1/memory/search', {
      query: { q: query.q, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/memory` — store one semantic memory (`content` ≤ 4000 chars, `importance` 0–1, default 0.6). */
  create(input: MemoryCreateInput, opts: CallOpts = {}): Promise<MemoryCreated> {
    return this.http.json<MemoryCreated>('/v1/memory', {
      method: 'POST',
      body: input,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/memory/{id}` — 404 when the id is unknown or not yours. */
  delete(id: string, opts: CallOpts = {}): Promise<MemoryDeleted> {
    return this.http.json<MemoryDeleted>(`/v1/memory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `DELETE /v1/memory?confirm=all` — erase EVERY memory of your account (all tiers). Irreversible; returns the
   * counts per tier and the total. Allowed on every plan.
   */
  deleteAll(opts: CallOpts = {}): Promise<MemoryDeletedAll> {
    return this.http.json<MemoryDeletedAll>('/v1/memory', {
      method: 'DELETE',
      query: { confirm: 'all' },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
