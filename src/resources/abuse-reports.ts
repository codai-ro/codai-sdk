/**
 * `POST /v1/studio/abuse-reports` — report illegal or abusive content seen on a codai Studio share (`/s/<token>`) or
 * review (`/r/<token>`) link (DSA art. 16 notice). Public: the key is not required by the route; an unknown link still
 * answers 202 (no enumeration). Free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema, stripUndefined } from './_shared';

/** `share_token`, `surface`, `category`, `explanation`, `reporter_name`, `reporter_email`, `good_faith: true`. */
export type StudioAbuseReportRequest = Mutable<Schema<'StudioAbuseReportRequest'>>;
/** `{ id, object: 'studio.abuse_report', status: 'open' }`. */
export type StudioAbuseReport = Schema<'StudioAbuseReport'>;

export class AbuseReports {
  constructor(private readonly http: HttpClient) {}

  /** Store an abuse report for manual review (HTTP 202). Rate-limited per IP; never retried. */
  create(
    body: StudioAbuseReportRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<StudioAbuseReport> {
    return this.http.json<StudioAbuseReport>('/v1/studio/abuse-reports', {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }
}
