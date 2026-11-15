/**
 * `/v1/feed/*` — the public feed: posts, comments and replies, profiles, follows, search and tags, likes, reports
 * and blocked authors (AL-300, AL-301, AL-320..AL-324).
 */
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
export type FeedPostMedia = Schema<'FeedPostMedia'>;
export type FeedTag = Schema<'FeedTag'>;
export type FeedTagList = Schema<'FeedTagList'>;
export type FeedFollow = Schema<'FeedFollow'>;
export type FeedFollowPage = Schema<'FeedFollowPage'>;
export type FeedFollowState = Schema<'FeedFollowState'>;
export type FeedPublicPost = Schema<'FeedPublicPost'>;
export type FeedPublicProfilePage = Schema<'FeedPublicProfilePage'>;
export type FeedPublicSitemap = Schema<'FeedPublicSitemap'>;
export type FeedListQuery = Mutable<QueryOf<'listFeed'>>;
export type FeedUserQuery = Mutable<QueryOf<'getFeedUser'>>;
export type FeedCommentsQuery = Mutable<QueryOf<'listFeedComments'>>;
export type FeedTagsQuery = Mutable<QueryOf<'listFeedTags'>>;
export type FeedFollowsQuery = Mutable<QueryOf<'listFeedFollows'>>;
export type FeedPublicUserQuery = Mutable<QueryOf<'getPublicFeedUser'>>;

/** Input of {@link Feed.comment}. */
export interface FeedCommentInput {
  body: string;
  /** Reply to this visible top-level comment of the same post (one level only; 400 `invalid_parent` otherwise). */
  parentId?: string;
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
const media = (postId: string, suffix = '') =>
  `/v1/feed/media/${encodeURIComponent(postId)}${suffix}`;

export class Feed {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/feed` — newest first; pass `next_cursor` back as `cursor` for the next page. `scope: 'following'` keeps
   * only authors you follow, `q` searches the text (diacritics-insensitive; a leading `#x` / `@x` acts as `tag` /
   * `author`), `tag` keeps posts with that hashtag.
   */
  list(params: FeedListQuery = {}, opts: CallOpts = {}): Promise<FeedPage> {
    return this.http.json<FeedPage>('/v1/feed', {
      query: {
        cursor: params.cursor,
        limit: params.limit,
        kind: params.kind,
        author: params.author,
        lang: params.lang,
        scope: params.scope,
        q: params.q,
        tag: params.tag,
      },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/feed/tags` — the most used hashtags of the last 30 days (`prefix` for search suggestions). */
  async tags(params: FeedTagsQuery = {}, opts: CallOpts = {}): Promise<FeedTag[]> {
    const r = await this.http.json<FeedTagList>('/v1/feed/tags', {
      query: { prefix: params.prefix, limit: params.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...r.tags];
  }

  /**
   * `POST /v1/feed/follows` — follow a user (idempotent). 400 for yourself, 404 `user_not_found` for an unknown
   * user or a block either way, 429 above 200 follows a day.
   */
  follow(username: string, opts: CallOpts = {}): Promise<FeedFollowState> {
    return this.http.json<FeedFollowState>('/v1/feed/follows', {
      method: 'POST',
      body: { username },
      ext: opts.ext,
      signal: opts.signal,
      acceptStatus: [200, 201],
    });
  }

  /** `DELETE /v1/feed/follows/{username}` — 404 `follow_not_found` when you were not following them. */
  async unfollow(username: string, opts: CallOpts = {}): Promise<void> {
    await this.http.request(`/v1/feed/follows/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/feed/follows` — the users you follow, most recent first; pass `next_cursor` back as `cursor`. */
  follows(params: FeedFollowsQuery = {}, opts: CallOpts = {}): Promise<FeedFollowPage> {
    return this.http.json<FeedFollowPage>('/v1/feed/follows', {
      query: { cursor: params.cursor, limit: params.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `GET /v1/feed/users/{username}` — a public profile and its posts. 404 `user_not_found` when no active user has
   * that username or they blocked you; `profile.blocked` is true (and `posts` empty) when you blocked them.
   * `profile.following`, `follower_count` and `following_count` describe the follow graph.
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
   * 429 above 60 comments per hour; 400 `invalid_parent` when `parentId` is not a visible top-level comment of the
   * post. Returns the comment and the post's new comment count.
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
    if (input.parentId !== undefined) body.parent_id = input.parentId;
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

  /**
   * The public URL of a post's video/audio (`GET /v1/feed/media/{postId}`, a 302 to a 10-minute signed URL; no key
   * needed). Same as `post.media.url`; hand it to a player.
   */
  mediaUrl(postId: string): string {
    return this.http.url(media(postId));
  }

  /** The public poster URL of a post's video (`GET /v1/feed/media/{postId}/poster`, 302). */
  mediaPosterUrl(postId: string): string {
    return this.http.url(media(postId, '/poster'));
  }

  /** `GET /v1/public/feed/posts/{id}` — no key needed; 404 unless the author opted in to the public web. */
  async publicPost(id: string, opts: CallOpts = {}): Promise<FeedPublicPost> {
    const r = await this.http.json<Reply<'getPublicFeedPost'>>(
      `/v1/public/feed/posts/${encodeURIComponent(id)}`,
      { ext: opts.ext, signal: opts.signal },
    );
    return r.post;
  }

  /** `GET /v1/public/feed/users/{username}` — no key needed; 404 unless the user opted in to the public web. */
  publicUser(
    username: string,
    params: FeedPublicUserQuery = {},
    opts: CallOpts = {},
  ): Promise<FeedPublicProfilePage> {
    return this.http.json<FeedPublicProfilePage>(
      `/v1/public/feed/users/${encodeURIComponent(username)}`,
      {
        query: { cursor: params.cursor, limit: params.limit },
        ext: opts.ext,
        signal: opts.signal,
      },
    );
  }

  /** `GET /v1/public/feed/sitemap` — no key needed; newest public posts and opted-in users. */
  publicSitemap(opts: CallOpts = {}): Promise<FeedPublicSitemap> {
    return this.http.json<FeedPublicSitemap>('/v1/public/feed/sitemap', {
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
