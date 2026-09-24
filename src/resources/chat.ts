/** `POST /v1/chat/completions` — OpenAI-compatible completions (JSON + SSE). */
import { type CodaiRequestExtensions, frameJson, type HttpClient, readSse } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type ChatCompletionRequest = Mutable<Body<'createChatCompletion'>>;
/** Request body as accepted by the SDK: `stream` is set by the method and `model` defaults to `codai`. */
export type ChatCompletionInput = Omit<ChatCompletionRequest, 'stream' | 'model'> & {
  model?: string;
};
export type ChatCompletionResponse = Reply<'createChatCompletion'>;
export type ChatMessage = Mutable<Schema<'ChatMessage'>>;
export type ChatTool = Mutable<Schema<'ChatTool'>>;
export type ChatToolCall = Mutable<Schema<'ChatToolCall'>>;
export type ChatUsage = Schema<'ChatUsage'>;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from the provider cache, when reported. */
  cachedTokens?: number;
}

/** Per-call options accepted by every chat method. */
export interface ChatCallOptions {
  /** `X-Codai-*` extension headers for this call. */
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
}

export interface ChatResult {
  /** Assistant message content (first choice). */
  content: string;
  /** Tool calls on the first choice (empty if none). */
  toolCalls: ChatToolCall[];
  /** Raw OpenAI-shaped response. */
  raw: ChatCompletionResponse;
  /** Request id (`x-codai-trace-id` / `x-request-id`) — pass to `feedback`. */
  requestId: string | null;
  /** Usage-event id (`x-codai-event-id`) — exact target for `feedback.submit`. */
  eventId: string | null;
  /** Which upstream model actually served (`x-codai-routed-to`). */
  routedTo: string | null;
  /** Verification status for verified-execution responses, if present. */
  execVerify: string | null;
  usage: TokenUsage | null;
  /** Response headers, for the long tail of `x-codai-*` metadata. */
  headers: Headers;
}

/** Final metadata for a completed stream — resolved via `stream.final`. */
export interface ChatStreamResult {
  content: string;
  toolCalls: ChatToolCall[];
  requestId: string | null;
  routedTo: string | null;
  execVerify: string | null;
  usage: TokenUsage | null;
  /** `finish_reason` of the last content chunk, when sent. */
  finishReason: string | null;
  headers: Headers | null;
}

/**
 * A live chat stream. Async-iterate it for text deltas, then await `.final`
 * for metadata. `.chunks()` yields the raw `chat.completion.chunk` objects.
 */
export interface ChatStream extends AsyncIterable<string> {
  readonly final: Promise<ChatStreamResult>;
  chunks(): AsyncIterable<ChatCompletionChunk>;
}

export interface ChatCompletionChunk {
  id?: string;
  object?: 'chat.completion.chunk';
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{ index?: number } & Record<string, unknown>>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  [key: string]: unknown;
}

function toUsage(u: ChatCompletionChunk['usage'] | undefined): TokenUsage | null {
  if (!u) return null;
  const cached = u.prompt_tokens_details?.cached_tokens;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    ...(cached !== undefined ? { cachedTokens: cached } : {}),
  };
}

/**
 * Merge a streamed tool-call fragment into the accumulator at `index`.
 * OpenAI streams tool calls piecewise: id/name arrive first, then the
 * `arguments` string is appended across many deltas.
 */
export function mergeToolCall(
  acc: Map<number, Record<string, unknown>>,
  index: number,
  fragment: Record<string, unknown>,
): void {
  const existing = acc.get(index) ?? { index };
  for (const [key, val] of Object.entries(fragment)) {
    if (key === 'index') continue;
    if (key === 'function' && val && typeof val === 'object') {
      const fn = (existing.function as Record<string, unknown>) ?? {};
      for (const [fk, fv] of Object.entries(val as Record<string, unknown>)) {
        if (fk === 'arguments') fn.arguments = String(fn.arguments ?? '') + String(fv ?? '');
        else fn[fk] = fv;
      }
      existing.function = fn;
    } else {
      existing[key] = val;
    }
  }
  acc.set(index, existing);
}

