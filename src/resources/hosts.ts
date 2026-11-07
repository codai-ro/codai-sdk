/**
 * `/v1/hosts/*` — host relay (codai desktop or the codai iPhone bridge announces itself; clients exec ops on it).
 */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type HostPresence = Schema<'HostPresence'>;
export type HostOp = Schema<'HostOp'>;
export type HostIphoneArgs = Mutable<Schema<'HostIphoneArgs'>>;
export type HostExecBody = Mutable<Body<'execOnHost'>>;
export type HostExecResponse = Reply<'execOnHost'>;
export type HostExecRequest = Schema<'HostExecRequest'>;
export type HostExecResultBody = Mutable<Body<'postHostExecResult'>>;

/** `result` of a successful `iphone` op: the bridge tool's data plus an optional JPEG screenshot data URL. */
export interface HostIphoneResult {
  data: unknown;
  /** `data:image/jpeg;base64,…` (≤ 1.5 MB). */
  image?: string;
}

/** {@link Hosts.iphone} answer: the exec envelope with a typed `result`. */
export type HostIphoneResponse = Omit<HostExecResponse, 'result'> & {
  result: HostIphoneResult | null;
};

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
type ExecExtra = { timeoutMs?: number; label?: string } & CallOpts;

const IPHONE_TOOL_RE = /^[a-z_]{1,64}$/;

/** Frames of `GET /v1/hosts/stream`. */
export type HostStreamEvent =
  | {
      event: 'hello';
      data: {
        device_id: string;
        heartbeat_ms: number;
        caps?: string[];
        environment_id?: string | null;
      };
    }
  | { event: 'ping'; data: { t: number } }
  | { event: 'exec'; data: HostExecRequest }
  | { event: string; data: Record<string, unknown> };

export class Hosts {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/hosts` — your devices currently connected as hosts. */
  async list(opts: CallOpts = {}): Promise<HostPresence[]> {
    const raw = await this.http.json<Reply<'listHosts'>>('/v1/hosts', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.hosts ?? [])];
  }

  /**
   * `POST /v1/hosts/{deviceId}/exec` — run one op on a connected host and
   * block until it answers (or `timeout_ms`, default 60 s).
   */
  exec(
    deviceId: string,
    op: HostOp,
    args: Record<string, unknown> = {},
    extra: ExecExtra = {},
  ): Promise<HostExecResponse> {
    const body: HostExecBody = {
      op,
      args,
      ...(extra.timeoutMs !== undefined ? { timeout_ms: extra.timeoutMs } : {}),
      ...(extra.label !== undefined ? { label: extra.label } : {}),
    };
    return this.http.json<HostExecResponse>(`/v1/hosts/${encodeURIComponent(deviceId)}/exec`, {
      body,
      ext: extra.ext,
      signal: extra.signal,
      // The gateway itself waits up to timeout_ms + 2 s; give the HTTP layer headroom.
      timeoutMs: (extra.timeoutMs ?? 60_000) + 10_000,
      noRetry: true,
    });
  }

  /**
   * `POST /v1/hosts/{deviceId}/exec` with op `iphone` — run one codai iPhone bridge tool (`screen`, `tap`,
   * `swipe`, `type`, `open_app`, … — the local `codai-iphone` MCP names without the `iphone_` prefix) on an
   * online host with cap `iphone`. Sensitive tools are refused by the bridge when called remotely.
   */
  iphone(
    deviceId: string,
    tool: string,
    args?: Record<string, unknown>,
    extra: ExecExtra = {},
  ): Promise<HostIphoneResponse> {
    if (!IPHONE_TOOL_RE.test(tool))
      return Promise.reject(new TypeError('hosts.iphone: tool must match ^[a-z_]{1,64}$'));
    const body: HostIphoneArgs = args === undefined ? { tool } : { tool, args };
    return this.exec(deviceId, 'iphone', body, extra) as Promise<HostIphoneResponse>;
  }

  /** `POST /v1/hosts/exec/{reqId}/result` — host side: deliver an exec result. */
  postResult(
    reqId: string,
    body: HostExecResultBody,
    opts: CallOpts = {},
  ): Promise<Reply<'postHostExecResult'>> {
    return this.http.json<Reply<'postHostExecResult'>>(
      `/v1/hosts/exec/${encodeURIComponent(reqId)}/result`,
      { body, ext: opts.ext, signal: opts.signal },
    );
  }

  /**
   * `GET /v1/hosts/stream?os=&hostname=&roots=&caps=&env=` — host side: announce
   * this device (with its capabilities and the environment serving its
   * `video` / `pty` streams) and receive `hello` / `ping` / `exec` events.
   * Closed by the server after 6 h; reconnect to re-announce presence.
   */
  async *stream(
    query: {
      os?: string;
      hostname?: string;
      roots?: string[];
      caps?: string[];
      environmentId?: string;
    } = {},
    opts: CallOpts = {},
  ): AsyncGenerator<HostStreamEvent, void, undefined> {
    const frames = this.http.sse('/v1/hosts/stream', {
      query: {
        os: query.os,
        hostname: query.hostname,
        roots: query.roots?.length ? query.roots.join(',') : undefined,
        caps: query.caps?.length ? query.caps.join(',') : undefined,
        env: query.environmentId,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
    for await (const frame of frames) {
      const data = frameJson<Record<string, unknown>>(frame);
      if (!data) continue;
      yield { event: frame.event, data } as HostStreamEvent;
    }
  }
}
