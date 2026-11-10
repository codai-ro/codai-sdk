/** `POST /v1/messages` — Anthropic Messages wire (JSON + named-event SSE). */
import { type CodaiRequestExtensions, frameJson, type HttpClient, readSse } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type MessageRequest = Mutable<Body<'createMessage'>>;
export type MessageResponse = Reply<'createMessage'>;
/** Request body as accepted by the SDK: `stream` is set by the method and `model` defaults to `codai`. */
export type MessageInput = Omit<MessageRequest, 'stream' | 'model'> & { model?: string };

export interface MessageCallOptions {
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
}

export interface MessageResult {
  /** Concatenated `text` blocks of the reply. */
  text: string;
  raw: MessageResponse;
  requestId: string | null;
  routedTo: string | null;
  headers: Headers;
}

/** One Anthropic streaming event: `event.type` mirrors the SSE `event:` name. */
export interface MessageStreamEvent {
  type:
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop'
    | 'ping'
    | 'error'
    | (string & {});
  [key: string]: unknown;
}

export interface MessageStreamResult {
  /** Concatenated `text_delta` payloads. */
  text: string;
  /** Final `stop_reason` from `message_delta`, when sent. */
  stopReason: string | null;
  /** Cumulative usage: `input_tokens` from `message_start`, `output_tokens` from `message_delta`. */
  usage: { inputTokens: number; outputTokens: number } | null;
  requestId: string | null;
  routedTo: string | null;
  headers: Headers | null;
}

export interface MessageStream extends AsyncIterable<MessageStreamEvent> {
  readonly final: Promise<MessageStreamResult>;
  /** Text deltas only. */
  text(): AsyncIterable<string>;
}

export class Messages {
  constructor(private readonly http: HttpClient) {}

  async create(body: MessageInput, opts: MessageCallOptions = {}): Promise<MessageResult> {
    const res = await this.http.request('/v1/messages', {
      body: { ...body, model: body.model ?? 'codai', stream: false },
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as MessageResponse;
    const text = (raw.content ?? [])
      .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .join('');
    return {
      text,
      raw,
      requestId: res.headers.get('x-codai-trace-id') ?? res.headers.get('x-request-id'),
      routedTo: res.headers.get('x-codai-routed-to'),
      headers: res.headers,
    };
  }

  stream(body: MessageInput, opts: MessageCallOptions = {}): MessageStream {
    const requestPromise = this.http.request('/v1/messages', {
      body: { ...body, model: body.model ?? 'codai', stream: true },
      ext: opts.ext,
      signal: opts.signal,
      timeoutMs: 0,
      noRetry: true,
    });

    let resolveFinal!: (r: MessageStreamResult) => void;
    let rejectFinal!: (e: unknown) => void;
    const final = new Promise<MessageStreamResult>((resolve, reject) => {
      resolveFinal = resolve;
      rejectFinal = reject;
    });
    final.catch(() => {});

    let text = '';
    let stopReason: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let res: Response | null = null;

    async function* events(): AsyncGenerator<MessageStreamEvent, void, undefined> {
      try {
        res = await requestPromise;
        for await (const frame of readSse(res, opts.signal)) {
          const ev = frameJson<MessageStreamEvent>(frame);
          if (!ev) continue;
          if (typeof ev.type !== 'string') ev.type = frame.event;
          if (ev.type === 'message_start') {
            const usage = (ev.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
            if (usage?.input_tokens !== undefined) inputTokens = usage.input_tokens;
          } else if (ev.type === 'content_block_delta') {
            const delta = ev.delta as { type?: string; text?: string } | undefined;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') text += delta.text;
          } else if (ev.type === 'message_delta') {
            const delta = ev.delta as { stop_reason?: string | null } | undefined;
            if (delta?.stop_reason) stopReason = delta.stop_reason;
            const usage = ev.usage as { output_tokens?: number } | undefined;
            if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
          }
          yield ev;
          if (ev.type === 'message_stop') break;
        }
        resolveFinal({
          text,
          stopReason,
          usage:
            inputTokens !== null || outputTokens !== null
              ? { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 }
              : null,
          requestId: res.headers.get('x-codai-trace-id') ?? res.headers.get('x-request-id') ?? null,
          routedTo: res.headers.get('x-codai-routed-to'),
          headers: res.headers,
        });
      } catch (err) {
        rejectFinal(err);
        throw err;
      }
    }

    async function* textOnly(): AsyncGenerator<string, void, undefined> {
      for await (const ev of events()) {
        if (ev.type !== 'content_block_delta') continue;
        const delta = ev.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === 'text_delta' && delta.text) yield delta.text;
      }
    }

    return {
      [Symbol.asyncIterator]: () => events(),
      text: () => ({ [Symbol.asyncIterator]: () => textOnly() }),
      final,
    };
  }
}
