/**
 * `/v1/verify/agent-output*` — EXPERIMENTAL, unaudited (HIDE protocol) verification of
 * signed agent outputs. Provenance only, never authentication. Unauthenticated endpoints.
 */
import { type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type EnvironmentTaskOutputSignature = Schema<'EnvironmentTaskOutputSignature'>;
export type AgentOutputKey = Reply<'getAgentOutputKey'>;
export type AgentOutputVerifyBody = Mutable<Body<'verifyAgentOutput'>>;
export type AgentOutputVerifyResult = Reply<'verifyAgentOutput'>;

type CallOpts = { signal?: AbortSignal };

export class Verify {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/verify/agent-output/key` — `{ enabled: false }` when signing is off. */
  agentOutputKey(opts: CallOpts = {}): Promise<AgentOutputKey> {
    return this.http.json<AgentOutputKey>('/v1/verify/agent-output/key', { signal: opts.signal });
  }

  /** `POST /v1/verify/agent-output` — 503 `signing_disabled` when signing is off. */
  agentOutput(body: AgentOutputVerifyBody, opts: CallOpts = {}): Promise<AgentOutputVerifyResult> {
    return this.http.json<AgentOutputVerifyResult>('/v1/verify/agent-output', {
      method: 'POST',
      body,
      signal: opts.signal,
      // 503 here means `signing_disabled`, not a transient outage.
      noRetry: true,
    });
  }
}
