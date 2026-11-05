/** `/v1/prompts/*` — pending prompts: ready-to-paste prompts left for a future chat (handoffs, follow-ups). */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

/** PR-07 recurrence: repeat every day/week/month (at HH:MM UTC), or reopen when the run session ends. */
export type PromptRecurrence = Mutable<Schema<'PromptRecurrence'>>;
/** PR-07 launch preset applied when the prompt is started. */
export type PromptLaunchConfig = Mutable<Schema<'PromptLaunchConfig'>>;

export type Prompt = Schema<'Prompt'>;
/** PR-04 / PR-07 organise fields (present on every prompt row). */
export type PromptOrganizeFields = Pick<
  Prompt,
  'tags' | 'priority' | 'recurrence' | 'next_prompt_id' | 'launch' | 'is_template'
>;
export type PromptStatus = Schema<'PromptStatus'>;
export type PromptSource = Schema<'PromptSource'>;
export type PromptList = Reply<'listPrompts'>;
/** PR-04 list / export filters; `tag` also accepts one string (a single tag or a comma list). AND semantics. */
export type PromptListFilters = Omit<
  Mutable<QueryOf<'listPrompts'>>,
  'tag' | 'status' | 'limit'
> & { tag?: string | string[] };
export type PromptListQuery = Omit<Mutable<QueryOf<'listPrompts'>>, 'tag'> & PromptListFilters;
export type PromptCreateRequest = Mutable<Body<'createPrompt'>>;
export type PromptCreated = Reply<'createPrompt'>;
export type PromptPatch = Mutable<Body<'updatePrompt'>>;
export type PromptLaunched = Reply<'launchPrompt'>;
export type PromptDeleted = Reply<'deletePrompt'>;
export type PromptReport = Schema<'PromptReport'>;
export type PromptMatchRequest = Mutable<Body<'matchPrompt'>>;
export type PromptMatched = Reply<'matchPrompt'>;
export type PromptVerifyRequest = Mutable<Body<'verifyPrompt'>>;
export type PromptVerified = Reply<'verifyPrompt'>;
export type PromptVerifyManyRequest = Mutable<Body<'verifyPrompts'>>;
export type PromptVerifyManyResult = Reply<'verifyPrompts'>;

/** PR-05 `POST /v1/prompts/bulk`. */
export type PromptBulkRequest = Mutable<Body<'bulkPrompts'>>;
export type PromptBulkResult = Reply<'bulkPrompts'>;
export type PromptHistoryEvent = Schema<'PromptEvent'>;
export type PromptEventKind = PromptHistoryEvent['kind'];
export type PromptEventList = Reply<'listPromptEvents'>;
export type PromptExportQuery = Omit<Mutable<QueryOf<'exportPrompts'>>, 'tag'> & PromptListFilters;

