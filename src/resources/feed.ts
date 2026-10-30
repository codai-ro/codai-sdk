/** `/v1/feed/*` — the public feed: posts, comments, profiles, likes, reports and blocked authors (AL-300, AL-301). */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type FeedPost = Schema<'FeedPost'>;
export type FeedPostImage = Schema<'FeedPostImage'>;
export type FeedPage = Schema<'FeedPage'>;
export type FeedMe = Schema<'FeedMe'>;
export type FeedPostCreateInput = Mutable<Schema<'FeedPostCreateInput'>>;
export type FeedReportInput = Mutable<Schema<'FeedReportInput'>>;
export type FeedLikeState = Schema<'FeedLikeState'>;
export type FeedBlock = Schema<'FeedBlock'>;
export type FeedLinkPreview = Schema<'FeedLinkPreview'>;
export type FeedComment = Schema<'FeedComment'>;
export type FeedCommentPage = Schema<'FeedCommentPage'>;
export type FeedCommentCreated = Schema<'FeedCommentCreated'>;
export type FeedProfile = Schema<'FeedProfile'>;
export type FeedProfilePage = Schema<'FeedProfilePage'>;
export type FeedListQuery = Mutable<QueryOf<'listFeed'>>;
export type FeedUserQuery = Mutable<QueryOf<'getFeedUser'>>;
export type FeedCommentsQuery = Mutable<QueryOf<'listFeedComments'>>;

/** Input of {@link Feed.comment}. */
export interface FeedCommentInput {
  body: string;
  /** Idempotency key for retries; a repeat returns the existing comment. */
  clientId?: string;
  /** Accepted community guidelines version (`GET /v1/feed/me`). */
  guidelinesVersion: string;
}

/** Who {@link Feed.block} blocks: the author of a post, or a username. A bare string is a post id. */
export type FeedBlockTarget = string | { postId: string } | { username: string };

/** Community guidelines version the gateway currently requires on create (`GET /v1/feed/me` is authoritative). */
export const FEED_GUIDELINES_VERSION = '2026-10-28';

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

/** A post image (`GET /v1/feed/images/{postId}/{index}`). */
export interface FeedImage {
  bytes: Uint8Array;
  contentType: string;
}

const post = (id: string, suffix = '') => `/v1/feed/posts/${encodeURIComponent(id)}${suffix}`;

