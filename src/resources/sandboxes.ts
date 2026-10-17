/**
 * `/v1/sandboxes` — agent sandboxes (beta): isolated gVisor containers with a persistent
 * `/workspace`, no network by default, artifacts from `/workspace/out` as scanned, signed links.
 */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type Sandbox = Schema<'Sandbox'>;
export type SandboxEgress = Mutable<Schema<'SandboxEgress'>>;
export type SandboxCreateInput = Mutable<Schema<'SandboxCreate'>>;
export type SandboxExecInput = Mutable<Schema<'SandboxExecRequest'>>;
export type SandboxRunInput = Mutable<Schema<'SandboxRunRequest'>>;
export type SandboxExecResult = Schema<'SandboxExecResult'>;
export type SandboxExecEvent = Schema<'SandboxExecEvent'>;
export type SandboxArtifact = Schema<'SandboxArtifact'>;
export type SandboxReceipt = Schema<'SandboxReceipt'>;
export type SandboxInput = Mutable<Schema<'SandboxInput'>>;
export type SandboxList = Reply<'listSandboxes'>;
export type SandboxArtifactList = Reply<'listSandboxArtifacts'>;
export type SandboxFileList = Reply<'listSandboxFiles'>;
export type SandboxFileWritten = Reply<'putSandboxFile'>;
export type SandboxSnapshot = Reply<'snapshotSandbox'>;
export type SandboxStatus = Sandbox['status'];
export type SandboxSnapshotInput = Mutable<NonNullable<Body<'snapshotSandbox'>>>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
type IdemOpts = CallOpts & { idempotencyKey?: string };

/** A downloaded workspace file: raw bytes plus the server's SHA-256. */
export interface SandboxFile {
  bytes: Uint8Array;
  sha256: string | null;
  contentType: string | null;
}

const base = (id: string) => `/v1/sandboxes/${encodeURIComponent(id)}`;
/** Encode each segment of a workspace path, keeping the slashes. */
const filePath = (p: string) =>
  p
    .replace(/^\/+/, '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
const idem = (key?: string) => (key ? { 'Idempotency-Key': key } : undefined);

export class SandboxFiles {
  constructor(private readonly http: HttpClient) {}

  /** `PUT /v1/sandboxes/{id}/files/{path}` — write raw bytes (≤ 100 MB) to `/workspace/<path>`. */
  put(
    id: string,
    path: string,
    content: string | Uint8Array | ArrayBuffer | Blob,
    opts: CallOpts = {},
  ): Promise<SandboxFileWritten> {
    const body = (typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content) as unknown as BodyInit;
    return this.http.json<SandboxFileWritten>(`${base(id)}/files/${filePath(path)}`, {
      method: 'PUT',
      rawBody: body,
      headers: { 'Content-Type': 'application/octet-stream' },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/sandboxes/{id}/files/{path}` — raw bytes of `/workspace/<path>` (`sha256` from `x-sha256`). */
  async get(id: string, path: string, opts: CallOpts = {}): Promise<SandboxFile> {
    const res = await this.http.request(`${base(id)}/files/${filePath(path)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      sha256: res.headers.get('x-sha256'),
      contentType: res.headers.get('content-type'),
    };
  }

  /** `GET /v1/sandboxes/{id}/files?path=` — entries under a directory (default the workspace root). */
  list(id: string, path?: string, opts: CallOpts = {}): Promise<SandboxFileList> {
    return this.http.json<SandboxFileList>(`${base(id)}/files`, {
      query: { path },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Sandboxes {
  readonly files: SandboxFiles;

  constructor(private readonly http: HttpClient) {
    this.files = new SandboxFiles(http);
  }

  /** `POST /v1/sandboxes` — start a sandbox (`ttl_seconds` 60–86400, default 3600; `egress` none by default). */
  create(input: SandboxCreateInput = {}, opts: CallOpts = {}): Promise<Sandbox> {
    return this.http.json<Sandbox>('/v1/sandboxes', {
      method: 'POST',
      body: input,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/sandboxes` — your sandboxes, newest first, optionally one `status`. */
  list(query: { status?: SandboxStatus } = {}, opts: CallOpts = {}): Promise<SandboxList> {
    return this.http.json<SandboxList>('/v1/sandboxes', {
      query: { status: query.status },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/sandboxes/{id}` */
  retrieve(id: string, opts: CallOpts = {}): Promise<Sandbox> {
    return this.http.json<Sandbox>(base(id), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/sandboxes/{id}/exec` — run one command and wait for it (≤ 900 s). Use
   * {@link execStream} to receive stdout / stderr as they are produced.
   */
  exec(id: string, input: SandboxExecInput, opts: IdemOpts = {}): Promise<SandboxExecResult> {
    return this.http.json<SandboxExecResult>(`${base(id)}/exec`, {
      method: 'POST',
      body: input,
      headers: idem(opts.idempotencyKey),
      timeoutMs: execTimeoutMs(input.timeout_seconds),
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/sandboxes/{id}/exec` with `Accept: text/event-stream` — yields `start`, `stdout`,
   * `stderr`, `truncated` and finally `exit` (or `error`) events.
   */
  async *execStream(
    id: string,
    input: SandboxExecInput,
    opts: IdemOpts = {},
  ): AsyncGenerator<SandboxExecEvent, void, undefined> {
    const frames = this.http.sse(`${base(id)}/exec`, {
      method: 'POST',
      body: input,
      headers: { Accept: 'text/event-stream', ...idem(opts.idempotencyKey) },
      ext: opts.ext,
      signal: opts.signal,
    });
    for await (const frame of frames) {
      const data = frameJson<SandboxExecEvent>(frame);
      if (!data || typeof data !== 'object' || !('type' in data)) continue;
      yield data;
      if (data.type === 'exit' || data.type === 'error') return;
    }
  }

  /** `GET /v1/sandboxes/{id}/artifacts` — collect `/workspace/out` (scanned, signed 1 h links). */
  artifacts(id: string, opts: CallOpts = {}): Promise<SandboxArtifactList> {
    return this.http.json<SandboxArtifactList>(`${base(id)}/artifacts`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/sandboxes/{id}/snapshot` — store a compressed copy of the workspace. */
  snapshot(
    id: string,
    input: SandboxSnapshotInput = {},
    opts: CallOpts = {},
  ): Promise<SandboxSnapshot> {
    return this.http.json<SandboxSnapshot>(`${base(id)}/snapshot`, {
      method: 'POST',
      body: input,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/sandboxes/{id}` — destroy the sandbox and its workspace (204). */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(base(id), { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/sandboxes/run` — one shot: create, write `inputs` under `/workspace/in`, run,
   * collect artifacts, destroy. Pass `idempotencyKey` to make retries safe.
   */
  run(input: SandboxRunInput, opts: IdemOpts = {}): Promise<SandboxExecResult> {
    return this.http.json<SandboxExecResult>('/v1/sandboxes/run', {
      method: 'POST',
      body: input,
      headers: idem(opts.idempotencyKey),
      timeoutMs: execTimeoutMs(input.timeout_seconds),
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

/** Client timeout for a blocking exec: the server limit plus a margin for restore and upload. */
function execTimeoutMs(timeoutSeconds: number | undefined): number {
  return ((timeoutSeconds ?? 120) + 60) * 1000;
}
