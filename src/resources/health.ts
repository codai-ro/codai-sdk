/** Unauthenticated probes at the root: `/health`, `/health/ready`, `/status`. */
import { type HttpClient } from '../http';
import { type Reply } from './_shared';

export type HealthResponse = Reply<'getHealth'>;
export type HealthReadyResponse = Reply<'getHealthReady'>;
export type StatusResponse = Reply<'getStatus'>;

export class Health {
  constructor(private readonly http: HttpClient) {}

  /** Liveness probe. */
  get(opts: { signal?: AbortSignal } = {}): Promise<HealthResponse> {
    return this.http.json<HealthResponse>('/health', { signal: opts.signal, noRetry: true });
  }

  /**
   * Deep readiness probe. A 503 is returned as `{ ok: false, ... }` rather
   * than thrown, so callers can read the failing check.
   */
  async ready(
    opts: { signal?: AbortSignal } = {},
  ): Promise<HealthReadyResponse & { httpStatus: number }> {
    const res = await this.http.request('/health/ready', {
      signal: opts.signal,
      noRetry: true,
      acceptStatus: [503],
    });
    const body = (await res.json()) as HealthReadyResponse;
    return { ...body, httpStatus: res.status };
  }

  /** Registry snapshot (aliases + provider health). */
  status(opts: { signal?: AbortSignal } = {}): Promise<StatusResponse> {
    return this.http.json<StatusResponse>('/status', { signal: opts.signal, noRetry: true });
  }
}
