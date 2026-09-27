/** `POST /v1/responses` — OpenAI Responses API compatibility (JSON + named-event SSE). */
import { type CodaiRequestExtensions, frameJson, type HttpClient, readSse } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type ResponsesRequest = Mutable<Body<'createResponse'>>;
export type ResponsesResponse = Reply<'createResponse'>;
/** Request body as accepted by the SDK: `stream` is set by the method and `model` defaults to `codai`. */
export type ResponsesInput = Omit<ResponsesRequest, 'stream' | 'model'> & { model?: string };

export interface ResponsesCallOptions {
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
}

export interface ResponsesResult {
  /** `output_text` of the response. */
  outputText: string;
  raw: ResponsesResponse;
  requestId: string | null;
  routedTo: string | null;
  headers: Headers;
}

/** One Responses streaming event; `type` mirrors the SSE `event:` name. */
export interface ResponsesStreamEvent {
  type:
    | 'response.created'
    | 'response.output_text.delta'
    | 'response.output_item.done'
    | 'response.output_text.done'
    | 'response.completed'
    | (string & {});
  sequence_number?: number;
  [key: string]: unknown;
}

export interface ResponsesStreamResult {
  outputText: string;
  /** The full `response` object from `response.completed`, when received. */
  response: ResponsesResponse | null;
  requestId: string | null;
  routedTo: string | null;
  headers: Headers | null;
}

export interface ResponsesStream extends AsyncIterable<ResponsesStreamEvent> {
  readonly final: Promise<ResponsesStreamResult>;
  /** Text deltas only. */
  text(): AsyncIterable<string>;
}

export class Responses {
  constructor(private readonly http: HttpClient) {}

  async create(body: ResponsesInput, opts: ResponsesCallOptions = {}): Promise<ResponsesResult> {
    const res = await this.http.request('/v1/responses', {
      body: { ...body, model: body.model ?? 'codai', stream: false },
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as ResponsesResponse;
    return {
      outputText: typeof raw.output_text === 'string' ? raw.output_text : '',
      raw,
      requestId: res.headers.get('x-codai-trace-id') ?? res.headers.get('x-request-id'),
      routedTo: res.headers.get('x-codai-routed-to'),
      headers: res.headers,
    };
  }

  stream(body: ResponsesInput, opts: ResponsesCallOptions = {}): ResponsesStream {
    const requestPromise = this.http.request('/v1/responses', {
      body: { ...body, model: body.model ?? 'codai', stream: true },
      ext: opts.ext,
      signal: opts.signal,
      timeoutMs: 0,
      noRetry: true,
    });

    let resolveFinal!: (r: ResponsesStreamResult) => void;
    let rejectFinal!: (e: unknown) => void;
    const final = new Promise<ResponsesStreamResult>((resolve, reject) => {
      resolveFinal = resolve;
      rejectFinal = reject;
    });
    final.catch(() => {});

    let outputText = '';
    let response: ResponsesResponse | null = null;
    let res: Response | null = null;

    async function* events(): AsyncGenerator<ResponsesStreamEvent, void, undefined> {
      try {
        res = await requestPromise;
        for await (const frame of readSse(res, opts.signal)) {
          const ev = frameJson<ResponsesStreamEvent>(frame);
          if (!ev) continue;
          if (typeof ev.type !== 'string') ev.type = frame.event;
          if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
            outputText += ev.delta;
          } else if (ev.type === 'response.completed' && ev.response) {
            response = ev.response as ResponsesResponse;
          }
          yield ev;
          if (ev.type === 'response.completed') break;
        }
        resolveFinal({
          outputText,
          response,
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
        if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string')
          yield ev.delta;
      }
    }

    return {
      [Symbol.asyncIterator]: () => events(),
      text: () => ({ [Symbol.asyncIterator]: () => textOnly() }),
      final,
    };
  }
}
