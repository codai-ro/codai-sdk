/**
 * `wss://…/v1/studio/jam` — codai Studio live jam (MU-09): live generated music (Lyria RealTime) steered with weighted
 * prompts. Not an OpenAPI operation (OpenAPI cannot describe WebSockets), so it is outside `OPERATION_METHODS`.
 *
 *   const jam = codai.jam.connect({ token });             // browser: ephemeral token (scope realtime | live)
 *   jam.on('audio', (pcm) => player.push(pcm));           // PCM16 LE interleaved stereo at 48 kHz
 *   jam.prompts([{ text: 'warm lo-fi piano', weight: 1 }]);
 *   jam.config({ bpm: 90, density: 0.4 });
 *   jam.play();
 *
 * Auth: server runtimes send `Authorization: Bearer <key>` (needs a WebSocket constructor that accepts headers, e.g.
 * `ws`); browsers send the subprotocols `codai-jam` + `bearer.<token>` (the server answers `codai-jam` and never echoes
 * the credential). Raw long-lived keys are never put in the URL.
 *
 * Close codes: 4400 invalid message, 4401 credentials, 4402 insufficient funds, 4403 EU residency / not allowed / spend
 * cap, 4408 10-minute limit, 4409 another jam already open, 4502 upstream error, 4503 not configured. Billed $0.03 per
 * started minute of the open upstream session (`codai::jam`); the 10-minute price is held when the session opens.
 */
import type { RealtimeSocket, RealtimeSocketCtor } from './realtime';

export const JAM_SUBPROTOCOL = 'codai-jam';

/** WebSocket close codes of `/v1/studio/jam`. */
export const JAM_CLOSE_CODES = {
  invalidMessage: 4400,
  unauthorized: 4401,
  insufficientFunds: 4402,
  forbidden: 4403,
  maxDuration: 4408,
  busy: 4409,
  upstream: 4502,
  unavailable: 4503,
} as const;

export const JAM_SCALES = [
  'SCALE_UNSPECIFIED',
  'C_MAJOR_A_MINOR',
  'D_FLAT_MAJOR_B_FLAT_MINOR',
  'D_MAJOR_B_MINOR',
  'E_FLAT_MAJOR_C_MINOR',
  'E_MAJOR_D_FLAT_MINOR',
  'F_MAJOR_D_MINOR',
  'G_FLAT_MAJOR_E_FLAT_MINOR',
  'G_MAJOR_E_MINOR',
  'A_FLAT_MAJOR_F_MINOR',
  'A_MAJOR_G_FLAT_MINOR',
  'B_FLAT_MAJOR_G_MINOR',
  'B_MAJOR_A_FLAT_MINOR',
] as const;
export type JamScale = (typeof JAM_SCALES)[number];

/** A weighted prompt: 1..8 per message, `weight` in [-10, 10] and not 0. */
export interface JamPrompt {
  text: string;
  weight: number;
}

/** Partial config; the server merges it into the last full config. bpm / scale changes reset the context. */
export interface JamConfig {
  bpm?: number;
  density?: number;
  brightness?: number;
  scale?: JamScale;
}

export type JamClientMessage =
  | { type: 'prompts'; prompts: JamPrompt[] }
  | ({ type: 'config' } & JamConfig)
  | { type: 'play' | 'pause' | 'stop' | 'reset' };

export type JamState =
  'connecting' | 'ready' | 'playing' | 'paused' | 'stopped' | (string & Record<never, never>);

export type JamEvent =
  | {
      type: 'status';
      state: JamState;
      remaining_ms: number;
      sample_rate?: number;
      channels?: number;
    }
  | { type: 'filtered'; text: string; reason: string }
  | { type: 'error'; code: string; message: string }
  /** Emitted by the client for every binary frame. */
  | { type: 'audio'; data: ArrayBuffer }
  /** Emitted by the client itself when the socket closes (always the last event). */
  | { type: 'close'; code: number; reason: string };

export interface JamConnectOptions {
  /** Ephemeral token (scope `realtime` or `live`) — sent as the `bearer.<token>` subprotocol. Required in browsers. */
  token?: string;
  /** API key — sent as `Authorization: Bearer` (needs a ctor that supports headers). */
  apiKey?: string;
  /** Conversation id recorded on the usage row (`?session_id=`). */
  sessionId?: string;
  /** Injectable WebSocket constructor (tests, `ws` on older Node). Defaults to `globalThis.WebSocket`. */
  WebSocket?: RealtimeSocketCtor;
  /** Override the gateway base URL (default: the client's `baseUrl`). */
  baseUrl?: string;
}

