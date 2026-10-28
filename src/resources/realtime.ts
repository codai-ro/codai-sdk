/**
 * `wss://…/v1/realtime` — dependency-free realtime client (live transcription and the OpenAI
 * Realtime protocol lanes). Not an OpenAPI operation (OpenAPI cannot describe WebSockets), so it is
 * outside the `OPERATION_METHODS` parity table.
 *
 *   const live = codai.realtime.connect({ model: 'codai-transcribe-live', language: 'ro', token });
 *   live.appendAudio(pcm16At24kHz);          // Int16Array | ArrayBuffer | Uint8Array
 *   for await (const ev of live) {
 *     if (ev.type === 'conversation.item.input_audio_transcription.delta') draw(ev.delta);
 *   }
 *
 * Uses the global `WebSocket` (browsers, Node ≥ 22, Deno, Bun) or an injected constructor.
 *  - Browser path: pass an ephemeral `token` (scope `realtime` or `live`); it travels as `?key=`.
 *    Raw `codai_` keys in the query string are refused by the gateway (close 4401).
 *  - Server path: pass `apiKey` (or a token) with a WebSocket constructor that accepts headers
 *    (e.g. `ws`); it is sent as `Authorization: Bearer` on the upgrade.
 */

/** Minimal WebSocket surface (browser `WebSocket`, Node 22 global, or the `ws` package). */
export interface RealtimeSocket {
  readonly readyState: number;
  binaryType?: string;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** `new (url, protocols?, options?)` — the third argument is used for headers by `ws`. */
export type RealtimeSocketCtor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => RealtimeSocket;

export type RealtimeModel =
  'codai-transcribe-live' | 'codai-realtime' | 'codai-voice' | (string & Record<never, never>);

export interface RealtimeConnectOptions {
  /** Default `codai-transcribe-live`. */
  model?: RealtimeModel;
  /** Language hint (`ro`, `en`, …). `ro` uses the Deepgram Nova-3 lane when the gateway has it. */
  language?: string;
  /** Ephemeral token (scope `realtime` or `live`) — sent as `?key=`. Required in browsers. */
  token?: string;
  /** Raw API key — sent as `Authorization: Bearer` (needs a ctor that supports headers). */
  apiKey?: string;
  /** Conversation id recorded on the usage row (`?session_id=`). */
  sessionId?: string;
  /**
   * First frame sent on open. Default for `codai-transcribe-live`: a transcription
   * `session.update` (PCM 24 kHz, `language` when set). Pass `null` to send nothing.
   */
  sessionUpdate?: Record<string, unknown> | null;
  /** Injectable WebSocket constructor (tests, `ws` on older Node). Defaults to `globalThis.WebSocket`. */
  WebSocket?: RealtimeSocketCtor;
  /** Override the gateway base URL (default: the client's `baseUrl`). */
  baseUrl?: string;
}

/** Typed subset of server events; anything else arrives as `RealtimeUnknownEvent`. */
export type RealtimeEvent =
  | {
      type: 'session.created' | 'session.updated';
      session?: Record<string, unknown>;
      event_id?: string;
    }
  | {
      type: 'conversation.item.input_audio_transcription.delta';
      item_id: string;
      content_index?: number;
      delta: string;
      event_id?: string;
    }
  | {
      type: 'conversation.item.input_audio_transcription.completed';
      item_id: string;
      content_index?: number;
      transcript: string;
      event_id?: string;
    }
  | { type: 'input_audio_buffer.committed'; item_id?: string; previous_item_id?: string | null }
  | { type: 'input_audio_buffer.cleared' }
  | { type: 'error'; error: { type?: string; code?: string; message?: string } }
  /** Emitted by the client itself when the socket closes (always the last event). */
  | { type: 'close'; code: number; reason: string };
export type RealtimeUnknownEvent = { type: string; [k: string]: unknown };
export type RealtimeAnyEvent = RealtimeEvent | RealtimeUnknownEvent;

type Listener = (ev: RealtimeAnyEvent) => void;

const OPEN = 1;

function toBytes(audio: Int16Array | ArrayBuffer | Uint8Array): Uint8Array {
  if (audio instanceof ArrayBuffer) return new Uint8Array(audio);
  return new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** A live realtime session: async-iterable of events + `on()` listeners. */
export class RealtimeSession implements AsyncIterable<RealtimeAnyEvent> {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly queue: RealtimeAnyEvent[] = [];
  private readonly waiters: Array<(r: IteratorResult<RealtimeAnyEvent>) => void> = [];
  private readonly outbox: string[] = [];
  private closed = false;
  /** Resolves when the socket is open (rejects if it closes first). */
  readonly ready: Promise<void>;

  constructor(
    readonly socket: RealtimeSocket,
    firstFrame: Record<string, unknown> | null,
  ) {
    let resolveReady!: () => void;
    let rejectReady!: (e: Error) => void;
    this.ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });
    // Unhandled-rejection safety: callers that never await `ready` still get the `close` event.
    this.ready.catch(() => undefined);
    socket.onopen = () => {
      if (firstFrame) socket.send(JSON.stringify(firstFrame));
      for (const f of this.outbox.splice(0)) socket.send(f);
      resolveReady();
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { type?: unknown }).type === 'string'
      ) {
        this.emit(parsed as RealtimeAnyEvent);
      }
    };
    socket.onerror = () => {
      /* the close event carries the code */
    };
    socket.onclose = (ev) => {
      rejectReady(
        new Error(`realtime socket closed before open (${String(ev.code)} ${ev.reason})`),
      );
      this.emit({ type: 'close', code: ev.code, reason: ev.reason });
      this.closed = true;
      for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
    };
  }

  /** Listen for one event type (`'*'` = every event). Returns an unsubscribe function. */
  on(type: string, fn: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Send any client event (JSON). Queued until the socket opens. */
  send(event: Record<string, unknown>): void {
    if (this.closed) throw new Error('realtime session is closed');
    const frame = JSON.stringify(event);
    if (this.socket.readyState === OPEN) this.socket.send(frame);
    else this.outbox.push(frame);
  }

  /** Append PCM16 little-endian mono audio (24 kHz for `codai-transcribe-live`). */
  appendAudio(audio: Int16Array | ArrayBuffer | Uint8Array): void {
    const bytes = toBytes(audio);
    if (bytes.byteLength === 0) return;
    this.send({ type: 'input_audio_buffer.append', audio: bytesToBase64(bytes) });
  }

  /** Close the current utterance: the server answers with one `...transcription.completed`. */
  commit(): void {
    this.send({ type: 'input_audio_buffer.commit' });
  }

  /** Drop audio the server holds for the current utterance. */
  clear(): void {
    this.send({ type: 'input_audio_buffer.clear' });
  }

  close(code = 1000, reason = 'client closed'): void {
    if (this.closed) return;
    this.socket.close(code, reason);
  }

  [Symbol.asyncIterator](): AsyncIterator<RealtimeAnyEvent> {
    return {
      next: () => {
        const ev = this.queue.shift();
        if (ev) return Promise.resolve({ value: ev, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }

  private emit(ev: RealtimeAnyEvent): void {
    for (const fn of this.listeners.get(ev.type) ?? []) fn(ev);
    for (const fn of this.listeners.get('*') ?? []) fn(ev);
    const w = this.waiters.shift();
    if (w) w({ value: ev, done: false });
    else this.queue.push(ev);
  }
}

/** Build the `wss://…/v1/realtime?…` URL (exported for tests and custom transports). */
export function realtimeUrl(baseUrl: string, opts: RealtimeConnectOptions): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/v1/realtime`);
  url.searchParams.set('model', opts.model ?? 'codai-transcribe-live');
  if (opts.language) url.searchParams.set('language', opts.language);
  if (opts.sessionId) url.searchParams.set('session_id', opts.sessionId);
  if (opts.token) url.searchParams.set('key', opts.token);
  return url.toString();
}

export class Realtime {
  constructor(private readonly defaults: { baseUrl: string; apiKey?: string }) {}

  /** Open a realtime session. Returns immediately; `await session.ready` to wait for the socket. */
  connect(opts: RealtimeConnectOptions = {}): RealtimeSession {
    const Ctor = opts.WebSocket ?? (globalThis as { WebSocket?: RealtimeSocketCtor }).WebSocket;
    if (!Ctor) throw new Error('codai.realtime: no WebSocket available — pass options.WebSocket');
    const model = opts.model ?? 'codai-transcribe-live';
    let token = opts.token;
    let apiKey = token ? undefined : (opts.apiKey ?? this.defaults.apiKey);
    // A client constructed with an ephemeral token uses it the browser way (`?key=`).
    if (apiKey?.startsWith('codai_eph_v1.')) {
      token = apiKey;
      apiKey = undefined;
    }
    if (!token && !apiKey) throw new Error('codai.realtime: pass `token` (browser) or `apiKey`');
    const url = realtimeUrl(opts.baseUrl ?? this.defaults.baseUrl, { ...opts, model, token });
    const socket = apiKey
      ? new Ctor(url, undefined, { headers: { Authorization: `Bearer ${apiKey}` } })
      : new Ctor(url);
    if ('binaryType' in socket) socket.binaryType = 'arraybuffer';
    const first =
      opts.sessionUpdate !== undefined
        ? opts.sessionUpdate
        : model === 'codai-transcribe-live'
          ? {
              type: 'session.update',
              session: {
                type: 'transcription',
                audio: {
                  input: {
                    format: { type: 'audio/pcm', rate: 24000 },
                    transcription: {
                      model,
                      ...(opts.language ? { language: opts.language } : {}),
                    },
                  },
                },
              },
            }
          : null;
    return new RealtimeSession(socket, first);
  }
}
