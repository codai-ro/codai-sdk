/** `/v1/triggers/*` + `/v1/notifications/*` — event triggers (webhooks → agent sessions) and the inbox. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type TriggerList = Reply<'listTriggers'>;
export type TriggerCreateRequest = Mutable<Body<'createTrigger'>>;
export type TriggerCreated = Reply<'createTrigger'>;
export type TriggerPatch = Mutable<Body<'updateTrigger'>>;
export type TriggerUpdated = Reply<'updateTrigger'>;
export type TriggerTestRequest = Mutable<Body<'testTrigger'>>;
export type TriggerTestResult = Reply<'testTrigger'>;
export type TriggerEvents = Reply<'listTriggerEvents'>;
export type NotificationList = Reply<'listNotifications'>;
export type NotificationsRead = Reply<'markNotificationsRead'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Triggers {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/triggers` — never includes the signing secret. */
  list(opts: CallOpts = {}): Promise<TriggerList> {
    return this.http.json<TriggerList>('/v1/triggers', { ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/triggers` — the response carries the signing `secret` ONCE. */
  create(body: TriggerCreateRequest, opts: CallOpts = {}): Promise<TriggerCreated> {
    return this.http.json<TriggerCreated>('/v1/triggers', { method: 'POST', body, ext: opts.ext, signal: opts.signal });
  }

  /** `PATCH /v1/triggers/{id}` — name / enabled / policy. */
  update(id: string, body: TriggerPatch, opts: CallOpts = {}): Promise<TriggerUpdated> {
    return this.http.json<TriggerUpdated>(`/v1/triggers/${encodeURIComponent(id)}`, { method: 'PATCH', body, ext: opts.ext, signal: opts.signal });
  }

  /** `DELETE /v1/triggers/{id}` — its hook URL stops working immediately. */
  delete(id: string, opts: CallOpts = {}): Promise<Reply<'deleteTrigger'>> {
    return this.http.json<Reply<'deleteTrigger'>>(`/v1/triggers/${encodeURIComponent(id)}`, { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/triggers/{id}/rotate-secret` — new secret, shown once. */
  rotateSecret(id: string, opts: CallOpts = {}): Promise<Reply<'rotateTriggerSecret'>> {
    return this.http.json<Reply<'rotateTriggerSecret'>>(`/v1/triggers/${encodeURIComponent(id)}/rotate-secret`, { method: 'POST', body: {}, ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/triggers/{id}/test` — manual fire through the full pipeline; returns the decision + reason. */
  /** `PUT /v1/triggers/{id}/secret` — store a secret issued by the source (e.g. a Sentry integration's client secret). */
  setSecret(id: string, secret: string, opts: CallOpts = {}): Promise<Reply<'setTriggerSecret'>> {
    return this.http.json<Reply<'setTriggerSecret'>>(`/v1/triggers/${encodeURIComponent(id)}/secret`, { method: 'PUT', body: { secret }, ext: opts.ext, signal: opts.signal, noRetry: true });
  }

  /** `POST /v1/triggers/{id}/test` — manual fire through the full pipeline; returns the decision + reason. */
  test(id: string, body: TriggerTestRequest = {}, opts: CallOpts = {}): Promise<TriggerTestResult> {
    return this.http.json<TriggerTestResult>(`/v1/triggers/${encodeURIComponent(id)}/test`, { method: 'POST', body, ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/triggers/{id}/events?limit=` — recent deliveries with decisions. */
  events(id: string, limit?: number, opts: CallOpts = {}): Promise<TriggerEvents> {
    return this.http.json<TriggerEvents>(`/v1/triggers/${encodeURIComponent(id)}/events`, { query: { limit }, ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/hooks/{id}` — send an event to a `generic` / `form` trigger from your own code. Signs the body
   * (`X-Codai-Signature: t=<unix>,v1=HMAC_SHA256(secret, "<t>.<body>")`, WebCrypto — Node 20+, browsers, Deno,
   * Workers). `deliveryId` makes retries idempotent. The hook needs no API key (the signature is the auth).
   */
  async fireHook(
    id: string,
    secret: string,
    event: { title: string; message?: string; severity?: 'info' | 'low' | 'medium' | 'high' | 'critical'; url?: string; subject?: string; labels?: string[]; dedupe_key?: string; resolved?: boolean },
    opts: CallOpts & { deliveryId?: string } = {},
  ): Promise<Reply<'receiveTriggerHook'>> {
    const raw = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
    const v1 = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
    return this.http.json<Reply<'receiveTriggerHook'>>(`/v1/hooks/${encodeURIComponent(id)}`, {
      method: 'POST',
      rawBody: raw,
      ext: {
        ...opts.ext,
        headers: {
          ...opts.ext?.headers,
          'Content-Type': 'application/json',
          'x-codai-signature': `t=${t},v1=${v1}`,
          ...(opts.deliveryId ? { 'x-codai-delivery': opts.deliveryId } : {}),
        },
      },
      signal: opts.signal,
    });
  }
}

export class Notifications {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/notifications?unread=1&limit=` — newest first. */
  list(query: { unread?: boolean; limit?: number } = {}, opts: CallOpts = {}): Promise<NotificationList> {
    return this.http.json<NotificationList>('/v1/notifications', {
      query: { unread: query.unread ? '1' : undefined, limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/notifications/read` — `ids` omitted = every unread one. */
  markRead(ids?: number[], opts: CallOpts = {}): Promise<NotificationsRead> {
    return this.http.json<NotificationsRead>('/v1/notifications/read', { method: 'POST', body: ids ? { ids } : {}, ext: opts.ext, signal: opts.signal });
  }
}
