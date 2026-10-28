/**
 * codai Studio exports — FCPXML project zips of your video creatives, for Final Cut Pro, DaVinci Resolve or Premiere,
 * and Lottie JSON / dotLottie animations (`kind` tells them apart).
 *
 *   `GET /v1/studio/creatives/{id}/export.fcpxml` — queue an export (`creatives.exportFcpxml`), HTTP 202
 *   `GET /v1/studio/creatives/{id}/export.lottie` — a Lottie export, ready at once (`creatives.exportLottie`), HTTP 200
 *   `GET /v1/studio/exports/{id}`                 — the export state; a signed zip `url` once `succeeded` (`retrieve`)
 *
 * `wait(id)` polls `retrieve` until the export has `succeeded` or `failed`. Only newly rendered seconds are billed (at
 * the final render price); polling is free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type QueryOf, type Schema } from './_shared';

export type StudioExport = Schema<'StudioExport'>;
export type ExportFcpxmlQuery = QueryOf<'exportCreativeFcpxml'>;
/** `creatives.exportLottie` / `downloadLottie` options (`download` is chosen by the method). */
export type ExportLottieQuery = Omit<QueryOf<'exportCreativeLottie'>, 'download'>;
/** `creatives.downloadLottie`: the file bytes (`application/json` or `application/zip`) and its suggested name. */
export interface LottieDownload {
  bytes: Uint8Array;
  filename: string | null;
  contentType: string | null;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface ExportWaitOptions extends CallOpts {
  /** Delay between polls (default 3000 ms). */
  intervalMs?: number;
  /** Give up after this long (default 900 000 ms = 15 min). */
  timeoutMs?: number;
}

const path = (id: string) => `/v1/studio/exports/${encodeURIComponent(id)}`;

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class Exports {
  constructor(private readonly http: HttpClient) {}

  /** The export: `queued` / `running`, then `succeeded` (signed `url`, valid 1 h) or `failed` (`error`). Free. */
  retrieve(id: string, opts: CallOpts = {}): Promise<StudioExport> {
    return this.http.json<StudioExport>(path(id), { ext: opts.ext, signal: opts.signal });
  }

  /**
   * Poll `retrieve` every `intervalMs` (default 3 s) until the export is `succeeded` or `failed` and resolve with it
   * (a `failed` export resolves too — check `status` / `error`). Throws when it is not done within `timeoutMs`
   * (default 15 min) or when `signal` aborts.
   */
  async wait(id: string, opts: ExportWaitOptions = {}): Promise<StudioExport> {
    const { intervalMs = 3000, timeoutMs = 900_000, signal, ext } = opts;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.retrieve(id, { ext, signal });
      if (st.status === 'succeeded' || st.status === 'failed') return st;
      if (Date.now() + intervalMs > deadline) {
        throw new Error(`codai export ${id} did not finish within ${timeoutMs} ms`);
      }
      await abortableSleep(intervalMs, signal);
    }
  }
}
