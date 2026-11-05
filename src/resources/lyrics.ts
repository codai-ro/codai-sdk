/**
 * `/v1/studio/lyrics` — codai Studio lyrics writer and karaoke alignment (MU-06).
 *
 *   `POST /v1/studio/lyrics`        — write original lyrics for a brief (`write`), checked for syllables per line and
 *                                     the rhyme scheme; one repair turn when more than 30 % of the lines miss.
 *                                     Token-metered (`codai::lyrics`) under a small wallet hold.
 *   `POST /v1/studio/lyrics/align`  — align written lyrics to one clip of an audio / video creative (`align`): timed
 *                                     lines applied with one `setLyrics` edit (unless `apply: false`) + an LRC file.
 *                                     Cached clip words are free; a fresh transcription bills `codai::lyrics-align`.
 *
 * Both honour `Idempotency-Key`. 402 `insufficient_funds` when the hold does not fit; alignment is 403
 * `residency_unavailable` for EU data-residency accounts.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Mutable, type Schema } from './_shared';

export type LyricsRequest = Mutable<Schema<'StudioLyricsRequest'>>;
export type LyricsSectionKind = Schema<'StudioLyricsSectionKind'>;
export type LyricsLine = Schema<'StudioLyricsLine'>;
export type Lyrics = Schema<'StudioLyrics'>;
export type LyricsAlignRequest = Mutable<Schema<'StudioLyricsAlignRequest'>>;
export type LyricsAlignment = Schema<'StudioLyricsAlignment'>;

export interface LyricsCallOptions {
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
  /** `Idempotency-Key`: a retry with the same key replays the first answer instead of running (and billing) again. */
  idempotencyKey?: string;
}

const BASE = '/v1/studio/lyrics';

export class LyricsResource {
  constructor(private readonly http: HttpClient) {}

  private post<T>(path: string, body: unknown, opts: LyricsCallOptions): Promise<T> {
    return this.http.json<T>(path, {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/lyrics` — `{ brief, language: 'ro' | 'en', genre?, mood?, structure?, syllables_per_line?,
   * rhyme_scheme?, lines_per_section?, title? }` → `studio.lyrics` with every line's syllables and rhyme letter, the
   * whole song as `text` (`[kind]` headers) and a `report`. `repaired: true` when the repair turn won.
   */
  write(body: LyricsRequest, opts: LyricsCallOptions = {}): Promise<Lyrics> {
    return this.post<Lyrics>(BASE, body, opts);
  }

  /**
   * `POST /v1/studio/lyrics/align` — `{ creative_id, clip_id, lyrics_text, language?, apply?, base_seq?,
   * retranscribe? }` → `studio.lyrics_alignment`: timed `lines`, `lrc`, `match_ratio`, `cached`, and `seq` /
   * `doc_hash` of the new version when applied.
   */
  align(body: LyricsAlignRequest, opts: LyricsCallOptions = {}): Promise<LyricsAlignment> {
    return this.post<LyricsAlignment>(`${BASE}/align`, body, opts);
  }
}
