/**
 * `CodaiApps` — management client for host apps (studiai.ro, …) that resell
 * codai to their own end users. It talks to the mgmt API (`api.codai.ro`),
 * not the gateway, and authenticates with an app connection token
 * (`codai_app_…`, created at codai.ro/console/apps/<app>), never a user key.
 *
 *   keys.mint / list / update / revoke / usage   → `/apps/keys*`
 *   users.getOverride / setOverride / clearOverride → `/apps/users/:externalId/overrides`
 *   subscriptions.sync                            → `/apps/subscriptions/sync`
 *   validateKey                                   → `/internal/keys/validate` (separate shared secret)
 *
 * Every call unwraps the `{ ok, data }` envelope and throws `CodaiError` on
 * a non-2xx reply (`error.code` such as `missing_scope:keys.mint`,
 * `no_key_for_external_id`, `not_owned_by_app`).
 */

import { CodaiError, HttpClient, type RequestOptions } from '../http';

export interface CodaiAppsOptions {
  /** App connection token (`codai_app_…`). Required for everything except `validateKey`. */
  appToken?: string;
  /** Shared secret for `POST /internal/keys/validate` (CODAI_VALIDATE_SHARED_SECRET on codai's side). */
  validateToken?: string;
  /** Defaults to https://api.codai.ro */
  baseUrl?: string;
  /** Default request timeout (ms). Default 20_000. */
  timeoutMs?: number;
  /** Retries on 429/5xx for idempotent calls. Default 1. `keys.mint` is never retried. */
  maxRetries?: number;
  fetch?: typeof fetch;
}

export interface AppKeyMintInput {
  /** End user email; codai upserts its user by email so subscription syncs land on the same user. */
  email: string;
  /** The app's own stable id for the end user (≤ 200 chars). */
  endUserExternalId: string;
  label?: string;
  /** Tier slug within the app (defaults to the app's `default_tier_slug`). */
  tierSlug?: string;
  /** Attach to an existing subscription of this app + user. */
  subscriptionId?: string;
  /** Accepted for back-compat and ignored (euro caps were removed product-wide). */
  budgetEurPerDay?: number;
  /** Intersected with the app's own allowlist. */
  allowedModels?: string[];
  ratePerMinute?: number;
  ratePerHour?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  /** ISO 8601 with offset, in the future. Omit = never expires. */
  expiresAt?: string;
}

export interface AppKeyMinted {
  id: string;
  /** Plaintext key — returned exactly once. */
  key: string;
  prefix: string;
  subscriptionId: string | null;
  expiresAt: string | null;
}

export interface AppKeyListQuery {
  endUserExternalId?: string;
  /** 1..200, default 50. */
  limit?: number;
  offset?: number;
}

export interface AppKey {
  id: string;
  label: string;
  prefix: string;
  enabled: boolean;
  subscriptionId: string | null;
  endUserExternalId: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  expiresAt?: string | null;
}

export interface AppKeyUpdate {
  label?: string;
  enabled?: boolean;
}

export interface AppKeyUsageWindow {
  requests: number;
  tasks: number;
  costUsd: number;
}

