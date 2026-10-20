/** `/v1/account`, `/v1/receipt`, `/v1/feedback`, `/v1/phone/models`. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type AccountView = Reply<'getAccount'>;
export type AccountPatchRequest = Mutable<Body<'patchAccount'>>;
export type AccountPatchResponse = Reply<'patchAccount'>;
export type Receipt = Reply<'getReceipt'>;
export type FeedbackRequest = Mutable<Body<'submitFeedback'>>;
export type FeedbackResponse = Reply<'submitFeedback'>;
export type PhoneModel = Schema<'AccountPhoneModel'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Account {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/account` — the full account card. */
  get(opts: CallOpts = {}): Promise<AccountView> {
    return this.http.json<AccountView>('/v1/account', { ext: opts.ext, signal: opts.signal });
  }

  /** `PATCH /v1/account` — consents, username, referral (at least one field). */
  update(body: AccountPatchRequest, opts: CallOpts = {}): Promise<AccountPatchResponse> {
    return this.http.json<AccountPatchResponse>('/v1/account', {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Receipts {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/receipt` — spend receipt. `sessionId` wins over `since`; with
   * neither, the last 24 hours.
   */
  get(
    query: { sessionId?: string; since?: string | Date } = {},
    opts: CallOpts = {},
  ): Promise<Receipt> {
    return this.http.json<Receipt>('/v1/receipt', {
      query: {
        session_id: query.sessionId,
        since: query.since instanceof Date ? query.since.toISOString() : query.since,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class Feedback {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/feedback` — rate one turn. Exactly one of `event_id`,
   * `session_id`, `client_request_id` must be present.
   */
  submit(body: FeedbackRequest, opts: CallOpts = {}): Promise<FeedbackResponse> {
    return this.http.json<FeedbackResponse>('/v1/feedback', {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}

export class PhoneModels {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/phone/models` — on-device model catalog with signed URLs. */
  async list(opts: CallOpts = {}): Promise<PhoneModel[]> {
    const raw = await this.http.json<Reply<'listPhoneModels'>>('/v1/phone/models', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.models ?? [])];
  }
}
