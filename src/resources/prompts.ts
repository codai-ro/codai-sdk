/** `/v1/prompts/*` — pending prompts: ready-to-paste prompts left for a future chat (handoffs, follow-ups). */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
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
export type PromptReport = Schema<'PromptReport'>;
export type PromptMatchRequest = Mutable<Body<'matchPrompt'>>;
export type PromptMatched = Reply<'matchPrompt'>;
export type PromptVerifyRequest = Mutable<Body<'verifyPrompt'>>;
export type PromptVerified = Reply<'verifyPrompt'>;
export type PromptVerifyManyRequest = Mutable<Body<'verifyPrompts'>>;
export type PromptVerifyManyResult = Reply<'verifyPrompts'>;

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
