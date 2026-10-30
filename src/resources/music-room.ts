/**
 * `/v1/studio/music-room` — codai Studio Music Room (MR-09..MR-17): a team of role agents writes, plays, sings and
 * mixes a song that sounds played by people, saved as an editable audio creative.
 *
 *   `POST /v1/studio/music-room`               — start a song (`create`, 202, Idempotency-Key honoured)
 *   `GET  /v1/studio/music-room`               — your songs, newest first (`list`, `limit` / `before`)
 *   `GET  /v1/studio/music-room/quota`         — songs included this month (`quota`)
 *   `GET  /v1/studio/music-room/{id}`          — the song; reading it advances the workflow (`get`)
 *   `POST /v1/studio/music-room/{id}/choose`   — answer the open gate (`choose`)
 *   `POST /v1/studio/music-room/{id}/direct`   — talk to one player (`direct`, 202, Idempotency-Key honoured)
 *   `GET  /v1/studio/music-room/plugins`       — the cloud plugin set (`plugins`, `kind` / `q`) (MR-41)
 *   `GET  /v1/studio/music-room/plugins/{format}/{pluginId}` — one cloud plugin with its params (`plugin`)
 *   `POST /v1/studio/music-room/{id}/plugin`   — set / clear one player's plugin chain (`setTrackPlugin`, 202,
 *                                                Idempotency-Key honoured)
 *   `POST /v1/studio/music-room/{id}/export`   — `.dawproject` export (`exportProject`, 202; poll
 *                                                `exports.wait(id)`) (MR-45)
 *
 * The workflow stops at three gates (`plan`, `demo`, `final`) with `status: 'waiting'` until `choose` answers;
 * `auto: true` skips them. `wait(id)` polls until `succeeded` / `failed`, or with `untilGate: true` also stops at a
 * gate. Free within the monthly plan quota; beyond it every step is held on the wallet up to `budget_micro_usd`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Schema } from './_shared';

export type MusicRoomCreate = Mutable<Body<'createStudioMusicRoom'>>;
export type MusicRoomChoose = Mutable<Schema<'MusicRoomChoose'>>;
export type MusicRoomDirect = Mutable<Body<'directStudioMusicRoom'>>;
export type MusicRoomDto = Schema<'MusicRoom'>;
export type MusicRoomList = Schema<'MusicRoomList'>;
export type MusicRoomQuota = Schema<'MusicRoomQuota'>;
export type MusicRole = Schema<'MusicRole'>;
export type MusicRoomPlanVariant = Schema<'MusicRoomPlanVariant'>;
export type MusicRoomListQuery = QueryOf<'listStudioMusicRooms'>;
export type MusicPlugin = Schema<'MusicPlugin'>;
export type MusicPluginList = Schema<'MusicPluginList'>;
export type MusicInstrumentPackList = Schema<'MusicInstrumentPackList'>;
export type MusicPluginRef = Mutable<Schema<'MusicPluginRefInput'>>;
export type MusicPluginsQuery = QueryOf<'listStudioMusicRoomPlugins'>;
export type MusicRoomSetPlugin = Mutable<Body<'setStudioMusicRoomTrackPlugin'>>;
export type MusicRoomExport = Schema<'StudioExport'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface MusicRoomWriteOptions extends CallOpts {
  /** `Idempotency-Key`: a retry with the same key replays the first answer instead of starting the work again. */
  idempotencyKey?: string;
}

export interface MusicRoomWaitOptions extends CallOpts {
  /** Also return when the song waits at a gate (`status: 'waiting'`). Default false. */
  untilGate?: boolean;
  /** Delay between polls (default 10 000 ms). */
  intervalMs?: number;
  /** Give up after this long (default 1 800 000 ms = 30 min). */
  timeoutMs?: number;
}

const BASE = '/v1/studio/music-room';
const path = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The song reached a terminal state (`succeeded` or `failed`). */
export const isMusicRoomFinished = (r: Pick<MusicRoomDto, 'status'>): boolean =>
  r.status === 'succeeded' || r.status === 'failed';

