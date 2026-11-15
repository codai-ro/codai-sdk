/** `/v1/devices/*` — devices bound to your account + the aggregated dispatch inbox. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type Device = Schema<'DeviceListItem'>;
export type DevicePatch = Mutable<Body<'updateDevice'>>;
export type DevicePatched = Reply<'updateDevice'>;
export type DispatchInbox = Reply<'getMyDispatchInbox'>;
export type DevicePluginItem = Schema<'DevicePluginItem'>;
export type DevicePluginInventories = Reply<'listDevicePlugins'>;
export type DevicePluginsPut = Mutable<Body<'putDevicePlugins'>>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Devices {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/devices` — most recently seen first. */
  async list(opts: CallOpts = {}): Promise<Device[]> {
    const raw = await this.http.json<Reply<'listDevices'>>('/v1/devices', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.devices ?? [])];
  }

  /** `PATCH /v1/devices/{id}` — push token and/or capabilities. */
  update(id: string, body: DevicePatch, opts: CallOpts = {}): Promise<DevicePatched> {
    return this.http.json<DevicePatched>(`/v1/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `DELETE /v1/devices/{id}` */
  delete(id: string, opts: CallOpts = {}): Promise<Reply<'deleteDevice'>> {
    return this.http.json<Reply<'deleteDevice'>>(`/v1/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/devices/plugins` — MR-40: installed CLAP/VST3 plugins per device (validator-failed ones left out). */
  plugins(opts: CallOpts = {}): Promise<DevicePluginInventories> {
    return this.http.json<DevicePluginInventories>('/v1/devices/plugins', { ext: opts.ext, signal: opts.signal });
  }

  /** `PUT /v1/devices/{id}/plugins` — MR-40: replace a device's plugin inventory after a scan (no local paths). */
  setPlugins(id: string, body: DevicePluginsPut, opts: CallOpts = {}): Promise<Reply<'putDevicePlugins'>> {
    return this.http.json<Reply<'putDevicePlugins'>>(`/v1/devices/${encodeURIComponent(id)}/plugins`, {
      method: 'PUT',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/keys/self/revoke` — the API key this client uses revokes ITSELF (sign out).
   * Every later call with it fails with 401.
   */
  revokeSelfKey(opts: CallOpts = {}): Promise<Reply<'revokeSelfKey'>> {
    return this.http.json<Reply<'revokeSelfKey'>>('/v1/keys/self/revoke', {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `GET /v1/devices/me/dispatch?limit=` — pending controls dispatched at the
   * calling device (`x-codai-device` required) across all owned sessions.
   */
  dispatchInbox(query: { limit?: number } = {}, opts: CallOpts = {}): Promise<DispatchInbox> {
    return this.http.json<DispatchInbox>('/v1/devices/me/dispatch', {
      query: { limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