export interface AppKeyUsage {
  key: { id: string; prefix: string; label: string; createdAt: string };
  usage: {
    total: AppKeyUsageWindow & {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    today: AppKeyUsageWindow;
    month: AppKeyUsageWindow;
    tokensPerMinute?: {
      inputUsed: number;
      outputUsed: number;
      lastActiveInput?: number;
      lastActiveOutput?: number;
      lastActiveAt?: string | null;
      inputPeak?: number;
      inputPeakAt?: string | null;
      inputLimit: number;
      isDefaultLimit: boolean;
    };
    daily: Array<
      AppKeyUsageWindow & { date: string; promptTokens: number; completionTokens: number }
    >;
  };
  limits: {
    tierSlug: string | null;
    tierLabel: string | null;
    tasksPerDay: number | null;
    tasksPerMonth: number | null;
    ratePerMinute: number | null;
    ratePerHour: number | null;
    inputTokensPerMinute?: number | null;
    budgetEurPerDay: number | null;
    budgetEurPerMonth?: number | null;
    hasActiveSubscription: boolean;
  };
}

/** Per-(app, end user) override fields; `null` clears a field back to the tier value. */
export interface AppOverrideInput {
  forceTierSlug?: string | null;
  allowedModels?: string[] | null;
  ratePerMinute?: number | null;
  ratePerHour?: number | null;
  budgetEurPerDay?: number | null;
  budgetEurPerMonth?: number | null;
  tasksPerDay?: number | null;
  tasksPerMonth?: number | null;
  /** ISO 8601; null = never expires. */
  expiresAt?: string | null;
  note?: string | null;
  /** Restart task counting from now (usage history is kept). */
  resetUsage?: boolean | null;
}

export interface AppOverrideRow {
  id: string;
  forceTierSlug: string | null;
  allowedModels: string[] | null;
  ratePerMinute: number | null;
  ratePerHour: number | null;
  budgetEurPerDay: string | number | null;
  budgetEurPerMonth?: string | number | null;
  tasksPerDay: number | null;
  tasksPerMonth: number | null;
  expiresAt: string | null;
  note: string | null;
}

/** Effective limits after merging the override on top of the subscription tier. */
export interface AppEffectiveLimits {
  tierSlug: string | null;
  tierLabel: string | null;
  allowedModels: string[] | null;
  ratePerMinute: number | null;
  ratePerDay?: number | null;
  budgetEurPerDay: number | null;
  budgetEurPerMonth?: number | null;
  tasksPerDay: number | null;
  tasksPerMonth: number | null;
  maxRoutingTier?: 'small' | 'medium' | 'large' | null;
  hasActiveSubscription: boolean;
  [extra: string]: unknown;
}

export interface AppOverride {
  override: AppOverrideRow | null;
  effectiveLimits: AppEffectiveLimits;
  /** Present on reads: whether overrides are enabled for the app at all. */
  allowOverride?: boolean;
}

export interface AppSubscriptionSyncInput {
  /** Email of the subscribing end user. */
  email: string;
  /** The Stripe event verbatim; codai re-shapes it server-side. */
  event: { id: string; type: string; data?: { object?: unknown } };
}

export interface AppKeyValidation {
  ok: boolean;
  valid: boolean;
  key?: {
    id: string;
    prefix: string;
    label: string;
    appId: string;
    subscriptionId: string | null;
    endUserExternalId: string | null;
  };
  user?: { id: string };
  entitlements?: {
    tierSlug: string | null;
    hasActiveSubscription: boolean;
    allowedModels: string[] | null;
    ratePerMinute: number | null;
    ratePerHour: number | null;
    maxInputTokens: number | null;
    maxOutputTokens: number | null;
    budgetEurPerDay: number | null;
    supportsSubagents: boolean;
    supportsByok: boolean;
  };
  /** Set when `valid` is false (`key_not_found_or_disabled`). */
  reason?: string;
}

type CallOpts = { signal?: AbortSignal };
type Envelope<T> = { ok: boolean; data?: T; error?: unknown };

const enc = encodeURIComponent;

class AppKeys {
  constructor(private readonly apps: CodaiApps) {}

  /** `POST /apps/keys` — mint a key for one of the app's end users (scope `keys.mint`). Never retried. */
  mint(input: AppKeyMintInput, o: CallOpts = {}): Promise<AppKeyMinted> {
    return this.apps.call('/apps/keys', { method: 'POST', body: input, noRetry: true, ...o });
  }

  /** `GET /apps/keys` — keys minted by this app, newest first (scope `usage.read`). */
  list(query: AppKeyListQuery = {}, o: CallOpts = {}): Promise<AppKey[]> {
    return this.apps.call('/apps/keys', {
      query: {
        endUserExternalId: query.endUserExternalId,
        limit: query.limit,
        offset: query.offset,
      },
      ...o,
    });
  }

  /** `PATCH /apps/keys/{id}` — change label / enabled (scope `keys.mint`). */
  update(
    id: string,
    patch: AppKeyUpdate,
    o: CallOpts = {},
  ): Promise<{ id: string } & AppKeyUpdate> {
    return this.apps.call(`/apps/keys/${enc(id)}`, { method: 'PATCH', body: patch, ...o });
  }

  /** `DELETE /apps/keys/{id}` — revoke (scope `keys.revoke`). */
  revoke(id: string, o: CallOpts = {}): Promise<{ id: string }> {
    return this.apps.call(`/apps/keys/${enc(id)}`, { method: 'DELETE', ...o });
  }

