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
/** Requires `proof`: a fresh {@link Vault.resolveChallenge} signed over {@link vaultResolveMessage} by an enrolled device key. */
export type VaultResolveRequest = Mutable<Body<'vaultResolve'>>;
export type VaultResolveProof = Mutable<Schema<'VaultResolveProof'>>;
export type VaultResolveChallenge = Schema<'VaultResolveChallenge'>;
export type VaultTier = VaultAccount['default_tier'];
/** Anomaly guards (V-32): new host, burst, allowed hours. An anomaly forces t4. */
export type VaultGuards = Schema<'VaultGuards'>;
export type VaultSettingsPatch = Mutable<Body<'patchVaultSettings'>>;
export type VaultSettings = Reply<'patchVaultSettings'>;
export type VaultLockResult = Schema<'VaultLockResult'>;
export type VaultUnlockChallenge = Schema<'VaultUnlockChallenge'>;
export type VaultUnlockRequest = Mutable<Body<'unlockVault'>>;
/** Per-handle limits (V-21); an `http` use costs 2 units, other modes 1. */
export type VaultItemLimits = Schema<'VaultItemLimits'>;
export type VaultItemLimitsInput = Mutable<Body<'setVaultItemLimits'>>;
/** Where a lock/unlock was triggered from. */
export type VaultVia = 'hub' | 'desktop' | 'phone' | 'wear' | 'extension';
/** V-17: an agent asks the user to add a missing secret (no secret ever passes through these calls). */
export type VaultAddRequestCreate = Mutable<Schema<'VaultAddRequestCreate'>>;
export type VaultAddRequestCreated = Schema<'VaultAddRequestCreated'>;
export type VaultAddRequestStatus = Schema<'VaultAddRequestStatus'>;
export type VaultAddRequest = Schema<'VaultAddRequest'>;
/** V-23 emergency access: contacts, sealed vault keys, wait-then-release. */
export type VaultEmergencyContact = Schema<'VaultEmergencyContact'>;
export type VaultEmergencyList = Reply<'listVaultEmergency'>;
export type VaultEmergencyInvite = Mutable<Body<'inviteVaultEmergency'>>;
export type VaultEmergencySeal = Mutable<Body<'sealVaultEmergency'>>;
export type VaultEmergencyUpdate = Mutable<Body<'updateVaultEmergency'>>;
export type VaultEmergencyData = Schema<'VaultEmergencyData'>;
/** V-15 rotation queue entry (breach state is client-reported via HIBP k-anonymity). */
export type VaultRotationEntry = Schema<'VaultRotationEntry'>;
export type VaultRotationPatch = Mutable<Body<'setVaultItemRotation'>>;
export type VaultRotationSetting = Reply<'setVaultItemRotation'>;
export type VaultBreachResult = Mutable<Body<'reportVaultBreaches'>>['results'][number];
/** V-20 JIT derivers: short-lived credentials minted from a cloud-usable root item. */
export type VaultDeriver = Schema<'VaultDeriver'>;
export type VaultDeriverInput = Mutable<Body<'setVaultItemDeriver'>>;
/** Requires `proof` over `handles = [handle]` (same as {@link VaultResolveRequest}). */
export type VaultDeriveRequest = Mutable<Body<'deriveVaultCredential'>>;
export type VaultDerived = Schema<'VaultDerived'>;
/** 202 from `derive`: approval needed first. */
export type VaultDeriveApproval = Reply<'deriveVaultCredential', 202>;
/** V-33 org vaults: summary row of `GET /v1/vault/vaults` (org id, role, quorum, rotation flag, key epoch). */
export type VaultSummary = Schema<'VaultSummary'>;
export type VaultQuorum = Schema<'VaultQuorum'>;
export type VaultSealedKey = Mutable<Schema<'VaultSealedKey'>>;
export type VaultMember = Schema<'VaultMember'>;
export type VaultMemberCandidate = Schema<'VaultMemberCandidate'>;
export type VaultMemberAdd = Mutable<Body<'addVaultMember'>>;
export type VaultMemberRole = VaultMemberAdd['role'];
/** Client-side key rotation: every member re-sealed, every item re-wrapped, `key_epoch` = current + 1. */
export type VaultRotateRequest = Mutable<Body<'rotateVaultKey'>>;
/** Quorum vote: approve/v4 proof by the approver's own device key or passkey. */
export type VaultVoteProof = Mutable<Schema<'VaultVoteProof'>>;
export type VaultVoteResult = Reply<'voteVaultApproval'>;
export type VaultApprovalQuorum = Schema<'VaultApprovalQuorum'>;
/** V-16 policy simulator: draft rules replayed over past uses (read-only). */
export type VaultSimulateRequest = Mutable<Body<'simulateVaultPolicy'>>;
export type VaultSimulation = Schema<'VaultSimulation'>;
export type VaultSimulationRow = Schema<'VaultSimulationRow'>;
/** V-36 receipt signing key (ES256, SPKI PEM). */
export type VaultReceiptKey = Schema<'VaultReceiptKey'>;

