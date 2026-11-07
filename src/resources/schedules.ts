/** `/v1/schedules/*`, `/v1/schedule-runs/*`, `/v1/scheduler/*` — the codai Scheduler (ADR 0006). */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type Schedule = Schema<'Schedule'>;
export type ScheduleInput = Mutable<Schema<'ScheduleInput'>>;
export type ScheduleRun = Schema<'ScheduleRun'>;
export type SchedulerHost = Schema<'SchedulerHost'>;
export type SchedulePreviewRequest = Mutable<Body<'previewSchedule'>>;
export type SchedulePreview = Reply<'previewSchedule'>;
export type SchedulerHostPatch = Mutable<Body<'updateSchedulerHost'>>;
export type ScheduleRunResult = Mutable<Body<'reportScheduleRunResult'>>;
export type ScheduleClaim = Reply<'claimScheduleRun'>;
export type HeartbeatMonitor = Schema<'HeartbeatMonitor'>;
export type HeartbeatCreateRequest = Mutable<Body<'createHeartbeat'>>;
export type HeartbeatPatch = Mutable<Body<'updateHeartbeat'>>;
export type ScheduleAuditEntry = Schema<'ScheduleAuditEntry'>;

/** One `event: schedule` frame of `GET /v1/schedules/stream`. */
export interface ScheduleStreamEvent {
  op: 'schedule' | 'run';
  id: string;
  schedule_id?: string;
  state?: string;
  device_id?: string | null;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const one = (id: string, suffix = '') => `/v1/schedules/${encodeURIComponent(id)}${suffix}`;
const run = (id: string, suffix: string) => `/v1/schedule-runs/${encodeURIComponent(id)}${suffix}`;

/** Host-side executor protocol: claim → heartbeat → result. Needs a device header (`device` client option). */
export class ScheduleExecutor {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/scheduler/claim` — the next run this device may execute, or `null` (204). Lease 60 s. */
  async claim(opts: CallOpts = {}): Promise<ScheduleClaim | null> {
    const res = await this.http.request('/v1/scheduler/claim', {
      method: 'POST',
      body: {},
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    if (res.status === 204) return null;
    return (await res.json()) as ScheduleClaim;
  }

  /** `POST /v1/schedule-runs/{id}/heartbeat` — extend the lease, append log. Throws 409 when the lease was lost. */
  async heartbeat(
    runId: string,
    body: { attempt: number; log?: string },
    opts: CallOpts = {},
  ): Promise<void> {
    await this.http.request(run(runId, '/heartbeat'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/schedule-runs/{id}/result` — finish the run (retries / chains are decided server-side). */
  result(runId: string, body: ScheduleRunResult, opts: CallOpts = {}): Promise<ScheduleRun> {
    return this.http.json<ScheduleRun>(run(runId, '/result'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/schedules/{id}/approve-command` — this host approves the exact shell command hash it showed the user. */
  approveCommand(
    scheduleId: string,
    commandHash: string,
    opts: CallOpts = {},
  ): Promise<Reply<'approveScheduleCommand'>> {
    return this.http.json(one(scheduleId, '/approve-command'), {
      method: 'POST',
      body: { command_hash: commandHash },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

/** Scheduler hosts (your devices as executors). */
export class SchedulerHosts {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/scheduler/hosts`. */
  async list(opts: CallOpts = {}): Promise<SchedulerHost[]> {
    const r = await this.http.json<Reply<'listSchedulerHosts'>>('/v1/scheduler/hosts', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.hosts];
  }

  /** `PATCH /v1/scheduler/hosts/{id}` — name, tags, kind, os, arch. */
  update(
    id: string,
    body: SchedulerHostPatch,
    opts: CallOpts = {},
  ): Promise<Reply<'updateSchedulerHost'>> {
    return this.http.json(`/v1/scheduler/hosts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

/** Heartbeat monitors: dead-man switches for jobs codai does not run (`/ping/<token>`). */
export class Heartbeats {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/heartbeats`. */
  async list(opts: CallOpts = {}): Promise<HeartbeatMonitor[]> {
    const r = await this.http.json<Reply<'listHeartbeats'>>('/v1/heartbeats', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.heartbeats];
  }

  /** `POST /v1/heartbeats` — the response carries `ping_url` once. */
  create(body: HeartbeatCreateRequest, opts: CallOpts = {}): Promise<HeartbeatMonitor> {
    return this.http.json<HeartbeatMonitor>('/v1/heartbeats', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [201],
    });
  }

  /** `PATCH /v1/heartbeats/{id}` — name, period_s, grace_s, paused. */
  update(id: string, body: HeartbeatPatch, opts: CallOpts = {}): Promise<HeartbeatMonitor> {
    return this.http.json<HeartbeatMonitor>(`/v1/heartbeats/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/heartbeats/{id}`. */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(`/v1/heartbeats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Schedules {
  readonly hosts: SchedulerHosts;
  readonly executor: ScheduleExecutor;

  constructor(private readonly http: HttpClient) {
    this.hosts = new SchedulerHosts(http);
    this.executor = new ScheduleExecutor(http);
  }

  /** `GET /v1/schedules`. */
  async list(opts: CallOpts = {}): Promise<Schedule[]> {
    const r = await this.http.json<Reply<'listSchedules'>>('/v1/schedules', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.schedules];
  }

  /** `POST /v1/schedules`. */
  create(body: ScheduleInput, opts: CallOpts = {}): Promise<Schedule> {
    return this.http.json<Schedule>('/v1/schedules', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [201],
    });
  }

  /** `POST /v1/schedules/preview` — cron or plain words (RO/EN) → trigger + next runs + DST warning. */
  preview(body: SchedulePreviewRequest, opts: CallOpts = {}): Promise<SchedulePreview> {
    return this.http.json<SchedulePreview>('/v1/schedules/preview', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/schedules/{id}`. */
  get(id: string, opts: CallOpts = {}): Promise<Schedule> {
    return this.http.json<Schedule>(one(id), { ext: opts.ext, signal: opts.signal });
  }

  /** `PATCH /v1/schedules/{id}` — partial; a changed shell command clears host approvals. */
  update(id: string, body: Partial<ScheduleInput>, opts: CallOpts = {}): Promise<Schedule> {
    return this.http.json<Schedule>(one(id), {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/schedules/{id}`. */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(one(id), { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/schedules/{id}/run` — run now (policy still applies). */
  runNow(id: string, opts: CallOpts = {}): Promise<Reply<'runSchedule', 202>> {
    return this.http.json(one(id, '/run'), {
      method: 'POST',
      body: {},
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [202],
      noRetry: true,
    });
  }

  /** `GET /v1/schedules/{id}/runs`. */
  async runs(id: string, opts: CallOpts = {}): Promise<ScheduleRun[]> {
    const r = await this.http.json<Reply<'listScheduleRuns'>>(one(id, '/runs'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.runs];
  }

  /** `GET /v1/schedule-runs?limit=` — recent runs of every schedule. */
  async recentRuns(limit = 50, opts: CallOpts = {}): Promise<ScheduleRun[]> {
    const r = await this.http.json<Reply<'listRecentScheduleRuns'>>('/v1/schedule-runs', {
      query: { limit },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.runs];
  }

  /** `POST /v1/schedule-runs/{id}/decision` — approve or skip a run waiting for you. */
  decide(runId: string, approve: boolean, opts: CallOpts = {}): Promise<ScheduleRun> {
    return this.http.json<ScheduleRun>(run(runId, '/decision'), {
      method: 'POST',
      body: { approve },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/schedules/pause` — vacation mode until `until` (or until resumed). */
  pause(
    body: { until?: string | null; resume_policy?: 'skip' | 'backfill' } = {},
    opts: CallOpts = {},
  ): Promise<Reply<'pauseSchedules'>> {
    return this.http.json('/v1/schedules/pause', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/schedules/resume` — `backfill: true` runs each missed schedule once. */
  resume(
    body: { backfill?: boolean } = {},
    opts: CallOpts = {},
  ): Promise<Reply<'resumeSchedules'>> {
    return this.http.json('/v1/schedules/resume', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/schedules/audit` — append-only scheduler history, newest first (optionally one schedule). */
  async audit(
    params: { schedule_id?: string; limit?: number } = {},
    opts: CallOpts = {},
  ): Promise<ScheduleAuditEntry[]> {
    const r = await this.http.json<Reply<'listScheduleAudit'>>('/v1/schedules/audit', {
      query: { schedule_id: params.schedule_id, limit: params.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.audit];
  }

  /** `GET /v1/schedules/templates`. */
  templates(opts: CallOpts = {}): Promise<Reply<'listScheduleTemplates'>> {
    return this.http.json('/v1/schedules/templates', { ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/schedules/templates` — canonical prompt + draft create body (no write). */
  renderTemplate(
    template: string,
    params: Record<string, unknown> = {},
    opts: CallOpts = {},
  ): Promise<Reply<'renderScheduleTemplate'>> {
    return this.http.json('/v1/schedules/templates', {
      method: 'POST',
      body: { template, params },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/schedules/stream` — live `schedule` events (keepalives skipped). */
  async *stream(opts: CallOpts = {}): AsyncGenerator<ScheduleStreamEvent, void, undefined> {
    for await (const frame of this.http.sse('/v1/schedules/stream', {
      ext: opts.ext,
      signal: opts.signal,
    })) {
      if (frame.event !== 'schedule') continue;
      const data = frameJson<ScheduleStreamEvent>(frame);
      if (data) yield data;
    }
  }
}
