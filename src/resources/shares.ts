/**
 * codai Studio share links seen from the outside — read, remix and review a creative someone shared with you.
 *
 *   `GET  /v1/public/studio/shares/{token}`                           — the shared creative (`get`; no key needed)
 *   `POST /v1/studio/shares/{token}/remix`                            — copy a `view` link into your account (`remix`)
 *   `POST /v1/public/studio/reviews/{token}/threads`                  — comment through a review link (`comment`)
 *   `POST /v1/public/studio/reviews/{token}/threads/{threadId}/replies` — reply (`reply`)
 *   `POST /v1/public/studio/reviews/{token}/threads/{threadId}/resolve|reopen` — (`resolve`, `reopen`)
 *   `POST /v1/public/studio/reviews/{token}/decision`                 — approve / request changes (`decide`)
 *
 * Every method takes the token or the whole link (`https://hub.codai.ro/s/<token>` or `/r/<token>`). The public
 * routes ignore the API key; reviewers are identified only by the `name` they type (visible to the owner and other
 * reviewers). Owners create and revoke links with `creatives.createShare` / `creatives.revokeShare`. Everything is free.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema, stripUndefined } from './_shared';
import { type StudioReviewThread } from './creatives';

export type StudioShareKind = Schema<'StudioShareKind'>;
export type StudioPublicShare = Schema<'StudioPublicShare'>;
export type StudioPublicReview = Schema<'StudioPublicReview'>;
/** The new creative (same shape as `creatives.create`) plus `remixed_from` and optional `warnings`. */
export type StudioRemixResult = Schema<'StudioRemixResult'>;
/** Optional `title` of the new creative. */
export type StudioRemixRequest = Mutable<Schema<'StudioRemixRequest'>>;
/** `name` + `body`, optional anchor `node_id` / `scene_id` / `t_ms`. */
export type StudioPublicThreadCreateRequest = Mutable<Schema<'StudioPublicThreadCreateRequest'>>;
/** `name` + `body`. */
export type StudioPublicReplyRequest = Mutable<Schema<'StudioPublicReplyRequest'>>;
/** `name`. */
export type StudioPublicNameRequest = Mutable<Schema<'StudioPublicNameRequest'>>;
/** `name`, `decision` (`approve` | `request_changes`), `seq` (the head you reviewed), optional `note`. */
export type StudioPublicDecisionRequest = Mutable<Schema<'StudioPublicDecisionRequest'>>;
export type StudioPublicShareQuery = { format?: string; locale?: string };

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The share token in `input`: a raw token, or any `https://…/s/<token>` / `…/r/<token>` URL (query and fragment
 * ignored). Trims; `null` for anything else (same rule as the gateway and the apps).
 */
export function shareTokenFrom(input: string): string | null {
  const s = input.trim();
  if (SHARE_TOKEN_RE.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const kind = parts[parts.length - 2];
  const token = parts[parts.length - 1]!;
  return (kind === 's' || kind === 'r') && SHARE_TOKEN_RE.test(token) ? token : null;
}

function tokenOf(tokenOrUrl: string): string {
  const token = shareTokenFrom(tokenOrUrl);
  if (!token)
    throw new TypeError('codai: not a share link or token (expected …/s/<token> or …/r/<token>)');
  return token;
}

const review = (tokenOrUrl: string, tail: string) =>
  `/v1/public/studio/reviews/${encodeURIComponent(tokenOf(tokenOrUrl))}${tail}`;
const thread = (tokenOrUrl: string, threadId: string, tail: string) =>
  review(tokenOrUrl, `/threads/${encodeURIComponent(threadId)}${tail}`);

export class Shares {
  constructor(private readonly http: HttpClient) {}

  /**
   * The shared creative: title, kind, version, formats, locales and the compiled preview HTML of `format` /
   * `locale` (null for images); review links add the review state and every thread. 404 for unknown, revoked or
   * expired links. No key needed.
   */
  get(
    tokenOrUrl: string,
    query: StudioPublicShareQuery = {},
    opts: CallOpts = {},
  ): Promise<StudioPublicShare> {
    return this.http.json<StudioPublicShare>(
      `/v1/public/studio/shares/${encodeURIComponent(tokenOf(tokenOrUrl))}`,
      { query: { format: query.format, locale: query.locale }, ext: opts.ext, signal: opts.signal },
    );
  }

  /**
   * Copy the version a `view` link shows into a new creative of yours (the owner's ready assets are copied, the
   * foreign brand kit dropped; HTTP 201). 404 for review links or links without remix; 413 `remix_too_large`. Free.
   */
  remix(
    tokenOrUrl: string,
    body: StudioRemixRequest = {},
    opts: CallOpts = {},
  ): Promise<StudioRemixResult> {
    return this.http.json<StudioRemixResult>(
      `/v1/studio/shares/${encodeURIComponent(tokenOf(tokenOrUrl))}/remix`,
      {
        method: 'POST',
        body: stripUndefined(body),
        ext: opts.ext,
        signal: opts.signal,
        noRetry: true,
      },
    );
  }

  /** Start a thread through a review link (`name`, `body`, optional anchor; HTTP 201). 400 `invalid_name`. */
  comment(
    tokenOrUrl: string,
    body: StudioPublicThreadCreateRequest,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(review(tokenOrUrl, '/threads'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Reply in a thread through a review link (`name`, `body`; HTTP 201) — returns the whole thread. */
  reply(
    tokenOrUrl: string,
    threadId: string,
    body: StudioPublicReplyRequest,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(thread(tokenOrUrl, threadId, '/replies'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }

  /** Resolve a thread through a review link (`resolved_by` = `name`). */
  resolve(
    tokenOrUrl: string,
    threadId: string,
    body: StudioPublicNameRequest,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(thread(tokenOrUrl, threadId, '/resolve'), {
      method: 'POST',
      body: { name: body.name },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Reopen a resolved thread through a review link. */
  reopen(
    tokenOrUrl: string,
    threadId: string,
    body: StudioPublicNameRequest,
    opts: CallOpts = {},
  ): Promise<StudioReviewThread> {
    return this.http.json<StudioReviewThread>(thread(tokenOrUrl, threadId, '/reopen'), {
      method: 'POST',
      body: { name: body.name },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Approve or request changes (approver review links only). 403 `not_an_approver`, 409 `review_not_open`, 409
   * `stale` (with `head_seq`) when `seq` is not the head. Returns the new review state.
   */
  decide(
    tokenOrUrl: string,
    body: StudioPublicDecisionRequest,
    opts: CallOpts = {},
  ): Promise<StudioPublicReview> {
    return this.http.json<StudioPublicReview>(review(tokenOrUrl, '/decision'), {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
      noRetry: true,
    });
  }
}
