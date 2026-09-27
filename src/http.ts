/**
 * Shared HTTP layer for every resource: base URL, bearer auth, `X-Codai-*`
 * extension headers, retries, timeouts, JSON + SSE helpers and the
 * `CodaiError` mapping of the gateway error envelope.
 */

import type { components } from './generated/gateway';

export type ErrorEnvelope = components['schemas']['Error'];
export type ErrorCode = ErrorEnvelope['error']['code'];

export class CodaiError extends Error {
  /** Stable gateway error code (`invalid_api_key`, `rate_limit_exceeded`, …) when the body was an error envelope. */
  readonly code: ErrorCode | null;
  /** `x-codai-trace-id` (or `x-request-id`) of the failed response, when present. */
  readonly requestId: string | null;
  /** Seconds to wait before retrying, from `Retry-After` on 429s. */
  readonly retryAfter: number | null;

  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    meta: { code?: ErrorCode | null; requestId?: string | null; retryAfter?: number | null } = {},
  ) {
    super(message);
    this.name = 'CodaiError';
    this.code = meta.code ?? extractCode(body);
    this.requestId = meta.requestId ?? null;
    this.retryAfter = meta.retryAfter ?? null;
  }
}

function extractCode(body: unknown): ErrorCode | null {
  if (body && typeof body === 'object') {
    const err = (body as { error?: { code?: unknown } }).error;
    if (err && typeof err === 'object' && typeof err.code === 'string')
      return err.code as ErrorCode;
  }
  return null;
}

function extractMessage(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const err = (body as { error?: { message?: unknown } }).error;
    if (err && typeof err === 'object' && typeof err.message === 'string') return err.message;
  }
  return null;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Per-request `X-Codai-*` extension headers. Every field maps 1:1 to the
 * request header of the same name (`effort` → `x-codai-effort`). Values are
 * sent verbatim; booleans become `1` / `0`.
 */
export interface CodaiRequestExtensions {
  /** `x-codai-session-id` — groups requests of one conversation. */
  sessionId?: string;
  /** `x-request-id` — echoed as `x-codai-trace-id`. */
  requestId?: string;
  /** `x-codai-effort` */
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'max';
  /** `x-codai-thinking` */
  thinking?: boolean;
  /** `x-codai-thinking-budget` */
  thinkingBudget?: number;
  /** `x-codai-thinking-pin` */
  thinkingPin?: boolean;
  /** `x-codai-cache` (`false` disables caching on direct model ids). */
  cache?: boolean;
  /** `x-codai-no-task` */
  noTask?: boolean;
  /** `x-codai-task-id` */
  taskId?: string;
  /** `x-codai-task-outcome` */
  taskOutcome?: 'pass' | 'fail';
  /** `x-codai-task-evidence` */
  taskEvidence?: 'exec_verdict' | 'reexec';
  /** `x-codai-client` */
  client?: string;
  /** `x-codai-incognito` */
  incognito?: boolean;
  /** `x-codai-no-recall` */
  noRecall?: boolean;
  /** `x-codai-proven-only` */
  provenOnly?: boolean;
  /** `x-codai-new-session` */
  newSession?: boolean;
  /** `x-codai-repo` */
  repo?: string;
  /** `x-codai-agent-id` */
  agentId?: string;
  /** `x-codai-disable-subagents` */
  disableSubagents?: boolean;
  /** `x-codai-mode: agent` */
  mode?: 'agent';
  /** `x-codai-server-tools` */
  serverTools?: boolean;
  /** `x-codai-orchestrate` */
  orchestrate?: boolean;
  /** `x-codai-cascade` */
  cascade?: 'verify';
  /** `x-codai-best-of` (number or `off`). */
  bestOf?: number | 'off';
  /** `x-codai-best-of-depth` */
  bestOfDepth?: number;
  /** `x-codai-reflect` */
  reflect?: boolean;
  /** `x-codai-step-verify` */
  stepVerify?: boolean;
  /** `x-codai-plan` */
  plan?: boolean;
  /** `x-codai-consensus` */
  consensus?: boolean;
  /** `x-codai-compact` (`'auto'` and `true` both send `1`). */
  compact?: boolean | 'auto';
  /** `x-codai-retrieval` */
  retrieval?: boolean;
  /** `x-codai-heuristics` */
  heuristics?: boolean;
  /** `x-codai-identity` */
  identity?: 'on' | 'off' | 'shadow';
  /** `x-codai-playbook` */
  playbook?: string;
  /** `x-codai-no-playbook` */
  noPlaybook?: boolean;
  /** `x-codai-debug` */
  debug?: boolean;
  /** `x-codai-device` — shared-sessions / hosts device UUID. */
  device?: string;
  /** `x-codai-device-name` */
  deviceName?: string;
  /** `x-codai-device-platform` */
  devicePlatform?: 'android' | 'ios' | 'web' | 'desktop' | 'cli' | 'agent';
  /** `x-codai-push-token` */
  pushToken?: string;
  /** `x-codai-share-token` */
  shareToken?: string;
  /** Escape hatch: any additional raw headers. */
  headers?: Record<string, string>;
}

