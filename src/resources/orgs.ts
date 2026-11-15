/** `/v1/orgs/*` — the orgs (teams) you belong to and their members. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type Org = Schema<'OrgWithRole'>;
export type OrgMember = Schema<'OrgMember'>;
export type OrgRole = Schema<'OrgRole'>;
export type OrgAddMemberBody = Mutable<Body<'addOrgMember'>>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class OrgMembers {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/orgs/{id}/members` */
  async list(orgId: string, opts: CallOpts = {}): Promise<OrgMember[]> {
    const raw = await this.http.json<Reply<'listOrgMembers'>>(
      `/v1/orgs/${encodeURIComponent(orgId)}/members`,
      { ext: opts.ext, signal: opts.signal },
    );
    return [...(raw.members ?? [])];
  }

  /** `POST /v1/orgs/{id}/members` — add or re-role (owner/admin). */
  add(
    orgId: string,
    body: OrgAddMemberBody,
    opts: CallOpts = {},
  ): Promise<Reply<'addOrgMember', 201>> {
    return this.http.json<Reply<'addOrgMember', 201>>(
      `/v1/orgs/${encodeURIComponent(orgId)}/members`,
      { body, ext: opts.ext, signal: opts.signal },
    );
  }

  /** `DELETE /v1/orgs/{id}/members/{userId}` */
  remove(orgId: string, userId: string, opts: CallOpts = {}): Promise<Reply<'removeOrgMember'>> {
    return this.http.json<Reply<'removeOrgMember'>>(
      `/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE', ext: opts.ext, signal: opts.signal },
    );
  }
}

export class Orgs {
  readonly members: OrgMembers;
  constructor(private readonly http: HttpClient) {
    this.members = new OrgMembers(http);
  }

  /** `POST /v1/orgs` */
  create(name: string, opts: CallOpts = {}): Promise<Org> {
    return this.http.json<Org>('/v1/orgs', { body: { name }, ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/orgs` */
  async list(opts: CallOpts = {}): Promise<Org[]> {
    const raw = await this.http.json<Reply<'listOrgs'>>('/v1/orgs', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.orgs ?? [])];
  }
}
