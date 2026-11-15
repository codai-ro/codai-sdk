/** `/v1/agents/*` — synchronous runs and the persisted async run lifecycle. */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type AgentRunRequest = Mutable<Body<'runAgentSync'>>;
export type AgentRunCreateRequest = Mutable<Body<'createAgentRun'>>;
export type AgentSyncResult = Reply<'runAgentSync'>;
export type AgentRunAccepted = Reply<'createAgentRun', 202>;
export type AgentRun = Reply<'getAgentRun'>;
export type AgentRunStep = Schema<'AgentRunStep'>;
export type AgentRunStats = Reply<'getAgentRunStats'>;
export type AgentRunStatus = Schema<'AgentRunStatus'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface AgentRunResult {
  result: string;
  model: string;
  /** Usage-event id — exact target for `feedback.submit`. */
  eventId: string | null;
  usage: AgentSyncResult['usage'] | null;
  raw: AgentSyncResult;
  headers: Headers;
}

/** SSE frames of `GET /v1/agents/runs/{id}/stream`. */
export type AgentRunStreamEvent =
  | {
      event: 'step';
      data: {
        seq: number;
        kind: 'plan' | 'tool_call' | 'observation' | 'answer';
        summary: string | null;
      };
    }
  | {
      event: 'done';
      data: {
        status: 'completed' | 'failed' | 'cancelled';
        result: string | null;
        error: string | null;
        step_count: number;
      };
    }
  | { event: 'timeout'; data: Record<string, never> };

export class AgentRuns {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/agents/runs` — returns 202 with the run id. */
  create(body: AgentRunCreateRequest, opts: CallOpts = {}): Promise<AgentRunAccepted> {
    return this.http.json<AgentRunAccepted>('/v1/agents/runs', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/agents/runs/{id}` */
  get(id: string, opts: CallOpts = {}): Promise<AgentRun> {
    return this.http.json<AgentRun>(`/v1/agents/runs/${encodeURIComponent(id)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/agents/runs/{id}/steps` — newest first. */
  async steps(id: string, opts: CallOpts = {}): Promise<AgentRunStep[]> {
    const raw = await this.http.json<Reply<'listAgentRunSteps'>>(
      `/v1/agents/runs/${encodeURIComponent(id)}/steps`,
      { ext: opts.ext, signal: opts.signal },
    );
    return [...(raw.steps ?? [])];
  }

  /** `GET /v1/agents/runs/stats?days=` */
  stats(days?: number, opts: CallOpts = {}): Promise<AgentRunStats> {
    return this.http.json<AgentRunStats>('/v1/agents/runs/stats', {
      query: { days },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/agents/runs/{id}/cancel` */
  cancel(id: string, opts: CallOpts = {}): Promise<Reply<'cancelAgentRun'>> {
    return this.http.json<Reply<'cancelAgentRun'>>(
      `/v1/agents/runs/${encodeURIComponent(id)}/cancel`,
      { method: 'POST', body: {}, ext: opts.ext, signal: opts.signal },
    );
  }

  /**
   * `GET /v1/agents/runs/{id}/stream` — async iterator over `step` / `done` /
   * `timeout` events. The iterator ends after `done`; on `timeout` (30 min)
   * it also ends and you may reconnect (full replay from seq 0).
   */
  async *stream(
    id: string,
    opts: CallOpts = {},
  ): AsyncGenerator<AgentRunStreamEvent, void, undefined> {
    const frames = this.http.sse(`/v1/agents/runs/${encodeURIComponent(id)}/stream`, {
      ext: opts.ext,
      signal: opts.signal,
    });
    for await (const frame of frames) {
      const data = frameJson<Record<string, unknown>>(frame);
      if (!data) continue;
      const ev = { event: frame.event, data } as AgentRunStreamEvent;
      yield ev;
      if (ev.event === 'done' || ev.event === 'timeout') return;
    }
  }
}

export class Agents {
  readonly runs: AgentRuns;
  constructor(private readonly http: HttpClient) {
    this.runs = new AgentRuns(http);
  }

  /** `POST /v1/agents/run` — blocks until the agent loop finishes. */
  async run(body: AgentRunRequest, opts: CallOpts = {}): Promise<AgentRunResult> {
    const res = await this.http.request('/v1/agents/run', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as AgentSyncResult;
    return {
      result: String(raw.result ?? ''),
      model: String(raw.model ?? ''),
      eventId: raw.event_id ?? res.headers.get('x-codai-event-id'),
      usage: raw.usage ?? null,
      raw,
      headers: res.headers,
    };
  }
}
