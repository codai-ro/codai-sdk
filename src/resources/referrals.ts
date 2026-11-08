/** `/v1/referrals` — referral stats and invitees; mutations go through `PATCH /v1/account`. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply, type Schema } from './_shared';
import { type AccountPatchResponse } from './account';

export type ReferralsView = Reply<'getReferrals'>;
export type ReferralRow = Schema<'ReferralRow'>;
export type ReferralStats = Schema<'AccountReferral'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Referrals {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/referrals` — stats, redeem deadline and invitees (masked, no PII). */
  get(opts: CallOpts = {}): Promise<ReferralsView> {
    return this.http.json<ReferralsView>('/v1/referrals', { ext: opts.ext, signal: opts.signal });
  }

  /**
   * Redeem a referrer's code (their username) — `PATCH /v1/account
   * { referral_code }`. Allowed within 7 days of signup; the outcome is in
   * `referral_result` of the response.
   */
  redeem(code: string, opts: CallOpts = {}): Promise<AccountPatchResponse> {
    return this.patch({ referral_code: code }, opts);
  }

  /** Opt in/out of the referral programme — `PATCH /v1/account { referral_consent }`. */
  setConsent(consent: boolean, opts: CallOpts = {}): Promise<AccountPatchResponse> {
    return this.patch({ referral_consent: consent }, opts);
  }

  private patch(
    body: { referral_code?: string; referral_consent?: boolean },
    opts: CallOpts,
  ): Promise<AccountPatchResponse> {
    return this.http.json<AccountPatchResponse>('/v1/account', {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