type Listener<T extends JamEvent['type']> = (ev: Extract<JamEvent, { type: T }>) => void;
type AnyListener = (ev: JamEvent) => void;

const OPEN = 1;

function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  return null;
}

/** A live jam session: `on()` listeners for status / audio / errors and typed senders. */
export class JamSession {
  private readonly listeners = new Map<string, Set<AnyListener>>();
  private readonly outbox: string[] = [];
  private closed = false;
  /** Resolves when the socket is open (rejects if it closes first). */
  readonly ready: Promise<void>;

  constructor(readonly socket: RealtimeSocket) {
    let resolveReady!: () => void;
    let rejectReady!: (e: Error) => void;
    this.ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });
    this.ready.catch(() => undefined);
    socket.onopen = () => {
      for (const f of this.outbox.splice(0)) socket.send(f);
      resolveReady();
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        const buf = toArrayBuffer(ev.data);
        if (buf) this.emit({ type: 'audio', data: buf });
        return;
      }
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
      )
        this.emit(parsed as JamEvent);
    };
    socket.onerror = () => {
      /* the close event carries the code */
    };
    socket.onclose = (ev) => {
      rejectReady(new Error(`jam socket closed before open (${String(ev.code)} ${ev.reason})`));
      this.closed = true;
      this.emit({ type: 'close', code: ev.code, reason: ev.reason });
    };
  }

  /** Listen for one event type (`'*'` = every event). Returns an unsubscribe function. */
  on<T extends JamEvent['type']>(type: T, fn: Listener<T>): () => void;
  on(type: '*', fn: AnyListener): () => void;
  on(type: string, fn: AnyListener): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Send one client message (JSON). Queued until the socket opens. */
  send(msg: JamClientMessage): void {
    if (this.closed) throw new Error('jam session is closed');
    const frame = JSON.stringify(msg);
    if (this.socket.readyState === OPEN) this.socket.send(frame);
    else this.outbox.push(frame);
  }

  prompts(prompts: JamPrompt[]): void {
    this.send({ type: 'prompts', prompts });
  }

  config(config: JamConfig): void {
    this.send({ type: 'config', ...config });
  }

  play(): void {
    this.send({ type: 'play' });
  }

  pause(): void {
    this.send({ type: 'pause' });
  }

  stop(): void {
    this.send({ type: 'stop' });
  }

  reset(): void {
    this.send({ type: 'reset' });
  }

  close(code = 1000, reason = 'client closed'): void {
    if (this.closed) return;
    this.socket.close(code, reason);
  }

  private emit(ev: JamEvent): void {
    for (const fn of this.listeners.get(ev.type) ?? []) fn(ev);
    for (const fn of this.listeners.get('*') ?? []) fn(ev);
  }
}

/** Build the `wss://…/v1/studio/jam` URL (exported for tests and custom transports). */
export function jamUrl(baseUrl: string, opts: Pick<JamConnectOptions, 'sessionId'> = {}): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/v1/studio/jam`);
  if (opts.sessionId) url.searchParams.set('session_id', opts.sessionId);
  return url.toString();
}

export class Jam {
  constructor(private readonly defaults: { baseUrl: string; apiKey?: string }) {}

  /** Open a live jam. Returns immediately; `await session.ready` to wait for the socket. */
  connect(opts: JamConnectOptions = {}): JamSession {
    const Ctor = opts.WebSocket ?? (globalThis as { WebSocket?: RealtimeSocketCtor }).WebSocket;
    if (!Ctor) throw new Error('codai.jam: no WebSocket available — pass options.WebSocket');
    let token = opts.token;
    let apiKey = token ? undefined : (opts.apiKey ?? this.defaults.apiKey);
    if (apiKey?.startsWith('codai_eph_v1.')) {
      token = apiKey;
      apiKey = undefined;
    }
    if (!token && !apiKey) throw new Error('codai.jam: pass `token` (browser) or `apiKey`');
    const url = jamUrl(opts.baseUrl ?? this.defaults.baseUrl, opts);
    const socket = apiKey
      ? new Ctor(url, [JAM_SUBPROTOCOL], { headers: { Authorization: `Bearer ${apiKey}` } })
      : new Ctor(url, [JAM_SUBPROTOCOL, `bearer.${token!}`]);
    if ('binaryType' in socket) socket.binaryType = 'arraybuffer';
    return new JamSession(socket);
  }
}
