/**
 * OS protection gate (spec `packages/agent-core/spec/os-gate.json`).
 *
 *   `GET /v1/policy`          — effective client policy; `os_gate.allow_override` is false when ANY org of the
 *                               caller forbids overrides. Cache it (the gateway sends `max-age=300`) and keep the
 *                               last value offline; a 503 `policy_unavailable` means "keep the cached value".
 *   `POST /v1/os-gate/events` — audit an override granted/revoked on a device (check ids + surface + app version +
 *                               time only; detection details never leave the device). Answers 202 `{ ok: true }`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply, type Schema } from './_shared';

export type PolicyResponse = Reply<'getPolicy'>;
export type OsGateEvent = Schema<'OsGateEvent'>;
export type OsGateCheckId = OsGateEvent['checks'][number];
export type OsGateSurface = OsGateEvent['surface'];
export type OsGateEventAccepted = Schema<'OsGateEventAccepted'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class OsGate {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/policy` — `{ os_gate: { allow_override } }` folded over every org of the caller (strictest wins). */
  policy(opts: CallOpts = {}): Promise<PolicyResponse> {
    return this.http.json<PolicyResponse>('/v1/policy', { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/os-gate/events` — record that the user granted or revoked an override of `checks` on `surface`.
   * The body is strict: unknown keys, unknown check ids or an empty `checks` list throw a 400 `CodaiError`.
   */
  recordEvent(event: OsGateEvent, opts: CallOpts = {}): Promise<OsGateEventAccepted> {
    return this.http.json<OsGateEventAccepted>('/v1/os-gate/events', {
      method: 'POST',
      body: event,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
