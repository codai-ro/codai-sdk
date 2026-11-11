/**
 * codai Studio edit styles (SX-44) — named cut settings (pacing, captions, zoom, b-roll density / sources, reframe
 * speed) you apply to a finished cut with `productions.restyleCut(id, { style })`. Everything here is free.
 *
 *   `GET    /v1/studio/edit-styles`               — the 6 built-ins + your styles (+ first gallery page) (`list`)
 *   `POST   /v1/studio/edit-styles`               — save a private style, 50 per account (`create`), HTTP 201
 *   `PATCH  /v1/studio/edit-styles/{id}`          — edit one of yours; any edit makes it private again (`update`)
 *   `DELETE /v1/studio/edit-styles/{id}`          — delete one of yours (`delete`)
 *   `POST   /v1/studio/edit-styles/{id}/submit`   — share to the gallery: `pending` until codai reviews it (`submit`)
 *   `GET    /v1/studio/edit-styles/gallery`       — approved styles of other users, newest first (`gallery`)
 *   `POST   /v1/studio/edit-styles/{id}/copy`     — private copy of a gallery style (`copy`), HTTP 201
 *   `POST   /v1/studio/edit-styles/{id}/report`   — report a gallery style that breaks the rules (`report`), HTTP 201
 *   `GET    /v1/studio/edit-styles/moderation`    — super_admin review queue (`moderationQueue`)
 *   `POST   /v1/studio/edit-styles/{id}/moderate` — super_admin approve / reject / remove (`moderate`)
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema } from './_shared';

export type StudioEditStyle = Schema<'StudioEditStyle'>;
export type StudioEditStyleKnobs = Mutable<Schema<'StudioEditStyleKnobs'>>;
export type StudioEditStyleList = Schema<'StudioEditStyleList'>;
export type StudioEditStyleGallery = Schema<'StudioEditStyleGallery'>;
export type StudioEditStyleModerationList = Schema<'StudioEditStyleModerationList'>;
export type StudioEditStyleCreate = Mutable<Schema<'StudioEditStyleCreate'>>;
export type StudioEditStyleUpdate = Mutable<Schema<'StudioEditStyleUpdate'>>;
export type StudioEditStyleDeleted = Schema<'StudioEditStyleDeleted'>;
export type StudioEditStyleReport = Mutable<Schema<'StudioEditStyleReport'>>;
export type StudioEditStyleReportResult = Schema<'StudioEditStyleReportResult'>;
export type StudioEditStyleModerate = Mutable<Schema<'StudioEditStyleModerate'>>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const BASE = '/v1/studio/edit-styles';
const path = (id: number | string, tail = '') => `${BASE}/${encodeURIComponent(String(id))}${tail}`;

export class EditStyles {
  constructor(private readonly http: HttpClient) {}

  /** Built-in styles (names in `lang`), your saved styles and, with `gallery: true`, the first gallery page. */
  list(
    query: { lang?: 'en' | 'ro'; gallery?: boolean } = {},
    opts: CallOpts = {},
  ): Promise<StudioEditStyleList> {
    return this.http.json<StudioEditStyleList>(BASE, {
      query: { lang: query.lang, gallery: query.gallery ? '1' : undefined },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Save a private style (`name`, optional `description`, `knobs`). 409 `too_many_styles` at 50. */
  create(body: StudioEditStyleCreate, opts: CallOpts = {}): Promise<StudioEditStyle> {
    return this.http.json<StudioEditStyle>(BASE, {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Change name / description / knobs of one of your styles; a shared style leaves the gallery (status `private`). */
  update(id: number, body: StudioEditStyleUpdate, opts: CallOpts = {}): Promise<StudioEditStyle> {
    return this.http.json<StudioEditStyle>(path(id), {
      method: 'PATCH',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Delete one of your styles. */
  delete(id: number, opts: CallOpts = {}): Promise<StudioEditStyleDeleted> {
    return this.http.json<StudioEditStyleDeleted>(path(id), {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Share one of your styles to the gallery: it becomes `pending` until codai reviews it. Only the name, description
   * and settings are shared, with your username. 10 per day (429); 409 `style_removed` for a removed style.
   */
  submit(id: number, opts: CallOpts = {}): Promise<StudioEditStyle> {
    return this.http.json<StudioEditStyle>(path(id, '/submit'), {
      method: 'POST',
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** One page of approved gallery styles (`limit` 1–48, default 24; `cursor` = the previous `next_cursor`). */
  gallery(
    query: { limit?: number; cursor?: number } = {},
    opts: CallOpts = {},
  ): Promise<StudioEditStyleGallery> {
    return this.http.json<StudioEditStyleGallery>(`${BASE}/gallery`, {
      query: { limit: query.limit, cursor: query.cursor },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** A private copy of a gallery style (or of one of yours); `copied_from` = the source id. */
  copy(id: number, opts: CallOpts = {}): Promise<StudioEditStyle> {
    return this.http.json<StudioEditStyle>(path(id, '/copy'), {
      method: 'POST',
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** Report a gallery style (`reason`, optional `details`); one report per user, 5 reports hide it until review. */
  report(
    id: number,
    body: StudioEditStyleReport,
    opts: CallOpts = {},
  ): Promise<StudioEditStyleReportResult> {
    return this.http.json<StudioEditStyleReportResult>(path(id, '/report'), {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** super_admin: styles in one moderation status (default `pending`). */
  moderationQueue(
    query: { status?: 'pending' | 'removed' | 'rejected' | 'approved' } = {},
    opts: CallOpts = {},
  ): Promise<StudioEditStyleModerationList> {
    return this.http.json<StudioEditStyleModerationList>(`${BASE}/moderation`, {
      query: { status: query.status },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** super_admin: `approve` (publish), `reject` or `remove` a style. */
  moderate(
    id: number,
    body: StudioEditStyleModerate,
    opts: CallOpts = {},
  ): Promise<StudioEditStyle> {
    return this.http.json<StudioEditStyle>(path(id, '/moderate'), {
      method: 'POST',
      body,
      noRetry: true,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