export class MusicRoom {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/studio/music-room` — start a song (202; the producer plans it, then it waits at the plan gate). */
  create(body: MusicRoomCreate, opts: MusicRoomWriteOptions = {}): Promise<MusicRoomDto> {
    return this.http.json<MusicRoomDto>(BASE, {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/music-room/{id}` — advances the workflow and returns the song (another account's id is a 404). */
  get(id: string, opts: CallOpts = {}): Promise<MusicRoomDto> {
    return this.http.json<MusicRoomDto>(path(id), { ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/studio/music-room` — your songs, newest first; page with `before` while `has_more`. */
  list(query: MusicRoomListQuery = {}, opts: CallOpts = {}): Promise<MusicRoomList> {
    return this.http.json<MusicRoomList>(BASE, {
      query: { limit: query.limit, before: query.before },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/music-room/{id}/choose` — answer the open gate: `{ gate: 'plan', variant }`,
   * `{ gate: 'demo', approve: true }` or `{ gate: 'final', approve: true }` (409 `not_at_gate` otherwise).
   */
  choose(id: string, answer: MusicRoomChoose, opts: CallOpts = {}): Promise<MusicRoomDto> {
    return this.http.json<MusicRoomDto>(`${path(id)}/choose`, {
      method: 'POST',
      body: answer,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/music-room/{id}/direct` — one player re-plays its part following `direction` and the demo is
   * re-rendered (202; only at the demo or final gate).
   */
  direct(
    id: string,
    body: MusicRoomDirect,
    opts: MusicRoomWriteOptions = {},
  ): Promise<MusicRoomDto> {
    return this.http.json<MusicRoomDto>(`${path(id)}/direct`, {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/music-room/quota` — `{ plan, included, used, remaining, period_end }` for this calendar month. */
  quota(opts: CallOpts = {}): Promise<MusicRoomQuota> {
    return this.http.json<MusicRoomQuota>(`${BASE}/quota`, { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `GET /v1/studio/music-room/plugins` — the cloud plugin set (free/open-source CLAP and VST3 instruments and
   * effects that always render in the cloud), filtered by `kind` and a free-text `q`.
   */
  plugins(query: MusicPluginsQuery = {}, opts: CallOpts = {}): Promise<MusicPluginList> {
    return this.http.json<MusicPluginList>(`${BASE}/plugins`, {
      query: { kind: query.kind, q: query.q },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/studio/music-room/plugins/{format}/{pluginId}` — one cloud plugin (404 `plugin_not_found` otherwise). */
  plugin(
    format: MusicPlugin['format'],
    pluginId: string,
    opts: CallOpts = {},
  ): Promise<MusicPlugin> {
    return this.http.json<MusicPlugin>(
      `${BASE}/plugins/${encodeURIComponent(format)}/${encodeURIComponent(pluginId)}`,
      { ext: opts.ext, signal: opts.signal },
    );
  }

  /**
   * `GET /v1/studio/music-room/instruments` — SFZ instrument packs for the desktop live preview (MR-46b): per id a
   * 1 h signed URL, sha256, the SFZ inside the pack, licence/credit and the GM drum `note_map`; unknown ids in
   * `missing`. Omit `ids` for every pack. Free.
   */
  instruments(ids: string[] = [], opts: CallOpts = {}): Promise<MusicInstrumentPackList> {
    return this.http.json<MusicInstrumentPackList>(`${BASE}/instruments`, {
      query: { ids: ids.length ? ids.join(',') : undefined },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/music-room/{id}/plugin` — put an instrument plugin (+ up to 4 effects, one format) on one
   * player's track, or `plugin: null` to go back to the instrument (202; re-renders at the demo or final gate).
   */
  setTrackPlugin(
    id: string,
    body: MusicRoomSetPlugin,
    opts: MusicRoomWriteOptions = {},
  ): Promise<MusicRoomDto> {
    return this.http.json<MusicRoomDto>(`${path(id)}/plugin`, {
      method: 'POST',
      body,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
      noRetry: !opts.idempotencyKey,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/studio/music-room/{id}/export?format=dawproject` — build a `.dawproject` (DAWproject 1.0: MIDI parts with
   * their plugin chains and states, audio clips, rendered stems, tempo map) in the background (202, free). Poll
   * `exports.wait(export.id)` until `succeeded`, then download `url`.
   */
  exportProject(id: string, opts: CallOpts = {}): Promise<MusicRoomExport> {
    return this.http.json<MusicRoomExport>(`${path(id)}/export`, {
      method: 'POST',
      query: { format: 'dawproject' },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Poll `get` every `intervalMs` (default 10 s) until the song `succeeded` or `failed` (a failed one resolves too —
   * check `status` / `error`), or with `untilGate: true` until it waits at a gate. Throws after `timeoutMs`
   * (default 30 min) or when `signal` aborts.
   */
  async wait(id: string, opts: MusicRoomWaitOptions = {}): Promise<MusicRoomDto> {
    const interval = opts.intervalMs ?? 10_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 1_800_000);
    for (;;) {
      const r = await this.get(id, opts);
      if (isMusicRoomFinished(r) || (opts.untilGate && r.status === 'waiting')) return r;
      if (Date.now() + interval > deadline)
        throw new Error(`codai: music room ${id} did not finish in time (phase ${r.phase})`);
      await abortableSleep(interval, opts.signal);
    }
  }
}

/** codai Studio namespace (`client.studio.musicRoom`). */
export interface Studio {
  /** Music Room: a team of role agents makes a song with three approval gates. */
  readonly musicRoom: MusicRoom;
}
