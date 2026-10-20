/**
 * `/v1/vault/*` — the zero-knowledge credentials vault (V-01..V-10). Everything the server stores is ciphertext built
 * client-side (bundles, envelopes, sealed keys): this resource only moves those blobs. The agent broker calls
 * (`catalog`, `use`, `http`, `resolve`) never return secret values. Device approval keys (V-27) hold public keys
 * only: `vault.devices` enrols, lists, renames and revokes them. Free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import {
  type Body,
  type Mutable,
  type QueryOf,
  type Reply,
  type Schema,
  stripUndefined,
} from './_shared';

export type VaultAccount = Schema<'VaultAccount'>;
export type VaultItemEnvelope = Mutable<Schema<'VaultItemEnvelope'>>;
export type VaultUseDecision = Schema<'VaultUseDecision'>;
export type VaultAccountPut = Mutable<Body<'putVaultAccount'>>;
export type VaultCreate = Mutable<Body<'createVault'>>;
export type VaultRuleCreate = Mutable<Body<'createVaultRule'>>;
export type VaultDecision = Mutable<Body<'decideVaultApproval'>>;
/** v2 proof for `decide`: an enrolled device key or a passkey assertion. */
export type VaultApprovalProof = Mutable<Schema<'VaultApprovalProof'>>;
export type VaultDeviceKey = Schema<'VaultDeviceKey'>;
export type VaultDeviceChallenge = Schema<'VaultDeviceChallenge'>;
export type VaultDeviceEnroll = Mutable<Schema<'VaultDeviceEnroll'>>;
export type VaultDeviceAttestation = VaultDeviceKey['attestation'];
export type VaultUseRequest = Mutable<Body<'vaultUse'>>;
export type VaultHttpRequest = Mutable<Body<'vaultHttp'>>;
export type VaultResolveRequest = Mutable<Body<'vaultResolve'>>;
export type VaultTier = VaultAccount['default_tier'];
/** Loose JSON object answers (lists, acks) as documented in the OpenAPI spec. */
export type VaultObject = Record<string, unknown>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const seg = (base: string, id: string, suffix = '') => `${base}/${encodeURIComponent(id)}${suffix}`;

