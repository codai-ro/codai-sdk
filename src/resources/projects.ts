/** `/v1/projects/*` — projects (a repo + isolation policy) that group environments. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type Project = Schema<'Project'>;
export type ProjectIsolation = Schema<'ProjectIsolation'>;
export type ProjectCreateBody = Mutable<Body<'createProject'>>;
export type ProjectPatchBody = Mutable<Body<'updateProject'>>;
export type ProjectDetail = Reply<'getProject'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Projects {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/projects` — projects you own plus those of your orgs, newest first. */
  async list(opts: CallOpts = {}): Promise<Project[]> {
    const raw = await this.http.json<Reply<'listProjects'>>('/v1/projects', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.projects ?? [])];
  }

  /** `POST /v1/projects` — 409 `slug_taken` when the slug is already yours. */
  async create(body: ProjectCreateBody, opts: CallOpts = {}): Promise<Project> {
    const raw = await this.http.json<Reply<'createProject', 201>>('/v1/projects', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
    return raw.project;
  }

  /** `GET /v1/projects/{id}` — the project plus every environment in it. */
  get(projectId: string, opts: CallOpts = {}): Promise<ProjectDetail> {
    return this.http.json<ProjectDetail>(`/v1/projects/${encodeURIComponent(projectId)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `PATCH /v1/projects/{id}` — owner or org owner/admin; the slug cannot change. */
  async update(projectId: string, body: ProjectPatchBody, opts: CallOpts = {}): Promise<Project> {
    const raw = await this.http.json<Reply<'updateProject'>>(
      `/v1/projects/${encodeURIComponent(projectId)}`,
      { method: 'PATCH', body, ext: opts.ext, signal: opts.signal },
    );
    return raw.project;
  }

  /** `DELETE /v1/projects/{id}` — 409 `project_has_environments` until all are destroyed. */
  delete(projectId: string, opts: CallOpts = {}): Promise<Reply<'deleteProject'>> {
    return this.http.json<Reply<'deleteProject'>>(`/v1/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
