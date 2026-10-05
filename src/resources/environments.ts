/** `/v1/environments/*` — cloud / BYO dev environments, their members, ports and secrets. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type Environment = Schema<'Environment'>;
export type EnvironmentDetail = Schema<'EnvironmentDetail'>;
export type EnvironmentState = Schema<'EnvironmentState'>;
export type EnvironmentProvider = Schema<'EnvironmentProvider'>;
export type EnvironmentRole = Schema<'EnvironmentRole'>;
export type EnvironmentTransition = Schema<'EnvironmentTransition'>;
export type EnvironmentEnrollToken = Schema<'EnvironmentEnrollToken'>;
export type EnvironmentEnrolled = Schema<'EnvironmentEnrolled'>;
export type EnvironmentMember = Schema<'EnvironmentMember'>;
export type EnvironmentMemberCreated = Schema<'EnvironmentMemberCreated'>;
export type EnvironmentPort = Schema<'EnvironmentPort'>;
export type EnvironmentSecret = Schema<'EnvironmentSecret'>;
export type EnvironmentSecretSet = Schema<'EnvironmentSecretSet'>;
export type EnvironmentCreateBody = Mutable<Body<'createEnvironment'>>;
export type EnvironmentPatchBody = Mutable<Body<'updateEnvironment'>>;
export type EnvironmentEnrollBody = Mutable<Body<'enrollEnvironment'>>;
export type EnvironmentAddMemberBody = Mutable<Body<'addEnvironmentMember'>>;
export type EnvironmentPortBody = Mutable<Body<'setEnvironmentPort'>>;
export type ListEnvironmentsQuery = Mutable<QueryOf<'listEnvironments'>>;
export type EnvironmentSshCert = Reply<'issueMyEnvironmentSshCert'>;
export type EnvironmentSshCertBody = Mutable<Body<'issueMyEnvironmentSshCert'>>;
export type EnvironmentSshCa = Reply<'getEnvironmentSshCa'>;
export type EnvironmentTaskList = Reply<'listEnvironmentTasks'>;
export type EnvironmentTaskCreateBody = Mutable<Body<'createEnvironmentTask'>>;
export type EnvironmentTaskCreated = Reply<'createEnvironmentTask'>;
export type EnvironmentTaskDetail = Reply<'getEnvironmentTask'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const envPath = (id: string, suffix = ''): string =>
  `/v1/environments/${encodeURIComponent(id)}${suffix}`;

export class EnvironmentMembers {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/environments/{id}/members` — any role. */
  async list(envId: string, opts: CallOpts = {}): Promise<EnvironmentMember[]> {
    const raw = await this.http.json<Reply<'listEnvironmentMembers'>>(envPath(envId, '/members'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.members ?? [])];
  }

  /** `POST /v1/environments/{id}/members` — exactly one of `user_id` / `email`. */
  async add(
    envId: string,
    body: EnvironmentAddMemberBody,
    opts: CallOpts = {},
  ): Promise<EnvironmentMemberCreated> {
    const raw = await this.http.json<Reply<'addEnvironmentMember', 201>>(
      envPath(envId, '/members'),
      { body, ext: opts.ext, signal: opts.signal },
    );
    return raw.member;
  }

  /** `PUT /v1/environments/{id}/members/me/ssh-key` — one `authorized_keys` line. */
  setSshKey(
    envId: string,
    publicKey: string,
    opts: CallOpts = {},
  ): Promise<Reply<'setMyEnvironmentSshKey'>> {
    const body: Mutable<Body<'setMyEnvironmentSshKey'>> = { public_key: publicKey };
    return this.http.json<Reply<'setMyEnvironmentSshKey'>>(envPath(envId, '/members/me/ssh-key'), {
      method: 'PUT',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/environments/{id}/members/{userId}` — 409 `last_owner` on demoting the last owner. */
  async setRole(
    envId: string,
    userId: string,
    role: EnvironmentRole,
    opts: CallOpts = {},
  ): Promise<Reply<'setEnvironmentMemberRole'>['member']> {
    const raw = await this.http.json<Reply<'setEnvironmentMemberRole'>>(
      envPath(envId, `/members/${encodeURIComponent(userId)}`),
      { method: 'PATCH', body: { role }, ext: opts.ext, signal: opts.signal },
    );
    return raw.member;
  }

  /** `DELETE /v1/environments/{id}/members/{userId}` — pass your own id to leave. */
  remove(
    envId: string,
    userId: string,
    opts: CallOpts = {},
  ): Promise<Reply<'removeEnvironmentMember'>> {
    return this.http.json<Reply<'removeEnvironmentMember'>>(
      envPath(envId, `/members/${encodeURIComponent(userId)}`),
      { method: 'DELETE', ext: opts.ext, signal: opts.signal },
    );
  }

  /** `POST /v1/environments/{id}/members/me/ssh-cert` — 12 h OpenSSH user certificate for your key. */
  sshCert(envId: string, body: EnvironmentSshCertBody, opts: CallOpts = {}): Promise<EnvironmentSshCert> {
    return this.http.json<EnvironmentSshCert>(envPath(envId, '/members/me/ssh-cert'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }
}

/** `/v1/environments/{id}/tasks` — fire-and-forget agent tasks run in the environment. */
export class EnvironmentTasks {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/environments/{id}/tasks` */
  list(envId: string, opts: CallOpts = {}): Promise<EnvironmentTaskList> {
    return this.http.json<EnvironmentTaskList>(envPath(envId, '/tasks'), { ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/environments/{id}/tasks` — queued; you get a notification when it finishes. */
  create(envId: string, body: EnvironmentTaskCreateBody, opts: CallOpts = {}): Promise<EnvironmentTaskCreated> {
    return this.http.json<EnvironmentTaskCreated>(envPath(envId, '/tasks'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/environments/{id}/tasks/{taskId}` */
  get(envId: string, taskId: string, opts: CallOpts = {}): Promise<EnvironmentTaskDetail> {
    return this.http.json<EnvironmentTaskDetail>(envPath(envId, `/tasks/${encodeURIComponent(taskId)}`), { ext: opts.ext, signal: opts.signal });
  }
}

export class EnvironmentPorts {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/environments/{id}/ports` — published (forwarded) ports. */
  async list(envId: string, opts: CallOpts = {}): Promise<EnvironmentPort[]> {
    const raw = await this.http.json<Reply<'listEnvironmentPorts'>>(envPath(envId, '/ports'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.ports ?? [])];
  }

  /** `PUT /v1/environments/{id}/ports/{port}` — publish or change visibility (upsert). */
  async set(
    envId: string,
    port: number,
    body: EnvironmentPortBody,
    opts: CallOpts = {},
  ): Promise<EnvironmentPort> {
    const raw = await this.http.json<Reply<'setEnvironmentPort'>>(
      envPath(envId, `/ports/${encodeURIComponent(String(port))}`),
      { method: 'PUT', body, ext: opts.ext, signal: opts.signal },
    );
    return raw.port;
  }

  /** `DELETE /v1/environments/{id}/ports/{port}` — unpublish. */
  remove(
    envId: string,
    port: number,
    opts: CallOpts = {},
  ): Promise<Reply<'removeEnvironmentPort'>> {
    return this.http.json<Reply<'removeEnvironmentPort'>>(
      envPath(envId, `/ports/${encodeURIComponent(String(port))}`),
      { method: 'DELETE', ext: opts.ext, signal: opts.signal },
    );
  }
}

export class EnvironmentSecrets {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/environments/{id}/secrets` — names and timestamps only, never values. */
  async list(envId: string, opts: CallOpts = {}): Promise<EnvironmentSecret[]> {
    const raw = await this.http.json<Reply<'listEnvironmentSecrets'>>(envPath(envId, '/secrets'), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.secrets ?? [])];
  }

  /** `PUT /v1/environments/{id}/secrets/{name}` — upsert; `name` is `ENV_STYLE`. */
  set(
    envId: string,
    name: string,
    value: string,
    opts: CallOpts = {},
  ): Promise<EnvironmentSecretSet> {
    const body: Mutable<Body<'setEnvironmentSecret'>> = { value };
    return this.http.json<EnvironmentSecretSet>(
      envPath(envId, `/secrets/${encodeURIComponent(name)}`),
      { method: 'PUT', body, ext: opts.ext, signal: opts.signal },
    );
  }

  /** `DELETE /v1/environments/{id}/secrets/{name}` */
  remove(
    envId: string,
    name: string,
    opts: CallOpts = {},
  ): Promise<Reply<'removeEnvironmentSecret'>> {
    return this.http.json<Reply<'removeEnvironmentSecret'>>(
      envPath(envId, `/secrets/${encodeURIComponent(name)}`),
      { method: 'DELETE', ext: opts.ext, signal: opts.signal },
    );
  }
}

export class Environments {
  readonly members: EnvironmentMembers;
  readonly ports: EnvironmentPorts;
  readonly secrets: EnvironmentSecrets;
  readonly tasks: EnvironmentTasks;

  constructor(private readonly http: HttpClient) {
    this.members = new EnvironmentMembers(http);
    this.ports = new EnvironmentPorts(http);
    this.secrets = new EnvironmentSecrets(http);
    this.tasks = new EnvironmentTasks(http);
  }

  /** `GET /v1/environments/{id}/ssh-ca` — CA public keys to trust (`@cert-authority` lines). */
  sshCa(envId: string, opts: CallOpts = {}): Promise<EnvironmentSshCa> {
    return this.http.json<EnvironmentSshCa>(envPath(envId, '/ssh-ca'), { ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/environments?project_id=&for_user_id=me` — newest first, every state. */
  async list(query: ListEnvironmentsQuery = {}, opts: CallOpts = {}): Promise<Environment[]> {
    const raw = await this.http.json<Reply<'listEnvironments'>>('/v1/environments', {
      query: { project_id: query.project_id, for_user_id: query.for_user_id },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.environments ?? [])];
  }

  /**
   * `POST /v1/environments` — `byo` starts `pending`; managed providers start
   * `creating`. 409 `already_has_env` in a `vm_per_dev` project (the error
   * body carries the `environment_id` to reuse).
   */
  async create(body: EnvironmentCreateBody, opts: CallOpts = {}): Promise<Environment> {
    const raw = await this.http.json<Reply<'createEnvironment', 201>>('/v1/environments', {
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    return raw.environment;
  }

  /**
   * `POST /v1/environments/enroll` — daemon side. The one-time `codai_env_…`
   * token in the body is the only credential; the client's API key header is
   * ignored by this route. Managed environments additionally receive a
   * freshly minted `api_key`, returned exactly once.
   */
  enroll(body: EnvironmentEnrollBody, opts: CallOpts = {}): Promise<EnvironmentEnrolled> {
    return this.http.json<EnvironmentEnrolled>('/v1/environments/enroll', {
      body,
      ext: opts.ext,
      signal: opts.signal,
      // The token is consumed on success; a retried POST would 401.
      noRetry: true,
    });
  }

  /** `GET /v1/environments/{id}` — environment, your role, members, ports, recent events. */
  get(envId: string, opts: CallOpts = {}): Promise<EnvironmentDetail> {
    return this.http.json<EnvironmentDetail>(envPath(envId), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/environments/{id}` — `name` and/or `idle_timeout_minutes` (5..1440). */
  async update(
    envId: string,
    body: EnvironmentPatchBody,
    opts: CallOpts = {},
  ): Promise<Environment> {
    const raw = await this.http.json<Reply<'updateEnvironment'>>(envPath(envId), {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
    return raw.environment;
  }

  /** `POST /v1/environments/{id}/start` — managed providers only (`stopped` → `starting`). */
  start(envId: string, opts: CallOpts = {}): Promise<EnvironmentTransition> {
    return this.transition(envId, 'start', opts);
  }

  /** `POST /v1/environments/{id}/stop` — managed providers only (`running` → `stopping`). */
  stop(envId: string, opts: CallOpts = {}): Promise<EnvironmentTransition> {
    return this.transition(envId, 'stop', opts);
  }

  /** `POST /v1/environments/{id}/archive` — keeps history, releases the machine. */
  archive(envId: string, opts: CallOpts = {}): Promise<EnvironmentTransition> {
    return this.transition(envId, 'archive', opts);
  }

  /** `POST /v1/environments/{id}/destroy` — owner only; terminal. */
  destroy(envId: string, opts: CallOpts = {}): Promise<EnvironmentTransition> {
    return this.transition(envId, 'destroy', opts);
  }

  /**
   * `POST /v1/environments/{id}/enroll-token` — `byo` only; a 30-minute
   * one-time token for `enroll()`. Minting again replaces the previous one.
   */
  enrollToken(envId: string, opts: CallOpts = {}): Promise<EnvironmentEnrollToken> {
    return this.http.json<EnvironmentEnrollToken>(envPath(envId, '/enroll-token'), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  private transition(
    envId: string,
    action: 'start' | 'stop' | 'archive' | 'destroy',
    opts: CallOpts,
  ): Promise<EnvironmentTransition> {
    return this.http.json<EnvironmentTransition>(envPath(envId, `/${action}`), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
