/**
 * `/v1/settings` — account-level settings shared by every device of the account (per user, not per key). Reads
 * always return the full object with defaults applied; writes deep-merge a partial and are validated strictly.
 *
 * Optimistic concurrency: pass `{ version }` from the last read to `update()`. On a mismatch the gateway answers 409
 * `version_conflict` and nothing is written; the thrown `CodaiError` carries the current state in
 * `(err.body as SettingsConflict).current` (see {@link settingsConflictCurrent}).
 */
import { CodaiError, type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply, type Schema } from './_shared';

export type SettingsResponse = Reply<'getSettings'>;
export type UserSettings = Schema<'UserSettings'>;
export type TranscriptsSettings = Schema<'TranscriptsSettings'>;
/** Look & feel synced across desktop, phone and hub: theme id, mode, accent, skin, AMOLED, UI font. */
export type AppearanceSettings = Schema<'AppearanceSettings'>;
export type SettingsConflict = Schema<'SettingsConflict'>;

type Mutable<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * A deep partial of {@link UserSettings}: only the fields to change (`language: null` = auto-detect), e.g.
 * `{ appearance: { accent: 'teal', mode: 'dark' } }`.
 */
export type SettingsPatch = {
  transcripts?: Mutable<TranscriptsSettings>;
  appearance?: Mutable<AppearanceSettings>;
};

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
type UpdateOpts = CallOpts & { version?: number };

/** The `current` state of a 409 `version_conflict` thrown by `settings.update`, else null. */
export function settingsConflictCurrent(err: unknown): SettingsResponse | null {
  if (!(err instanceof CodaiError) || err.status !== 409 || err.code !== 'version_conflict')
    return null;
  const current = (err.body as Partial<SettingsConflict> | null)?.current;
  return current ?? null;
}

export class Settings {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/settings` — full settings with defaults; `version` 0 / `updatedAt` null until the first write. */
  get(opts: CallOpts = {}): Promise<SettingsResponse> {
    return this.http.json<SettingsResponse>('/v1/settings', { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `PATCH /v1/settings` — deep-merge `partial` into the stored settings. With `opts.version` the write is
   * conditional (409 `version_conflict` on a mismatch). Unknown keys / invalid values throw a 400 `CodaiError`.
   */
  update(partial: SettingsPatch, opts: UpdateOpts = {}): Promise<SettingsResponse> {
    return this.http.json<SettingsResponse>('/v1/settings', {
      method: 'PATCH',
      body: { settings: partial, ...(opts.version !== undefined ? { version: opts.version } : {}) },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
