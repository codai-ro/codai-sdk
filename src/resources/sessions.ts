/**
 * `/v1/sessions/*` — shared-sessions protocol v2 (events, controls, lease,
 * dispatch, SSE stream) plus the per-session shares under `/shares`.
 *
 * Every call needs the `x-codai-device` header: set it once via
 * `new Codai({ device: '<uuid>' })` or per call through `ext.device`.
 */
import { type CodaiRequestExtensions, frameJson, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type Session = Schema<'Session'>;
export type SessionListItem = Schema<'SessionListItem'>;
export type SessionDetail = Reply<'getSession'>;
export type SessionCreateRequest = Mutable<Body<'createSession'>>;
export type SessionPatchRequest = Mutable<Body<'updateSession'>>;
export type SessionEvent = Schema<'SessionEvent'>;
export type SessionIncomingEvent = Mutable<Schema<'SessionIncomingEvent'>>;
export type SessionEventsAppendRequest = Mutable<Body<'appendSessionEvents'>>;
export type SessionEventsAppendResponse = Reply<'appendSessionEvents'>;
export type SessionEventsPage = Reply<'listSessionEvents'>;
export type SessionControl = Schema<'SessionControl'>;
export type SessionControlRequest = Mutable<Body<'submitSessionControl'>>;
export type SessionControlAccepted = Reply<'submitSessionControl', 202>;
export type SessionDispatchRequest = Mutable<Body<'dispatchToDevice'>>;
export type SessionDispatchResponse = Reply<'dispatchToDevice', 202>;
export type SessionLeaseClaimRequest = Mutable<Body<'claimSessionLease'>>;
export type SessionLeaseResponse = Reply<'claimSessionLease'>;
export type SessionShare = Schema<'OrgSessionShare'>;
export type SessionShareCreateRequest = Mutable<Body<'createSessionShare'>>;
export type SessionShareCreated = Reply<'createSessionShare', 201>;
export type SharedSession = Schema<'OrgSharedSession'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

/** Frames of `GET /v1/sessions/{id}/stream`; every payload carries `v: 1`. */
export type SessionStreamEvent =
  | { event: 'event'; data: { v: 1; seq: number } & Record<string, unknown> }
  | {
      event: 'control';
      data: { v: 1; id: string; kind: string; seq: number | null; applied: boolean } & Record<
        string,
        unknown
      >;
    }
  | { event: 'lease'; data: { v: 1; holder_device_id: string | null; expires_at: string | null } }
  | {
      event: 'presence';
      data: {
        v: 1;
        device_id: string;
        user_id: string;
        role: string;
        executor: boolean;
        last_seen: string;
        driving: boolean;
        online: boolean;
      };
    }
  | { event: string; data: Record<string, unknown> };

const enc = encodeURIComponent;

export class SessionLease {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/sessions/{id}/lease` — CAS claim; `force: true` takes over a live lease. */
  acquire(
    sessionId: string,
    body: SessionLeaseClaimRequest = {},
    opts: CallOpts = {},
  ): Promise<SessionLeaseResponse> {
    return this.http.json<SessionLeaseResponse>(`/v1/sessions/${enc(sessionId)}/lease`, {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PUT /v1/sessions/{id}/lease` — heartbeat every 10 s (TTL 30 s). */
  renew(sessionId: string, opts: CallOpts = {}): Promise<SessionLeaseResponse> {
    return this.http.json<SessionLeaseResponse>(`/v1/sessions/${enc(sessionId)}/lease`, {
      method: 'PUT',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/sessions/{id}/lease` */
  release(sessionId: string, opts: CallOpts = {}): Promise<Reply<'releaseSessionLease'>> {
    return this.http.json<Reply<'releaseSessionLease'>>(`/v1/sessions/${enc(sessionId)}/lease`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class SessionEvents {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/sessions/{id}/events?after=&limit=` */
  list(
    sessionId: string,
    query: Mutable<QueryOf<'listSessionEvents'>> = {},
    opts: CallOpts = {},
  ): Promise<SessionEventsPage> {
    return this.http.json<SessionEventsPage>(`/v1/sessions/${enc(sessionId)}/events`, {
      query: { after: query.after, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/sessions/{id}/events` — executor only (needs the live lease). */
  append(
    sessionId: string,
    body: SessionEventsAppendRequest,
    opts: CallOpts = {},
  ): Promise<SessionEventsAppendResponse> {
    return this.http.json<SessionEventsAppendResponse>(`/v1/sessions/${enc(sessionId)}/events`, {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class SessionControls {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/sessions/{id}/controls?applied=&target=` — drain the control queue. */
  async list(
    sessionId: string,
    query: { applied?: boolean; target?: 'me' | string } = {},
    opts: CallOpts = {},
  ): Promise<SessionControl[]> {
    const raw = await this.http.json<Reply<'listSessionControls'>>(
      `/v1/sessions/${enc(sessionId)}/controls`,
      {
        query: { applied: query.applied, target: query.target },
        ext: opts.ext,
        signal: opts.signal,
      },
    );
    return [...(raw.controls ?? [])];
  }

  /** `POST /v1/sessions/{id}/control` — send a control to the executor (editor+). */
  submit(
    sessionId: string,
    body: SessionControlRequest,
    opts: CallOpts = {},
  ): Promise<SessionControlAccepted> {
    return this.http.json<SessionControlAccepted>(`/v1/sessions/${enc(sessionId)}/control`, {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/sessions/{id}/control/{cid}/applied` — executor only. */
  markApplied(
    sessionId: string,
    controlId: string,
    opts: CallOpts = {},
  ): Promise<Reply<'markSessionControlApplied'>> {
    return this.http.json<Reply<'markSessionControlApplied'>>(
      `/v1/sessions/${enc(sessionId)}/control/${enc(controlId)}/applied`,
      { method: 'POST', ext: opts.ext, signal: opts.signal },
    );
  }
}

export class SessionShares {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/sessions/{id}/shares` — owner only. */
  async list(sessionId: string, opts: CallOpts = {}): Promise<SessionShare[]> {
    const raw = await this.http.json<Reply<'listSessionShares'>>(
      `/v1/sessions/${enc(sessionId)}/shares`,
      { ext: opts.ext, signal: opts.signal },
    );
    return [...(raw.shares ?? [])];
  }

  /** `POST /v1/sessions/{id}/shares` — `token` is returned once for link shares. */
  create(
    sessionId: string,
    body: SessionShareCreateRequest,
    opts: CallOpts = {},
  ): Promise<SessionShareCreated> {
    return this.http.json<SessionShareCreated>(`/v1/sessions/${enc(sessionId)}/shares`, {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/sessions/{id}/shares/{shareId}` */
  delete(
    sessionId: string,
    shareId: string,
    opts: CallOpts = {},
  ): Promise<Reply<'deleteSessionShare'>> {
    return this.http.json<Reply<'deleteSessionShare'>>(
      `/v1/sessions/${enc(sessionId)}/shares/${enc(shareId)}`,
      { method: 'DELETE', ext: opts.ext, signal: opts.signal },
    );
  }

  /** `GET /v1/sessions/shared-with-me` */
  async sharedWithMe(
    query: { archived?: boolean } = {},
    opts: CallOpts = {},
  ): Promise<SharedSession[]> {
    const raw = await this.http.json<Reply<'listSessionsSharedWithMe'>>(
      '/v1/sessions/shared-with-me',
      {
        query: { archived: query.archived ? '1' : undefined },
        ext: opts.ext,
        signal: opts.signal,
      },
    );
    return [...(raw.sessions ?? [])];
  }
}

export class Sessions {
  readonly events: SessionEvents;
  readonly controls: SessionControls;
  readonly lease: SessionLease;
  readonly shares: SessionShares;

  constructor(private readonly http: HttpClient) {
    this.events = new SessionEvents(http);
    this.controls = new SessionControls(http);
    this.lease = new SessionLease(http);
    this.shares = new SessionShares(http);
  }

  /** `POST /v1/sessions` — idempotent on `session_key` (200 existing / 201 created). */
  async create(
    body: SessionCreateRequest = {},
    opts: CallOpts = {},
  ): Promise<Session & { created: boolean }> {
    const res = await this.http.request('/v1/sessions', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
    const session = (await res.json()) as Session;
    return { ...session, created: res.status === 201 };
  }

  /** `GET /v1/sessions?limit=&archived=` — own sessions first, then shared. */
  async list(
    query: { limit?: number; archived?: boolean } = {},
    opts: CallOpts = {},
  ): Promise<SessionListItem[]> {
    const raw = await this.http.json<Reply<'listSessions'>>('/v1/sessions', {
      query: { limit: query.limit, archived: query.archived ? '1' : undefined, v: '2' },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.sessions ?? [])];
  }

  /** `GET /v1/sessions/{id}` — detail with members, lease and presence. */
  get(
    sessionId: string,
    query: { share?: string } = {},
    opts: CallOpts = {},
  ): Promise<SessionDetail> {
    return this.http.json<SessionDetail>(`/v1/sessions/${enc(sessionId)}`, {
      query: { share: query.share, v: '2' },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/sessions/{id}` — rename / archive (owner). */
  update(sessionId: string, body: SessionPatchRequest, opts: CallOpts = {}): Promise<Session> {
    return this.http.json<Session>(`/v1/sessions/${enc(sessionId)}`, {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/sessions/{id}` — irreversible (owner). */
  delete(sessionId: string, opts: CallOpts = {}): Promise<Reply<'deleteSession'>> {
    return this.http.json<Reply<'deleteSession'>>(`/v1/sessions/${enc(sessionId)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/sessions/{id}/dispatch` — queue a `send` for one device and wake it over FCM. */
  dispatch(
    sessionId: string,
    body: SessionDispatchRequest,
    opts: CallOpts = {},
  ): Promise<SessionDispatchResponse> {
    return this.http.json<SessionDispatchResponse>(`/v1/sessions/${enc(sessionId)}/dispatch`, {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `GET /v1/sessions/{id}/stream?after=` — live SSE of `event` / `control` /
   * `lease` / `presence` frames. `: ping` heartbeats are skipped. The server
   * closes after 30 min; reconnect with `after` = highest `seq` seen.
   */
  async *stream(
    sessionId: string,
    query: { after?: number; share?: string } = {},
    opts: CallOpts = {},
  ): AsyncGenerator<SessionStreamEvent, void, undefined> {
    const frames = this.http.sse(`/v1/sessions/${enc(sessionId)}/stream`, {
      query: { after: query.after, share: query.share },
      ext: opts.ext,
      signal: opts.signal,
    });
    for await (const frame of frames) {
      const data = frameJson<Record<string, unknown>>(frame);
      if (!data) continue;
      yield { event: frame.event, data } as SessionStreamEvent;
    }
  }
}
