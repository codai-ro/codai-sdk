/** `/v1/prompts/*` — pending prompts: ready-to-paste prompts left for a future chat (handoffs, follow-ups). */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type Prompt = Schema<'Prompt'>;
export type PromptStatus = Schema<'PromptStatus'>;
export type PromptSource = Schema<'PromptSource'>;
export type PromptList = Reply<'listPrompts'>;
export type PromptListQuery = Mutable<QueryOf<'listPrompts'>>;
export type PromptCreateRequest = Mutable<Body<'createPrompt'>>;
export type PromptCreated = Reply<'createPrompt'>;
export type PromptPatch = Mutable<Body<'updatePrompt'>>;
export type PromptLaunched = Reply<'launchPrompt'>;
export type PromptDeleted = Reply<'deletePrompt'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const one = (id: string, suffix = '') => `/v1/prompts/${encodeURIComponent(id)}${suffix}`;

export class Prompts {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/prompts?status=&limit=` — default `open`; `due` = open and `not_before` empty or passed. */
  list(query: PromptListQuery = {}, opts: CallOpts = {}): Promise<PromptList> {
    return this.http.json<PromptList>('/v1/prompts', {
      query: { status: query.status, limit: query.limit },
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
}