const EXTENSION_HEADERS: Record<Exclude<keyof CodaiRequestExtensions, 'headers'>, string> = {
  sessionId: 'x-codai-session-id',
  requestId: 'x-request-id',
  effort: 'x-codai-effort',
  thinking: 'x-codai-thinking',
  thinkingBudget: 'x-codai-thinking-budget',
  thinkingPin: 'x-codai-thinking-pin',
  cache: 'x-codai-cache',
  noTask: 'x-codai-no-task',
  taskId: 'x-codai-task-id',
  taskOutcome: 'x-codai-task-outcome',
  taskEvidence: 'x-codai-task-evidence',
  client: 'x-codai-client',
  incognito: 'x-codai-incognito',
  noRecall: 'x-codai-no-recall',
  provenOnly: 'x-codai-proven-only',
  newSession: 'x-codai-new-session',
  repo: 'x-codai-repo',
  agentId: 'x-codai-agent-id',
  disableSubagents: 'x-codai-disable-subagents',
  mode: 'x-codai-mode',
  serverTools: 'x-codai-server-tools',
  orchestrate: 'x-codai-orchestrate',
  cascade: 'x-codai-cascade',
  bestOf: 'x-codai-best-of',
  bestOfDepth: 'x-codai-best-of-depth',
  reflect: 'x-codai-reflect',
  stepVerify: 'x-codai-step-verify',
  plan: 'x-codai-plan',
  consensus: 'x-codai-consensus',
  compact: 'x-codai-compact',
  retrieval: 'x-codai-retrieval',
  heuristics: 'x-codai-heuristics',
  identity: 'x-codai-identity',
  playbook: 'x-codai-playbook',
  noPlaybook: 'x-codai-no-playbook',
  debug: 'x-codai-debug',
  device: 'x-codai-device',
  deviceName: 'x-codai-device-name',
  devicePlatform: 'x-codai-device-platform',
  pushToken: 'x-codai-push-token',
  shareToken: 'x-codai-share-token',
};

/** Translate an extensions bag into raw `X-Codai-*` headers. Exported for tests. */
export function extensionHeaders(ext: CodaiRequestExtensions | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ext) return out;
  for (const [key, header] of Object.entries(EXTENSION_HEADERS) as Array<
    [Exclude<keyof CodaiRequestExtensions, 'headers'>, string]
  >) {
    const value = ext[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') out[header] = value ? '1' : '0';
    else if (key === 'compact' && value === 'auto') out[header] = '1';
    else out[header] = String(value);
  }
  if (ext.headers) Object.assign(out, ext.headers);
  return out;
}

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  /** Extensions applied to every request (per-call bags override per key). */
  defaults?: CodaiRequestExtensions;
  /** Injectable fetch (defaults to the global one). */
  fetch?: typeof fetch;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON body (serialised) — pass `undefined` for no body. */
  body?: unknown;
  /** A pre-built body (FormData / Blob) sent as-is; disables retries. */
  rawBody?: BodyInit;
  query?: Query;
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
  /** Override the client timeout for this call (ms). `0` disables it (streams). */
  timeoutMs?: number;
  /** Never retry this call (multipart uploads, streams). */
  noRetry?: boolean;
  /** Statuses treated as success besides 2xx (e.g. 503 on `/health/ready`). */
  acceptStatus?: number[];
}