/** One `event: prompt` frame of `GET /v1/prompts/stream`. */
export interface PromptStreamEvent {
  op: 'upsert' | 'delete';
  id: string;
  status: PromptStatus | 'deleted';
  /** Full prompt on `upsert`. */
  prompt?: Prompt;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const one = (id: string, suffix = '') => `/v1/prompts/${encodeURIComponent(id)}${suffix}`;

function filterQuery(q: PromptListFilters & { status?: string; limit?: number }) {
  const tag = Array.isArray(q.tag) ? q.tag.join(',') : q.tag;
  return {
    status: q.status,
    limit: q.limit,
    tag: tag || undefined,
    priority_min: q.priority_min,
    q: q.q,
    templates: q.templates,
    sort: q.sort,
    order: q.order,
  };
}

export class Prompts {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/prompts?status=&limit=&tag=&priority_min=&q=&templates=&sort=&order=` — default `open`, templates
   * excluded; `due` = open and `not_before` empty or passed; several tags = AND.
   */
  list(query: PromptListQuery = {}, opts: CallOpts = {}): Promise<PromptList> {
    return this.http.json<PromptList>('/v1/prompts', {
      query: filterQuery(query),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/prompts` — idempotent on the text (`created: false` for a duplicate); `goal_key` supersedes older open ones. */
  create(body: PromptCreateRequest, opts: CallOpts = {}): Promise<PromptCreated> {
    return this.http.json<PromptCreated>('/v1/prompts', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/prompts/{id}`. */
  get(id: string, opts: CallOpts = {}): Promise<Prompt> {
    return this.http.json<Prompt>(one(id), { ext: opts.ext, signal: opts.signal });
  }

  /** `PATCH /v1/prompts/{id}` — edit, snooze (`not_before`), close (`status: 'done' | 'dismissed'`). */
  update(id: string, body: PromptPatch, opts: CallOpts = {}): Promise<Prompt> {
    return this.http.json<Prompt>(one(id), {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/prompts/{id}` — `{ deleted: 0 }` when the id is missing or not yours. */
  delete(id: string, opts: CallOpts = {}): Promise<PromptDeleted> {
    return this.http.json<PromptDeleted>(one(id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/prompts/{id}/launch` — new shared session + `send` control on a device; the prompt becomes `launched`. */
  launch(id: string, deviceId?: string, opts: CallOpts = {}): Promise<PromptLaunched> {
    return this.http.json<PromptLaunched>(one(id, '/launch'), {
      method: 'POST',
      body: deviceId ? { device_id: deviceId } : {},
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/prompts/{id}/match` — the prompt was sent in a chat → `sent` (or `answered`); never downgrades. */
  match(id: string, body: PromptMatchRequest, opts: CallOpts = {}): Promise<PromptMatched> {
    return this.http.json<PromptMatched>(one(id, '/match'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/prompts/{id}/verify` — LLM report over the transcript (sent, or the matched session's stored
   * events) and an optional diff; verdict `done` → `verified`. 502 when the model call fails.
   */
  verify(id: string, body: PromptVerifyRequest = {}, opts: CallOpts = {}): Promise<PromptVerified> {
    return this.http.json<PromptVerified>(one(id, '/verify'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/prompts/verify` — transcript-only verification of up to 20 prompts, sequentially. */
  verifyMany(body: PromptVerifyManyRequest, opts: CallOpts = {}): Promise<PromptVerifyManyResult> {
    return this.http.json<PromptVerifyManyResult>('/v1/prompts/verify', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/prompts/bulk` — one action over up to 200 of your prompts → `{ updated }`. */
  bulk(body: PromptBulkRequest, opts: CallOpts = {}): Promise<PromptBulkResult> {
    return this.http.json<PromptBulkResult>('/v1/prompts/bulk', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/prompts/{id}/events` — history, newest first (max 200). */
  events(id: string, opts: CallOpts = {}): Promise<PromptEventList> {
    return this.http.json<PromptEventList>(one(id, '/events'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/prompts/{id}/instantiate` — open copy of a template (201). */
  instantiate(id: string, opts: CallOpts = {}): Promise<Prompt> {
    return this.http.json<Prompt>(one(id, '/instantiate'), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/prompts/export?format=csv|md` — list filters apply (status defaults to `all`); returns the document text. */
  async exportPrompts(query: PromptExportQuery = {}, opts: CallOpts = {}): Promise<string> {
    const res = await this.http.request('/v1/prompts/export', {
      query: { ...filterQuery(query), format: query.format ?? 'csv' },
      ext: opts.ext,
      signal: opts.signal,
    });
    return res.text();
  }

  /** `GET /v1/prompts/stream` — live `prompt` events (keepalive comments are skipped). Closed by the server after 6 h. */
  async *stream(opts: CallOpts = {}): AsyncGenerator<PromptStreamEvent, void, undefined> {
    const frames = this.http.sse('/v1/prompts/stream', { ext: opts.ext, signal: opts.signal });
    for await (const frame of frames) {
      if (frame.event !== 'prompt') continue;
      const data = frameJson<PromptStreamEvent>(frame);
      if (data) yield data;
    }
  }
}