/** `/v1/vault/devices/*` — hardware-backed device approval keys (public keys only; revocation is instant). */
export class VaultDevices {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/vault/devices/challenge` — single-use enrolment nonce, valid 5 minutes. */
  challenge(opts: CallOpts = {}): Promise<VaultDeviceChallenge> {
    return this.http.json<Reply<'createVaultDeviceChallenge'>>('/v1/vault/devices/challenge', {
      method: 'POST',
      body: {},
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/vault/devices` — enrol (or re-enrol) a device key; vault-signed, possession-proven, attested (201). */
  async enroll(body: VaultDeviceEnroll, opts: CallOpts = {}): Promise<VaultDeviceKey> {
    const r = await this.http.json<Reply<'enrollVaultDevice', 201>>('/v1/vault/devices', {
      method: 'POST',
      body: stripUndefined({ ...body }),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    return r.device;
  }

  /** `GET /v1/vault/devices` — your device keys, revoked ones included, newest first. */
  async list(opts: CallOpts = {}): Promise<VaultDeviceKey[]> {
    const r = await this.http.json<Reply<'listVaultDevices'>>('/v1/vault/devices', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.devices];
  }

  /** `PATCH /v1/vault/devices/{id}` — change the display name (1-80 characters). */
  async rename(id: string, name: string, opts: CallOpts = {}): Promise<VaultDeviceKey> {
    const r = await this.http.json<Reply<'renameVaultDevice'>>(seg('/v1/vault/devices', id), {
      method: 'PATCH',
      body: { name },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
    return r.device;
  }

  /** `DELETE /v1/vault/devices/{id}` — revoke at once; later proofs answer 403 `device_revoked`. */
  revoke(id: string, opts: CallOpts = {}): Promise<Reply<'revokeVaultDevice'>> {
    return this.http.json<Reply<'revokeVaultDevice'>>(seg('/v1/vault/devices', id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Vault {
  readonly devices: VaultDevices;

  constructor(private readonly http: HttpClient) {
    this.devices = new VaultDevices(http);
  }

  private get<T>(
    path: string,
    opts: CallOpts,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    return this.http.json<T>(path, { query, ext: opts.ext, signal: opts.signal });
  }

  private send<T>(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    opts: CallOpts,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.http.json<T>(path, {
      method,
      ...(body ? { body: stripUndefined(body) } : {}),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: method !== 'DELETE',
    });
  }

  /** `GET /v1/vault/account` — bundle, fingerprint, default tier, revision (404 `vault_not_setup` before setup). */
  account(opts: CallOpts = {}): Promise<VaultAccount> {
    return this.get<Reply<'getVaultAccount'>>('/v1/vault/account', opts);
  }

  /** `PUT /v1/vault/account` — upload the client-built bundle; updates send the current `revision` (409 otherwise). */
  putAccount(body: VaultAccountPut, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('PUT', '/v1/vault/account', opts, body);
  }

  /** `PATCH /v1/vault/settings` — default approval tier for items without a matching rule. */
  setDefaultTier(defaultTier: VaultTier, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('PATCH', '/v1/vault/settings', opts, { default_tier: defaultTier });
  }

  /** `GET /v1/vault/vaults` — vaults you belong to, with your role and sealed vault key. */
  vaults(opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/vaults', opts);
  }

  /** `POST /v1/vault/vaults` — register a vault created client-side (HTTP 201). */
  createVault(body: VaultCreate, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', '/v1/vault/vaults', opts, body);
  }

  /** `GET /v1/vault/items` — envelopes you can read; with `since` (ISO) only changes after it, tombstones included. */
  items(params: QueryOf<'listVaultItems'> = {}, opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/items', opts, { since: params.since });
  }

  /** `PUT /v1/vault/items/{id}` — store an envelope (new = revision 1, update = revision + 1, 409 otherwise). */
  putItem(id: string, envelope: VaultItemEnvelope, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('PUT', seg('/v1/vault/items', id), opts, envelope);
  }

  /** `DELETE /v1/vault/items/{id}` — tombstone; revokes every grant on the item and drops its cloud copy. */
  deleteItem(id: string, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('DELETE', seg('/v1/vault/items', id), opts);
  }

  /** `PUT /v1/vault/items/{id}/cloud` — owner only: the decrypted item to seal with KMS for cloud agents, or null. */
  setItemCloud(
    id: string,
    item: Record<string, unknown> | null,
    opts: CallOpts = {},
  ): Promise<VaultObject> {
    return this.http.json<VaultObject>(seg('/v1/vault/items', id, '/cloud'), {
      method: 'PUT',
      body: { item },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/vault/rules` — policy rules (item, agent glob, mode → tier). */
  rules(opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/rules', opts);
  }

  /** `POST /v1/vault/rules` — add a rule (HTTP 201). Host binding and honeytokens cannot be overridden. */
  createRule(body: VaultRuleCreate, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', '/v1/vault/rules', opts, body);
  }

  /** `DELETE /v1/vault/rules/{id}`. */
  deleteRule(id: string, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('DELETE', seg('/v1/vault/rules', id), opts);
  }

  /** `GET /v1/vault/grants` — standing grants created by your approvals. */
  grants(opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/grants', opts);
  }

  /** `DELETE /v1/vault/grants/{id}` — revoke a grant immediately. */
  revokeGrant(id: string, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('DELETE', seg('/v1/vault/grants', id), opts);
  }

  /** `GET /v1/vault/events` — append-only audit log (never contains secret values). */
  events(params: QueryOf<'listVaultEvents'> = {}, opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/events', opts, { limit: params.limit });
  }

  /** `GET /v1/vault/approvals` — agent requests waiting for your decision. */
  approvals(opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/approvals', opts);
  }

  /** `GET /v1/vault/approvals/{id}` — pending, approved, denied or expired. */
  approval(id: string, opts: CallOpts = {}): Promise<VaultObject> {
    return this.get(seg('/v1/vault/approvals', id), opts);
  }

  /**
   * `POST /v1/vault/approvals/{id}/decide` — send `signature` (v1 vault key) or `proof` (v2 device key / passkey),
   * never both. Deny needs no proof; a t4 approve needs a device or passkey proof (Wear: t3 only).
   */
  decide(id: string, body: VaultDecision, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', seg('/v1/vault/approvals', id, '/decide'), opts, body);
  }

  /** `GET /v1/vault/catalog` — items exposed to agents (handle, title, kind, hosts, env name); no values. */
  catalog(opts: CallOpts = {}): Promise<VaultObject> {
    return this.get('/v1/vault/catalog', opts);
  }

  /** `POST /v1/vault/use` — a policy decision for one use; t3/t4 return a pending approval id. */
  use(body: VaultUseRequest, opts: CallOpts = {}): Promise<VaultUseDecision> {
    return this.send<Reply<'vaultUse'>>('POST', '/v1/vault/use', opts, body);
  }

  /** `POST /v1/vault/http` — brokered HTTPS call with `{{vault:<slug>}}` handles; 202 = approval required. */
  httpCall(body: VaultHttpRequest, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', '/v1/vault/http', opts, body);
  }

  /** `POST /v1/vault/resolve` — codai local brokers only (cloud fallback of `codaid vault run`); 202 = approval. */
  resolve(body: VaultResolveRequest, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', '/v1/vault/resolve', opts, body);
  }
}
