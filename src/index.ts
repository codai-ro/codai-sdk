/**
 * codai-sdk — official TypeScript client for the codai AI gateway.
 *
 * Full parity with the public gateway OpenAPI (every `operationId` has one
 * method — see `OPERATION_METHODS`). Resources hang off the `Codai` client:
 *
 *   client.chat.completions.create / .stream   client.messages / client.responses
 *   client.embeddings / client.audio / client.tokens / client.models / client.health
 *   client.systemOne.create (typed decisions, codai-s1)
 *   client.agents.run + client.agents.runs.*    client.tools.search / .fetch
 *   client.tasks.*                              client.sessions.* (events, controls, lease, shares, stream)
 *   client.devices.* / client.hosts.*           client.orgs.* / client.account / client.receipt
 *   client.projects.*                           client.environments.* (members, ports, secrets)
 *   client.feedback / client.phoneModels
 *
 * Top-level `chat()`, `chatStream()`, `embeddings()`, `models()`, `feedback()`,
 * `mintToken()` from 0.2.x are kept as thin aliases.
 *
 * Zero runtime dependencies; Node 18+ (global fetch) and modern edge runtimes.
 */

import { type CodaiRequestExtensions, HttpClient } from './http';
import { Account, Feedback, PhoneModels, Receipts } from './resources/account';
import { Agents } from './resources/agents';
import { Audio } from './resources/audio';
import {
  Chat,
  type ChatCompletionInput,
  type ChatCompletionRequest,
  type ChatMessage,
  type ChatResult,
  type ChatStream,
} from './resources/chat';
import { Devices } from './resources/devices';
import { Embeddings } from './resources/embeddings';
import { Environments } from './resources/environments';
import { Health } from './resources/health';
import { Hosts } from './resources/hosts';
import { Messages } from './resources/messages';
import { Models } from './resources/models';
import { Orgs } from './resources/orgs';
import { Projects } from './resources/projects';
import { Responses } from './resources/responses';
import { Sessions } from './resources/sessions';
import { SystemOne } from './resources/system-one';
import { Tasks } from './resources/tasks';
import { Notifications, Triggers } from './resources/triggers';
import { type EphemeralScope, type EphemeralToken, Tokens } from './resources/tokens';
import { Tools } from './resources/tools';

export interface CodaiClientOptions {
  apiKey: string;
  /** Defaults to https://ai.codai.ro */
  baseUrl?: string;
  /** Stable conversation/session id — sent as `x-codai-session-id` on every request. */
  sessionId?: string;
  /** Device UUID for shared-sessions / hosts — sent as `x-codai-device` on every request. */
  device?: string;
  /** Device name / platform recorded on first registration. */
  deviceName?: string;
  devicePlatform?: CodaiRequestExtensions['devicePlatform'];
  /** Client surface tag (`x-codai-client`). */
  client?: string;
  /** Any other default `X-Codai-*` extensions (per-call bags override). */
  defaults?: CodaiRequestExtensions;
  /** Default request timeout (ms). Default 120_000. Streams are not time-capped. */
  timeoutMs?: number;
  /** Retries on 429/5xx with exponential backoff. Default 2. */
  maxRetries?: number;
  /** Injectable fetch (tests / custom agents). */
  fetch?: typeof fetch;
}

/** 0.2.x-compatible chat options (thin alias over `chat.completions`). */
export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ChatCompletionRequest['tools'];
  /** codai extension: plan-and-execute agent mode (Pro+). */
  agentMode?: boolean;
  /** codai extension: server-side context compaction ('auto'). */
  compact?: 'auto';
  /** codai extension: best-of-N override (0 disables, 3 forces). */
  bestOf?: 0 | 3;
  /** Attribution id recorded on tool calls (agent fleets). */
  agentId?: string;
  /** Per-call session override. */
  sessionId?: string;
  /** Any other `X-Codai-*` extension. */
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
}

export interface EmbeddingsOptions {
  input: string | string[];
  model?: string;
  dimensions?: number;
  signal?: AbortSignal;
}

export class Codai {
  readonly http: HttpClient;

  /** Resource group (`chat.completions.create/stream`) that is also callable with the 0.2.x `chat({ messages })` shape. */
  readonly chat: Chat & ((opts: ChatOptions) => Promise<ChatResult>);
  readonly messages: Messages;
  readonly responses: Responses;
  readonly embeddings: Embeddings &
    ((opts: EmbeddingsOptions) => Promise<{ embeddings: number[][]; raw: unknown }>);
  readonly audio: Audio;
  /** Typed decisions from codai-s1 (`systemOne.create({ state, questions })`). */
  readonly systemOne: SystemOne;
  readonly tokens: Tokens;
  readonly models: Models & (() => Promise<Array<{ id: string }>>);
  readonly health: Health;
  readonly agents: Agents;
  readonly tools: Tools;
  readonly tasks: Tasks;
  /** Event triggers — webhooks that notify you or start agent sessions. */
  readonly triggers: Triggers;
  /** Inbox of trigger / cloud-task notifications. */
  readonly notifications: Notifications;
  readonly sessions: Sessions;
  readonly devices: Devices;
  readonly hosts: Hosts;
  readonly orgs: Orgs;
  readonly projects: Projects;
  readonly environments: Environments;
  readonly account: Account;
  readonly receipt: Receipts;
  readonly feedback: Feedback &
    ((requestId: string, rating: 1 | -1, comment?: string) => Promise<void>);
  readonly phoneModels: PhoneModels;