/** The UTF-8 message an unlock proof covers: `codai-vault/unlock/v1|<challenge>|<device_id or "passkey">`. */
export function vaultUnlockMessage(challenge: string, deviceIdOrPasskey: string): string {
  return `codai-vault/unlock/v1|${challenge}|${deviceIdOrPasskey}`;
}
/**
 * The UTF-8 message a resolve proof covers: `codai-vault/resolve/v1|<challenge>|<device_id>|<digest>`, where `digest` =
 * base64url_nopad(SHA-256(handles.join("\n") + "\n\n" + action)) with handles and action exactly as sent.
 * Compute `digest` with your platform's SHA-256 (the SDK stays crypto-free).
 */
export function vaultResolveMessage(challenge: string, deviceId: string, digest: string): string {
  return `codai-vault/resolve/v1|${challenge}|${deviceId}|${digest}`;
}
/** The exact UTF-8 text whose SHA-256 (base64url, no padding) is the resolve proof `digest`. */
export function vaultResolveDigestInput(handles: readonly string[], action: string): string {
  return `${handles.join('\n')}\n\n${action}`;
}
/**
 * The UTF-8 message a quorum vote proof covers (approve/v4, V-33):
 * `codai-vault/approve/v4|<approval_id>|<action_hash>|<decision>|once|<approver_user_id>|<device_id>|<preview_digest>`.
 * `deviceIdOrPasskey` is the approver's enrolled device id or `passkey`.
 */
export function vaultApproveMessageV4(p: {
  approvalId: string;
  actionHash: string;
  decision: 'approve' | 'deny';
  approverUserId: string;
  deviceIdOrPasskey: string;
  previewDigest: string;
}): string {
  return `codai-vault/approve/v4|${p.approvalId}|${p.actionHash}|${p.decision}|once|${p.approverUserId}|${p.deviceIdOrPasskey}|${p.previewDigest}`;
}
/** Loose JSON object answers (lists, acks) as documented in the OpenAPI spec. */
export type VaultObject = Record<string, unknown>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const seg = (base: string, id: string, suffix = '') => `${base}/${encodeURIComponent(id)}${suffix}`;

/** `/v1/vault/vaults/{id}/members/*` — org vault members (V-33). Keys are sealed client-side; never sent in clear. */
export class VaultMembers {
  constructor(private readonly http: HttpClient) {}

  private path(vaultId: string, userId?: string): string {
    const base = seg('/v1/vault/vaults', vaultId, '/members');
    return userId === undefined ? base : `${base}/${encodeURIComponent(userId)}`;
  }

  /** `GET /v1/vault/vaults/{id}/members` — members, roles, confirmed fingerprints, key epochs. */
  async list(vaultId: string, opts: CallOpts = {}): Promise<VaultMember[]> {
    const r = await this.http.json<Reply<'listVaultMembers'>>(this.path(vaultId), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.members];
  }