export class HttpClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly defaults: CodaiRequestExtensions;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs;
    this.maxRetries = opts.maxRetries;
    this.defaults = opts.defaults ?? {};
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  url(path: string, query?: Query): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
      }
    }
    return url.toString();
  }

  headers(ext?: CodaiRequestExtensions, json = true): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...extensionHeaders(this.defaults),
      ...extensionHeaders(ext),
    };
  }

  /** Perform a request; throws `CodaiError` on non-2xx (after retries on 429/5xx). */
  async request(path: string, init: RequestOptions = {}): Promise<Response> {
    const url = this.url(path, init.query);
    const hasJson = init.body !== undefined;
    const headers = this.headers(init.ext, hasJson);
    const method = init.method ?? (hasJson || init.rawBody !== undefined ? 'POST' : 'GET');
    const retries = init.noRetry || init.rawBody !== undefined ? 0 : this.maxRetries;
    const timeout = init.timeoutMs ?? this.timeoutMs;
    const accept = new Set(init.acceptStatus ?? []);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const signal = init.signal ?? (timeout > 0 ? AbortSignal.timeout(timeout) : undefined);
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          ...(hasJson ? { body: JSON.stringify(init.body) } : {}),
          ...(init.rawBody !== undefined ? { body: init.rawBody } : {}),
          ...(signal ? { signal } : {}),
        });
        if (res.ok || accept.has(res.status)) return res;
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await sleep(500 * 2 ** attempt + Math.random() * 250);
          continue;
        }
        throw await this.toError(path, res);
      } catch (err) {
        if (err instanceof CodaiError) throw err;
        lastErr = err;
        // Caller aborts are never retried.
        if (init.signal?.aborted) throw err;
        if (attempt < retries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
      }
    }
    throw new CodaiError(`codai ${path} failed after retries: ${String(lastErr)}`, 0, null);
  }

  async json<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const res = await this.request(path, init);
    return (await res.json()) as T;
  }

  /**
   * Open a `text/event-stream` and iterate parsed frames. Frames are
   * `\n\n`-separated blocks; each yields `{ event, data }` where `event`
   * defaults to `message` and `data` is the joined `data:` payload (raw
   * string — the caller decides whether it is JSON or `[DONE]`). Comment
   * lines (`: ping`) are skipped. The stream is retried like any request
   * up to the first byte; after that errors propagate.
   */
  async *sse(
    path: string,
    init: RequestOptions = {},
  ): AsyncGenerator<SseFrame, Response, undefined> {
    const res = await this.request(path, {
      ...init,
      timeoutMs: init.timeoutMs ?? 0,
      noRetry: true,
    });
    yield* readSse(res, init.signal);
    return res;
  }

  private async toError(path: string, res: Response): Promise<CodaiError> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const retryAfterRaw = res.headers.get('retry-after');
    const retryAfter = retryAfterRaw && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : null;
    const message = extractMessage(body);
    return new CodaiError(
      message ? `codai ${path} → ${res.status}: ${message}` : `codai ${path} → ${res.status}`,
      res.status,
      body,
      {
        requestId: res.headers.get('x-codai-trace-id') ?? res.headers.get('x-request-id'),
        retryAfter,
      },
    );
  }
}

export interface SseFrame {
  /** `event:` name; `message` when the frame has none (OpenAI-style streams). */
  event: string;
  /** Joined `data:` lines (a multi-line data block is joined with `\n`). */
  data: string;
}

/** Parse an SSE body into frames. Exported for the resources and for tests. */
export async function* readSse(res: Response, signal?: AbortSignal): AsyncGenerator<SseFrame> {
  const reader = res.body?.getReader();
  if (!reader) throw new CodaiError('no response body', res.status, null);
  const decoder = new TextDecoder();
  let buffer = '';
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Normalise CRLF so both `\n\n` and `\r\n\r\n` delimit frames.
      buffer = buffer.replace(/\r\n/g, '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const frame = parseSseBlock(block);
        if (frame) yield frame;
      }
    }
    const tail = buffer.trim() ? parseSseBlock(buffer) : null;
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock?.();
  }
}

function parseSseBlock(block: string): SseFrame | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    // `id:` / `retry:` are never emitted by the gateway; ignore anything else.
  }
  if (data.length === 0) return null;
  return { event, data: data.join('\n') };
}

/** Parse a frame's data as JSON, returning `null` for `[DONE]` / non-JSON. */
export function frameJson<T = unknown>(frame: SseFrame): T | null {
  if (frame.data === '[DONE]') return null;
  try {
    return JSON.parse(frame.data) as T;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