export class Feed {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/feed` — newest first; pass `next_cursor` back as `cursor` for the next page. */
  list(params: FeedListQuery = {}, opts: CallOpts = {}): Promise<FeedPage> {
    return this.http.json<FeedPage>('/v1/feed', {
      query: {
        cursor: params.cursor,
        limit: params.limit,
        kind: params.kind,
        author: params.author,
        lang: params.lang,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `GET /v1/feed/users/{username}` — a public profile and its posts. 404 `user_not_found` when no active user has
   * that username or they blocked you; `profile.blocked` is true (and `posts` empty) when you blocked them.
   */
  user(
    username: string,
    params: FeedUserQuery = {},
    opts: CallOpts = {},
  ): Promise<FeedProfilePage> {
    return this.http.json<FeedProfilePage>(`/v1/feed/users/${encodeURIComponent(username)}`, {
      query: {
        cursor: params.cursor,
        limit: params.limit,
        kind: params.kind,
        lang: params.lang,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/feed/me` — your public username (or a suggestion) and the guidelines version to send. */
  me(opts: CallOpts = {}): Promise<FeedMe> {
    return this.http.json<FeedMe>('/v1/feed/me', { ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/feed/posts/{id}`. */
  async get(id: string, opts: CallOpts = {}): Promise<FeedPost> {
    const r = await this.http.json<Reply<'getFeedPost'>>(post(id), {
      ext: opts.ext,
      signal: opts.signal,
    });
    return r.post;
  }

  /**
   * `POST /v1/feed/posts` — 409 `username_required` without a username, 400 `guidelines_required` without
   * `guidelines_version`, 422 `image_rejected` when moderation rejects an image. A repeated `client_id` returns
   * the existing post.
   */
  async create(body: FeedPostCreateInput, opts: CallOpts = {}): Promise<FeedPost> {
    const r = await this.http.json<Reply<'createFeedPost', 201>>('/v1/feed/posts', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [200, 201],
    });
    return r.post;
  }

  /** `DELETE /v1/feed/posts/{id}` — your own posts only. */
  async delete(id: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(post(id), { method: 'DELETE', ext: opts.ext, signal: opts.signal });
  }

  /** `POST /v1/feed/posts/{id}/like` (idempotent). */
  like(id: string, opts: CallOpts = {}): Promise<FeedLikeState> {
    return this.http.json<FeedLikeState>(post(id, '/like'), {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/feed/posts/{id}/like` (idempotent). */
  unlike(id: string, opts: CallOpts = {}): Promise<FeedLikeState> {
    return this.http.json<FeedLikeState>(post(id, '/like'), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/feed/posts/{id}/report` (idempotent per post). */
  async report(id: string, body: FeedReportInput, opts: CallOpts = {}): Promise<void> {
    await this.http.json<Reply<'reportFeedPost', 201>>(post(id, '/report'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [201],
    });
  }

  /** `GET /v1/feed/posts/{id}/comments` — oldest first; pass `next_cursor` back as `cursor`. */
  comments(
    postId: string,
    params: FeedCommentsQuery = {},
    opts: CallOpts = {},
  ): Promise<FeedCommentPage> {
    return this.http.json<FeedCommentPage>(post(postId, '/comments'), {
      query: { cursor: params.cursor, limit: params.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/feed/posts/{id}/comments` — same 409 `username_required` / 400 `guidelines_required` as posting;
   * 429 above 60 comments per hour. Returns the comment and the post's new comment count.
   */
  comment(
    postId: string,
    input: FeedCommentInput,
    opts: CallOpts = {},
  ): Promise<FeedCommentCreated> {
    const body: Record<string, string> = {
      body: input.body,
      guidelines_version: input.guidelinesVersion,
    };
    if (input.clientId !== undefined) body.client_id = input.clientId;
    return this.http.json<FeedCommentCreated>(post(postId, '/comments'), {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [200, 201],
    });
  }

  /** `DELETE /v1/feed/comments/{id}` — your comment, or any comment on your post; returns the new comment count. */
  async deleteComment(id: string, opts: CallOpts = {}): Promise<number> {
    const r = await this.http.json<Reply<'deleteFeedComment'>>(
      `/v1/feed/comments/${encodeURIComponent(id)}`,
      { method: 'DELETE', ext: opts.ext, signal: opts.signal },
    );
    return r.comment_count;
  }

  /** `POST /v1/feed/comments/{id}/report` (idempotent per comment; 400 for your own comment). */
  async reportComment(id: string, body: FeedReportInput, opts: CallOpts = {}): Promise<void> {
    await this.http.json<Reply<'reportFeedComment', 201>>(
      `/v1/feed/comments/${encodeURIComponent(id)}/report`,
      { method: 'POST', body, ext: opts.ext, signal: opts.signal, acceptStatus: [201] },
    );
  }

  /** `GET /v1/feed/blocks` — authors you blocked. */
  async blocks(opts: CallOpts = {}): Promise<FeedBlock[]> {
    const r = await this.http.json<Reply<'listFeedBlocks'>>('/v1/feed/blocks', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.blocks];
  }

  /**
   * `POST /v1/feed/blocks` — blocks the author of a post (`'id'` or `{ postId }`) or a `{ username }`; returns
   * the blocked username.
   */
  async block(target: FeedBlockTarget, opts: CallOpts = {}): Promise<string | null> {
    const body =
      typeof target === 'string'
        ? { post_id: target }
        : 'postId' in target
          ? { post_id: target.postId }
          : { username: target.username };
    const r = await this.http.json<Reply<'blockFeedAuthor', 201>>('/v1/feed/blocks', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [201],
    });
    return r.username;
  }

  /** `DELETE /v1/feed/blocks/{username}`. */
  async unblock(username: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(`/v1/feed/blocks/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/feed/images/{postId}/{index}` — public; usually you just load `FeedPostImage.url`. */
  async image(postId: string, index: number, opts: CallOpts = {}): Promise<FeedImage> {
    const res = await this.http.request(
      `/v1/feed/images/${encodeURIComponent(postId)}/${Math.trunc(index)}`,
      { ext: opts.ext, signal: opts.signal },
    );
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  /** `GET /v1/feed/previews/{postId}` — public; usually you just load `link_preview.image_url`. */
  async previewImage(postId: string, opts: CallOpts = {}): Promise<FeedImage> {
    const res = await this.http.request(`/v1/feed/previews/${encodeURIComponent(postId)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }
}