  constructor(opts: CodaiClientOptions) {
    if (!opts.apiKey) throw new Error('Codai: apiKey is required');
    this.http = new HttpClient({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? 'https://ai.codai.ro',
      timeoutMs: opts.timeoutMs ?? 120_000,
      maxRetries: opts.maxRetries ?? 2,
      fetch: opts.fetch,
      defaults: {
        ...opts.defaults,
        ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
        ...(opts.device ? { device: opts.device } : {}),
        ...(opts.deviceName ? { deviceName: opts.deviceName } : {}),
        ...(opts.devicePlatform ? { devicePlatform: opts.devicePlatform } : {}),
        ...(opts.client ? { client: opts.client } : {}),
      },
    });
    const http = this.http;

    this.messages = new Messages(http);
    this.responses = new Responses(http);
    this.audio = new Audio(http);
    this.systemOne = new SystemOne(http);
    this.tokens = new Tokens(http);
    this.health = new Health(http);
    this.agents = new Agents(http);
    this.tools = new Tools(http);
    this.tasks = new Tasks(http);
    this.triggers = new Triggers(http);
    this.notifications = new Notifications(http);
    this.sessions = new Sessions(http);
    this.devices = new Devices(http);
    this.hosts = new Hosts(http);
    this.orgs = new Orgs(http);
    this.projects = new Projects(http);
    this.environments = new Environments(http);
    this.account = new Account(http);
    this.receipt = new Receipts(http);
    this.phoneModels = new PhoneModels(http);

    // Callable resources keep the 0.2.x top-level signatures working
    // (`client.embeddings({...})`, `client.models()`, `client.feedback(id, 1)`)
    // while also exposing `.create()` / `.list()` / `.submit()`.
    this.chat = callable(new Chat(http), (o: ChatOptions) =>
      this.chat.completions.create(this.legacyBody(o), {
        ext: this.legacyExt(o),
        signal: o.signal,
      }),
    );
    this.embeddings = callable(new Embeddings(http), async (o: EmbeddingsOptions) => {
      const r = await this.embeddings.create(
        { input: o.input, model: o.model, dimensions: o.dimensions },
        { signal: o.signal },
      );
      return { embeddings: r.embeddings, raw: r.raw };
    });
    this.models = callable(new Models(http), async () =>
      (await this.models.list()).map((m) => ({ id: m.id })),
    );
    this.feedback = callable(
      new Feedback(http),
      async (requestId: string, rating: 1 | -1, comment?: string) => {
        await this.feedback.submit({
          event_id: requestId,
          rating,
          ...(comment ? { comment } : {}),
        });
      },
    );
  }

  // ------------------------------------------------- 0.2.x compatibility aliases

  /** Alias of `chat.completions.stream()` with the 0.2.x option names. */
  chatStream(opts: ChatOptions): ChatStream {
    return this.chat.completions.stream(this.legacyBody(opts), {
      ext: this.legacyExt(opts),
      signal: opts.signal,
    });
  }

  /** Alias of `tokens.create()`. */
  mintToken(scope: EphemeralScope, ttlSeconds?: number): Promise<EphemeralToken> {
    return this.tokens.create(scope, ttlSeconds);
  }

  private legacyBody(opts: ChatOptions): ChatCompletionInput {
    return {
      model: opts.model ?? 'codai',
      messages: opts.messages,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.tools ? { tools: opts.tools } : {}),
    };
  }

  private legacyExt(opts: ChatOptions): CodaiRequestExtensions {
    return {
      ...opts.ext,
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts.agentMode ? { mode: 'agent' as const } : {}),
      ...(opts.compact ? { compact: opts.compact } : {}),
      ...(opts.bestOf !== undefined ? { bestOf: opts.bestOf } : {}),
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
    };
  }
}

/**
 * Make an object callable: returns a function that forwards calls to `fn`
 * and carries every own/prototype member of `target` (methods bound).
 */
function callable<T extends object, F extends (...args: never[]) => unknown>(
  target: T,
  fn: F,
): T & F {
  const f = ((...args: Parameters<F>) => fn(...args)) as T & F;
  for (const key of allKeys(target)) {
    const value = (target as Record<string, unknown>)[key];
    Object.defineProperty(f, key, {
      value:
        typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value,
      enumerable: true,
      writable: false,
    });
  }
  return f;
}

function allKeys(obj: object): string[] {
  const keys = new Set<string>();
  let cur: object | null = obj;
  while (cur && cur !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(cur)) if (k !== 'constructor') keys.add(k);
    cur = Object.getPrototypeOf(cur);
  }
  return [...keys];
}

export default Codai;

// ------------------------------------------------------------------ exports
export { CodaiError, HttpClient, extensionHeaders, readSse, frameJson } from './http';
export type { CodaiRequestExtensions, ErrorCode, SseFrame, RequestOptions } from './http';
export { OPERATION_METHODS, STREAMING_OPERATIONS } from './operations';
export type { paths, components, operations } from './generated/gateway';

export * from './resources/chat';
export * from './resources/messages';
export * from './resources/responses';
export * from './resources/embeddings';
export * from './resources/audio';
export * from './resources/tokens';
export * from './resources/models';
export * from './resources/health';
export * from './resources/agents';
export * from './resources/tools';
export * from './resources/tasks';
export * from './resources/triggers';
export * from './resources/sessions';
export * from './resources/devices';
export * from './resources/hosts';
export * from './resources/orgs';
export * from './resources/projects';
export * from './resources/environments';
export * from './resources/account';