export class ChatCompletions {
  constructor(private readonly http: HttpClient) {}

  /**
   * Non-streaming completion. `stream` is forced to `false`; use
   * `stream()` for SSE.
   */
  async create(body: ChatCompletionInput, opts: ChatCallOptions = {}): Promise<ChatResult> {
    const res = await this.http.request('/v1/chat/completions', {
      body: { ...body, model: body.model ?? 'codai', stream: false },
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as ChatCompletionResponse;
    const first = raw.choices?.[0];
    const usage = raw.usage as ChatCompletionChunk['usage'] | undefined;
    return {
      content: typeof first?.message?.content === 'string' ? first.message.content : '',
      toolCalls: [...((first?.message?.tool_calls ?? []) as ChatToolCall[])],
      raw,
      requestId: res.headers.get('x-codai-trace-id') ?? res.headers.get('x-request-id'),
      eventId: res.headers.get('x-codai-event-id'),
      routedTo: res.headers.get('x-codai-routed-to'),
      execVerify: res.headers.get('x-codai-exec-verify'),
      usage: toUsage(usage),
      headers: res.headers,
    };
  }

  /** Streaming completion (`stream: true`). */
  stream(body: ChatCompletionInput, opts: ChatCallOptions = {}): ChatStream {
    const requestPromise = this.http.request('/v1/chat/completions', {
      body: { ...body, model: body.model ?? 'codai', stream: true },
      ext: opts.ext,
      signal: opts.signal,
      timeoutMs: 0,
      noRetry: true,
    });

    let resolveFinal!: (r: ChatStreamResult) => void;
    let rejectFinal!: (e: unknown) => void;
    const final = new Promise<ChatStreamResult>((resolve, reject) => {
      resolveFinal = resolve;
      rejectFinal = reject;
    });
    final.catch(() => {}); // no unhandled-rejection noise when `final` is never awaited

    const toolCallsByIndex = new Map<number, Record<string, unknown>>();
    let content = '';
    let usage: TokenUsage | null = null;
    let finishReason: string | null = null;
    let res: Response | null = null;

    const buildResult = (): ChatStreamResult => ({
      content,
      toolCalls: [...toolCallsByIndex.values()] as ChatToolCall[],
      requestId: res?.headers.get('x-codai-trace-id') ?? res?.headers.get('x-request-id') ?? null,
      routedTo: res?.headers.get('x-codai-routed-to') ?? null,
      execVerify: res?.headers.get('x-codai-exec-verify') ?? null,
      usage,
      finishReason,
      headers: res?.headers ?? null,
    });

    async function* chunks(): AsyncGenerator<ChatCompletionChunk, void, undefined> {
      try {
        res = await requestPromise;
        for await (const frame of readSse(res, opts.signal)) {
          if (frame.data === '[DONE]') break;
          const chunk = frameJson<ChatCompletionChunk>(frame);
          if (!chunk) continue;
          if (chunk.usage) usage = toUsage(chunk.usage);
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta;
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              mergeToolCall(toolCallsByIndex, typeof tc.index === 'number' ? tc.index : 0, tc);
            }
          }
          if (delta?.content) content += delta.content;
          yield chunk;
        }
        resolveFinal(buildResult());
      } catch (err) {
        rejectFinal(err);
        throw err;
      }
    }

    async function* text(): AsyncGenerator<string, void, undefined> {
      for await (const chunk of chunks()) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }

    return {
      [Symbol.asyncIterator]: () => text(),
      chunks: () => ({ [Symbol.asyncIterator]: () => chunks() }),
      final,
    };
  }
}

export class Chat {
  readonly completions: ChatCompletions;
  constructor(http: HttpClient) {
    this.completions = new ChatCompletions(http);
  }
}