  /** `GET /v1/vault/vaults/{id}/candidates` — owner/manager: org members with a vault account not yet in the vault. */
  async candidates(vaultId: string, opts: CallOpts = {}): Promise<VaultMemberCandidate[]> {
    const r = await this.http.json<Reply<'listVaultMemberCandidates'>>(
      seg('/v1/vault/vaults', vaultId, '/candidates'),
      { ext: opts.ext, signal: opts.signal },
    );
    return [...r.candidates];
  }

  /**
   * `PUT /v1/vault/vaults/{id}/members/{userId}` — seal the vault key to a member after their fingerprint was shown
   * and confirmed. 409 `fingerprint_changed` when the member's keys changed since.
   */
  add(
    vaultId: string,
    userId: string,
    body: VaultMemberAdd,
    opts: CallOpts = {},
  ): Promise<Reply<'addVaultMember'>> {
    return this.http.json<Reply<'addVaultMember'>>(this.path(vaultId, userId), {
      method: 'PUT',
      body: { role: body.role, sealed_key: body.sealed_key, fingerprint: body.fingerprint },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `PATCH /v1/vault/vaults/{id}/members/{userId}` — change the role (`manager`, `editor`, `viewer`). */
  update(
    vaultId: string,
    userId: string,
    role: VaultMemberRole,
    opts: CallOpts = {},
  ): Promise<Reply<'updateVaultMember'>> {
    return this.http.json<Reply<'updateVaultMember'>>(this.path(vaultId, userId), {
      method: 'PATCH',
      body: { role },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `DELETE /v1/vault/vaults/{id}/members/{userId}` — remove (or leave); marks the vault for key rotation. */
  remove(
    vaultId: string,
    userId: string,
    opts: CallOpts = {},
  ): Promise<Reply<'removeVaultMember'>> {
    return this.http.json<Reply<'removeVaultMember'>>(this.path(vaultId, userId), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

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

/** `/v1/vault/add-requests/*` — an agent asks the user to add a missing secret (V-17). */
export class VaultAddRequests {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/vault/add-requests` — answers a hub `url` to show the user (null when a pending request was reused). */
  create(body: VaultAddRequestCreate, opts: CallOpts = {}): Promise<VaultAddRequestCreated> {
    return this.http.json<Reply<'createVaultAddRequest', 201>>('/v1/vault/add-requests', {
      method: 'POST',
      body: stripUndefined({ ...body }),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/vault/add-requests/{id}` — poll; once `completed`, `handle` is the new `{{vault:<slug>}}`. */
  get(id: string, opts: CallOpts = {}): Promise<VaultAddRequestStatus> {
    return this.http.json<Reply<'getVaultAddRequest'>>(seg('/v1/vault/add-requests', id), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/vault/add-requests/{id}` — cancel a pending request. */
  cancel(id: string, opts: CallOpts = {}): Promise<VaultAddRequestStatus> {
    return this.http.json<Reply<'cancelVaultAddRequest'>>(seg('/v1/vault/add-requests', id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/vault/add-requests/lookup` — full request by link token, signed-in owner only (404 otherwise). */
  lookup(token: string, opts: CallOpts = {}): Promise<VaultAddRequest> {
    return this.http.json<Reply<'lookupVaultAddRequest'>>('/v1/vault/add-requests/lookup', {
      method: 'POST',
      body: { token },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/vault/add-requests/{id}/complete` — link the item you added; idempotent for the same item. */
  complete(id: string, itemId: string, opts: CallOpts = {}): Promise<VaultAddRequestStatus> {
    return this.http.json<Reply<'completeVaultAddRequest'>>(
      seg('/v1/vault/add-requests', id, '/complete'),
      {
        method: 'POST',
        body: { item_id: itemId },
        ext: opts.ext,
        signal: opts.signal,
        noRetry: true,
      },
    );
  }
}

/** `/v1/vault/emergency/*` — emergency access (V-23): invite, seal vault keys, request, wait, release. */
export class VaultEmergency {
  constructor(private readonly http: HttpClient) {}

  private post<T>(path: string, opts: CallOpts, body?: Record<string, unknown>): Promise<T> {
    return this.http.json<T>(path, {
      method: 'POST',
      ...(body ? { body: stripUndefined(body) } : {}),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `GET /v1/vault/emergency` — `{ outgoing, incoming }` (revoked omitted). */
  list(opts: CallOpts = {}): Promise<VaultEmergencyList> {
    return this.http.json<VaultEmergencyList>('/v1/vault/emergency', {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/vault/emergency` — always 202 `{ id }` (enumeration-safe). */
  invite(
    body: VaultEmergencyInvite,
    opts: CallOpts = {},
  ): Promise<Reply<'inviteVaultEmergency', 202>> {
    return this.post('/v1/vault/emergency', opts, { ...body });
  }

  /** `POST /v1/vault/emergency/accept` — the contact accepts with the emailed token (needs a vault account). */
  accept(token: string, opts: CallOpts = {}): Promise<VaultEmergencyContact> {
    return this.post('/v1/vault/emergency/accept', opts, { token });
  }

  /** `PUT /v1/vault/emergency/{id}/seal` — grantor uploads vault keys sealed client-side to the contact. */
  seal(id: string, body: VaultEmergencySeal, opts: CallOpts = {}): Promise<VaultEmergencyContact> {
    return this.http.json<VaultEmergencyContact>(seg('/v1/vault/emergency', id, '/seal'), {
      method: 'PUT',
      body: { ...body },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `PATCH /v1/vault/emergency/{id}` — change `delay_hours` and/or `vault_ids` (vaults change → re-seal). */
  update(
    id: string,
    body: VaultEmergencyUpdate,
    opts: CallOpts = {},
  ): Promise<VaultEmergencyContact> {
    if (body.delay_hours === undefined && body.vault_ids === undefined)
      return Promise.reject(new TypeError('update needs delay_hours and/or vault_ids'));
    return this.http.json<VaultEmergencyContact>(seg('/v1/vault/emergency', id), {
      method: 'PATCH',
      body: stripUndefined({ ...body }),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `DELETE /v1/vault/emergency/{id}` — grantor revokes or the contact declines. */
  revoke(id: string, opts: CallOpts = {}): Promise<Reply<'revokeVaultEmergency'>> {
    return this.http.json<Reply<'revokeVaultEmergency'>>(seg('/v1/vault/emergency', id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/vault/emergency/{id}/request` — contact starts the wait; released at `release_at` unless denied. */
  request(
    id: string,
    params: { reason?: string } = {},
    opts: CallOpts = {},
  ): Promise<VaultEmergencyContact> {
    return this.post(seg('/v1/vault/emergency', id, '/request'), opts, { reason: params.reason });
  }

  /** `POST /v1/vault/emergency/{id}/deny` — grantor denies a pending request (back to `sealed`). */
  deny(id: string, opts: CallOpts = {}): Promise<VaultEmergencyContact> {
    return this.post(seg('/v1/vault/emergency', id, '/deny'), opts, {});
  }

  /** `POST /v1/vault/emergency/{id}/approve` — grantor grants a pending request now. */
  approve(id: string, opts: CallOpts = {}): Promise<VaultEmergencyContact> {
    return this.post(seg('/v1/vault/emergency', id, '/approve'), opts, {});
  }

  /** `GET /v1/vault/emergency/{id}/vault-data` — contact, status `granted`: sealed vault keys + item envelopes. */
  vaultData(id: string, opts: CallOpts = {}): Promise<VaultEmergencyData> {
    return this.http.json<VaultEmergencyData>(seg('/v1/vault/emergency', id, '/vault-data'), {
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Vault {
  readonly devices: VaultDevices;
  readonly addRequests: VaultAddRequests;
  readonly emergency: VaultEmergency;
  readonly members: VaultMembers;

  constructor(private readonly http: HttpClient) {
    this.devices = new VaultDevices(http);
    this.addRequests = new VaultAddRequests(http);
    this.emergency = new VaultEmergency(http);
    this.members = new VaultMembers(http);
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

  /**
   * `PATCH /v1/vault/settings` — `default_tier`, partial anomaly `guards` (merged over the current ones) and/or
   * `digest_opt_out` (weekly digest email). Answers the effective settings.
   */
  updateSettings(body: VaultSettingsPatch, opts: CallOpts = {}): Promise<VaultSettings> {
    if (
      body.default_tier === undefined &&
      body.guards === undefined &&
      body.digest_opt_out === undefined
    )
      return Promise.reject(
        new TypeError('updateSettings needs default_tier, guards and/or digest_opt_out'),
      );
    return this.send<VaultSettings>('PATCH', '/v1/vault/settings', opts, { ...body });
  }

  /**
   * `POST /v1/vault/lock` — panic: revoke every live grant, deny every pending approval, lock the vault (agent uses
   * then answer `vault_locked`). Device keys stay enrolled. Idempotent.
   */
  lock(params: { via?: VaultVia } = {}, opts: CallOpts = {}): Promise<VaultLockResult> {
    return this.send<VaultLockResult>('POST', '/v1/vault/lock', opts, { via: params.via });
  }

  /** `POST /v1/vault/unlock/challenge` — single-use unlock challenge, valid 5 minutes. */
  unlockChallenge(opts: CallOpts = {}): Promise<VaultUnlockChallenge> {
    return this.send<VaultUnlockChallenge>('POST', '/v1/vault/unlock/challenge', opts, {});
  }

  /**
   * `POST /v1/vault/unlock` — end a lock with a device-key proof over {@link vaultUnlockMessage} or a passkey whose
   * challenge is base64url(SHA-256(that message with `passkey`)). 403 `challenge_invalid`, `wear_t3_only`, …
   */
  unlock(body: VaultUnlockRequest, opts: CallOpts = {}): Promise<Reply<'unlockVault'>> {
    return this.send<Reply<'unlockVault'>>('POST', '/v1/vault/unlock', opts, { ...body });
  }

  /** `GET /v1/vault/limits` — per-handle usage caps on your items. */
  async limits(opts: CallOpts = {}): Promise<VaultItemLimits[]> {
    const r = await this.get<Reply<'listVaultLimits'>>('/v1/vault/limits', opts);
    return [...r.limits];
  }

  /**
   * `PUT /v1/vault/items/{id}/limits` — all three keys required; `null` removes a cap, all `null` removes the limits
   * (answers `null`). Over a cap the broker calls answer 429 `vault_rate_limited` with `Retry-After`.
   */
  async setLimits(
    id: string,
    limits: VaultItemLimitsInput,
    opts: CallOpts = {},
  ): Promise<VaultItemLimits | null> {
    const r = await this.http.json<Reply<'setVaultItemLimits'>>(
      seg('/v1/vault/items', id, '/limits'),
      {
        method: 'PUT',
        body: {
          per_minute: limits.per_minute,
          per_day: limits.per_day,
          units_per_day: limits.units_per_day,
        },
        ext: opts.ext,
        signal: opts.signal,
        noRetry: true,
      },
    );
    return r.limits ?? null;
  }

  /**
   * `GET /v1/vault/vaults` — vaults you belong to, with your role and sealed vault key; org vaults add `org_id`,
   * `quorum`, `rotation_needed_at` and `key_epoch`.
   */
  vaults(opts: CallOpts = {}): Promise<Reply<'listVaults'>> {
    return this.get<Reply<'listVaults'>>('/v1/vault/vaults', opts);
  }

  /** `POST /v1/vault/vaults` — register a vault created client-side (HTTP 201); `org_id` makes it an org vault. */
  createVault(body: VaultCreate, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', '/v1/vault/vaults', opts, body);
  }

  /**
   * `POST /v1/vault/vaults/{id}/rotate` — owner/manager: replace the vault key in one transaction. Must cover every
   * member and every live item (409 `rotation_incomplete` with the missing ids). Clears `rotation_needed_at`.
   */
  rotateKey(
    vaultId: string,
    body: VaultRotateRequest,
    opts: CallOpts = {},
  ): Promise<Reply<'rotateVaultKey'>> {
    return this.send('POST', seg('/v1/vault/vaults', vaultId, '/rotate'), opts, { ...body });
  }

  /** `PUT /v1/vault/vaults/{id}/quorum` — owner: `{ m: 2..9, scope }` or `null` to turn quorum off. */
  setQuorum(
    vaultId: string,
    quorum: VaultQuorum | null,
    opts: CallOpts = {},
  ): Promise<Reply<'setVaultQuorum'>> {
    return this.http.json<Reply<'setVaultQuorum'>>(seg('/v1/vault/vaults', vaultId, '/quorum'), {
      method: 'PUT',
      body: quorum === null ? { m: null } : { m: quorum.m, scope: quorum.scope },
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
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

  /** `POST /v1/vault/grants/revoke-task` — revoke every live grant of a task / session; answers `{ revoked }`. */
  revokeTaskGrants(task: string, opts: CallOpts = {}): Promise<Reply<'revokeVaultTaskGrants'>> {
    return this.send<Reply<'revokeVaultTaskGrants'>>('POST', '/v1/vault/grants/revoke-task', opts, {
      task,
    });
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

  /**
   * `POST /v1/vault/approvals/{id}/vote` — quorum approvals (V-33): your vote with an approve/v4 proof
   * ({@link vaultApproveMessageV4}). A deny ends the request; the M-th approve grants one use. 409 `already_voted`,
   * `not_pending`. `decide` on a quorum approval answers 409 `quorum_required`.
   */
  vote(
    id: string,
    body: { decision: 'approve' | 'deny'; proof: VaultVoteProof },
    opts: CallOpts = {},
  ): Promise<VaultVoteResult> {
    return this.send<VaultVoteResult>('POST', seg('/v1/vault/approvals', id, '/vote'), opts, {
      decision: body.decision,
      proof: body.proof,
    });
  }

  /**
   * `POST /v1/vault/policy/simulate` — replay past uses under draft `rules` / `default_tier` (read-only). Grants
   * and anomaly guards are not replayed (`grants: "none"`).
   */
  simulatePolicy(body: VaultSimulateRequest = {}, opts: CallOpts = {}): Promise<VaultSimulation> {
    return this.send<VaultSimulation>('POST', '/v1/vault/policy/simulate', opts, { ...body });
  }

  /** `GET /v1/vault/receipts/keys` — ES256 public keys (SPKI PEM) that sign vault receipts (DSSE). */
  async receiptKeys(opts: CallOpts = {}): Promise<VaultReceiptKey[]> {
    const r = await this.get<Reply<'listVaultReceiptKeys'>>('/v1/vault/receipts/keys', opts);
    return [...r.keys];
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

  /** `POST /v1/vault/resolve/challenge` — codai local brokers only; single-use resolve challenge, valid 120 s. */
  resolveChallenge(opts: CallOpts = {}): Promise<VaultResolveChallenge> {
    return this.send<VaultResolveChallenge>('POST', '/v1/vault/resolve/challenge', opts, {});
  }

  /**
   * `POST /v1/vault/resolve` — codai local brokers only (cloud fallback of `codaid vault run`); 202 = approval.
   * `body.proof` is required: 400 `proof_required` / `invalid_challenge`, 403 `invalid_device_proof`.
   */
  resolve(body: VaultResolveRequest, opts: CallOpts = {}): Promise<VaultObject> {
    return this.send('POST', '/v1/vault/resolve', opts, body);
  }

  /**
   * `GET /v1/vault/hibp/range/{prefix}` — padded HIBP range (`SUFFIX:COUNT` lines, text) for the first 5 hex chars of
   * a SHA-1; compare locally, the password never leaves the client. 300 calls per user per hour.
   */
  async hibpRange(prefix: string, opts: CallOpts = {}): Promise<string> {
    if (!/^[0-9A-Fa-f]{5}$/.test(prefix))
      throw new TypeError('hibpRange prefix must be 5 hex characters');
    const res = await this.http.request(`/v1/vault/hibp/range/${prefix.toUpperCase()}`, {
      ext: opts.ext,
      signal: opts.signal,
      headers: { accept: 'text/plain' },
    });
    return res.text();
  }

  /** `GET /v1/vault/rotation` — rotation queue: breached, overdue, soonest due; unscheduled last. */
  async rotation(opts: CallOpts = {}): Promise<VaultRotationEntry[]> {
    const r = await this.get<Reply<'listVaultRotation'>>('/v1/vault/rotation', opts);
    return [...r.items];
  }

  /** `PUT /v1/vault/items/{id}/rotation` — any of `interval_days`, `provider`, `snoozed_until`; `null` clears one. */
  setRotation(
    id: string,
    patch: VaultRotationPatch,
    opts: CallOpts = {},
  ): Promise<VaultRotationSetting> {
    const body = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(body).length === 0)
      return Promise.reject(
        new TypeError('setRotation needs interval_days, provider and/or snoozed_until'),
      );
    return this.http.json<VaultRotationSetting>(seg('/v1/vault/items', id, '/rotation'), {
      method: 'PUT',
      body,
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** `POST /v1/vault/items/{id}/rotated` — `rotated_at` = now, breach flag cleared. */
  markRotated(id: string, opts: CallOpts = {}): Promise<Reply<'markVaultItemRotated'>> {
    return this.send('POST', seg('/v1/vault/items', id, '/rotated'), opts, {});
  }

  /** `POST /v1/vault/rotation/breach-report` — local HIBP results (`count` 0 = clean), up to 500 per call. */
  reportBreaches(
    results: VaultBreachResult[],
    opts: CallOpts = {},
  ): Promise<Reply<'reportVaultBreaches'>> {
    return this.send('POST', '/v1/vault/rotation/breach-report', opts, { results });
  }

  /** `GET /v1/vault/derivers` — derivers on items in your vaults (config only, never values). */
  async derivers(opts: CallOpts = {}): Promise<VaultDeriver[]> {
    const r = await this.get<Reply<'listVaultDerivers'>>('/v1/vault/derivers', opts);
    return [...r.derivers];
  }

  /** `PUT /v1/vault/items/{id}/deriver` — owner only; config validated per provider. */
  async setDeriver(
    id: string,
    body: VaultDeriverInput,
    opts: CallOpts = {},
  ): Promise<VaultDeriver> {
    const r = await this.send<Reply<'setVaultItemDeriver'>>(
      'PUT',
      seg('/v1/vault/items', id, '/deriver'),
      opts,
      { ...body },
    );
    return r.deriver;
  }

  /** `DELETE /v1/vault/items/{id}/deriver` — owner only; 404 when there is none. */
  deleteDeriver(id: string, opts: CallOpts = {}): Promise<Reply<'deleteVaultItemDeriver'>> {
    return this.send('DELETE', seg('/v1/vault/items', id, '/deriver'), opts);
  }

  /**
   * `POST /v1/vault/derive` — codai local brokers only: a short-lived credential from a root item's deriver. Same
   * `proof` as {@link resolve} over `handles = [handle]`. A 202 (approval required) is returned, not thrown.
   */
  derive(
    body: VaultDeriveRequest,
    opts: CallOpts = {},
  ): Promise<VaultDerived | VaultDeriveApproval> {
    return this.send('POST', '/v1/vault/derive', opts, body);
  }
}