  /** `GET /apps/keys/{id}/usage?days=` — codai-side usage + effective limits; `days` clamps to 1..90. */
  usage(id: string, days = 30, o: CallOpts = {}): Promise<AppKeyUsage> {
    return this.apps.call(`/apps/keys/${enc(id)}/usage`, { query: { days }, ...o });
  }

  /** Revoke every non-revoked key minted for `endUserExternalId`; returns how many were revoked. */
  async revokeAllFor(endUserExternalId: string, o: CallOpts = {}): Promise<number> {
    const keys = await this.list({ endUserExternalId, limit: 200 }, o);
    let revoked = 0;
    for (const k of keys) {
      if (k.revokedAt) continue;
      await this.revoke(k.id, o);
      revoked++;
    }
    return revoked;
  }
}

class AppUsers {
  constructor(private readonly apps: CodaiApps) {}

  /** `GET /apps/users/{externalId}/overrides` — current override + effective limits (scope `usage.read`). */
  getOverride(externalId: string, o: CallOpts = {}): Promise<AppOverride> {
    return this.apps.call(`/apps/users/${enc(externalId)}/overrides`, o);
  }

  /** `PUT /apps/users/{externalId}/overrides` — set / replace (scope `overrides.write`, app must allow overrides). */
  setOverride(externalId: string, input: AppOverrideInput, o: CallOpts = {}): Promise<AppOverride> {
    return this.apps.call(`/apps/users/${enc(externalId)}/overrides`, {
      method: 'PUT',
      body: input,
      ...o,
    });
  }

  /** `DELETE /apps/users/{externalId}/overrides` — clear (scope `overrides.write`). */
  clearOverride(externalId: string, o: CallOpts = {}): Promise<{ removed: boolean }> {
    return this.apps.call(`/apps/users/${enc(externalId)}/overrides`, { method: 'DELETE', ...o });
  }
}

class AppSubscriptions {
  constructor(private readonly apps: CodaiApps) {}

  /** `POST /apps/subscriptions/sync` — forward a Stripe subscription event (scope `subscriptions.sync`; idempotent per subscription). */
  sync(
    input: AppSubscriptionSyncInput,
    o: CallOpts = {},
  ): Promise<{ subscriptionId: string | null }> {
    return this.apps.call('/apps/subscriptions/sync', { method: 'POST', body: input, ...o });
  }
}

export class CodaiApps {
  readonly keys: AppKeys;
  readonly users: AppUsers;
  readonly subscriptions: AppSubscriptions;
  private readonly appHttp: HttpClient | null;
  private readonly validateHttp: HttpClient | null;

  constructor(opts: CodaiAppsOptions) {
    if (!opts.appToken && !opts.validateToken) {
      throw new Error('CodaiApps: appToken or validateToken is required');
    }
    const common = {
      baseUrl: opts.baseUrl ?? 'https://api.codai.ro',
      timeoutMs: opts.timeoutMs ?? 20_000,
      maxRetries: opts.maxRetries ?? 1,
      fetch: opts.fetch,
    };
    this.appHttp = opts.appToken ? new HttpClient({ apiKey: opts.appToken, ...common }) : null;
    this.validateHttp = opts.validateToken
      ? new HttpClient({ apiKey: opts.validateToken, ...common })
      : null;
    this.keys = new AppKeys(this);
    this.users = new AppUsers(this);
    this.subscriptions = new AppSubscriptions(this);
  }

  /**
   * `POST /internal/keys/validate` — does this plaintext key resolve to an
   * enabled codai key? Returns `{ valid: false, reason }` for unknown /
   * disabled keys; throws `CodaiError` for auth or transport failures.
   */
  async validateKey(key: string, o: CallOpts = {}): Promise<AppKeyValidation> {
    if (!this.validateHttp) throw new Error('CodaiApps: validateToken is required for validateKey');
    return this.validateHttp.json<AppKeyValidation>('/internal/keys/validate', {
      method: 'POST',
      body: { key },
      ...o,
    });
  }

  /** @internal Perform an app-token call and unwrap `{ ok, data }`. */
  async call<T>(path: string, init: RequestOptions = {}): Promise<T> {
    if (!this.appHttp) throw new Error('CodaiApps: appToken is required for /apps/* calls');
    const env = await this.appHttp.json<Envelope<T>>(path, init);
    if (!env || env.ok !== true || env.data === undefined) {
      throw new CodaiError(`codai ${path} → ok=false`, 200, env);
    }
    return env.data;
  }
}
