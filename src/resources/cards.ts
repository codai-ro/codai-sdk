/**
 * `/v1/cards/*` — server-side DATA for typed cards (`@codai/cards`). Every JSON method returns `{ block, provenance }`
 * where `block` is already a valid card block (weather, places, map, metric, table or links) that can be dropped into
 * a card unchanged; `staticMap` returns PNG bytes.
 *
 * Weather and FX are free. Places, geocode and static maps are Google calls billed to your usage at Google's list price
 * (Places text/nearby $0.032, geocoding $0.005, static map $0.002) and limited per user per UTC day (200 Places,
 * 500 maps); `unfurl` is free but limited to 500 fetches per day (cache hits do not count). Maps methods throw a 503
 * `CodaiError` with code `maps_not_configured` when the gateway has no maps key — fall back to text.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type QueryOf, type Reply, type Schema } from './_shared';

/** `{ block, provenance }` (+ `results` for geocode) as returned by every JSON card endpoint. */
export type CardDataResponse = Schema<'CardDataResponse'>;
export type CardsWeatherParams = QueryOf<'cardsWeather'>;
export type CardsPlacesParams = QueryOf<'cardsPlaces'>;
export type CardsGeocodeParams = QueryOf<'cardsGeocode'>;
export type CardsStaticMapParams = QueryOf<'cardsStaticMap'>;
export type CardsFxParams = QueryOf<'cardsFx'>;
export type CardsUnfurlBody = Body<'cardsUnfurl'>;
export type CardsWeatherResponse = Reply<'cardsWeather'>;
export type CardsPlacesResponse = Reply<'cardsPlaces'>;
export type CardsGeocodeResponse = Reply<'cardsGeocode'>;
export type CardsFxResponse = Reply<'cardsFx'>;
export type CardsUnfurlResponse = Reply<'cardsUnfurl'>;

/** A rendered static map: PNG bytes plus the attribution the gateway sent (`x-codai-attribution`). */
export interface CardsStaticMap {
  bytes: Uint8Array;
  contentType: string;
  attribution: string | null;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
type Q = Record<string, string | number | boolean | undefined | null>;

export class Cards {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, query: object, opts: CallOpts): Promise<T> {
    return this.http.json<T>(path, { query: query as Q, ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/cards/weather` — `weather` block from MET Norway (cached 30–60 min per 0.01°, free). */
  weather(params: CardsWeatherParams, opts: CallOpts = {}): Promise<CardsWeatherResponse> {
    return this.get('/v1/cards/weather', params, opts);
  }

  /**
   * `GET /v1/cards/places` — `places` block from Google Places: Text Search with `q` (biased to `lat`/`lng`/`radius`),
   * Nearby Search without it. Billed per call; `block` is null when nothing matched.
   */
  places(params: CardsPlacesParams, opts: CallOpts = {}): Promise<CardsPlacesResponse> {
    return this.get('/v1/cards/places', params, opts);
  }

  /** `GET /v1/cards/geocode` — `map` block (≤ 5 markers) plus raw `results` (Google Geocoding, billed). */
  geocode(params: CardsGeocodeParams, opts: CallOpts = {}): Promise<CardsGeocodeResponse> {
    return this.get('/v1/cards/geocode', params, opts);
  }

  /**
   * `GET /v1/cards/static-map` — PNG from Google Maps Static proxied through the gateway (no maps key on the client).
   * Needs `center` or `markers` (`lat,lng[,L]` joined by `|`); ≤ 640×400 points. Billed per call.
   */
  async staticMap(params: CardsStaticMapParams, opts: CallOpts = {}): Promise<CardsStaticMap> {
    const res = await this.http.request('/v1/cards/static-map', {
      query: params as Q,
      ext: opts.ext,
      signal: opts.signal,
    });
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'image/png',
      attribution: res.headers.get('x-codai-attribution'),
    };
  }

  /**
   * `GET /v1/cards/fx` — BNR (default) or ECB reference rates: a `metric` block with `from`+`to`, otherwise a `table`
   * block against `quote`, optionally limited to `symbols` (comma-separated). Free.
   */
  fx(params: CardsFxParams = {}, opts: CallOpts = {}): Promise<CardsFxResponse> {
    return this.get('/v1/cards/fx', params, opts);
  }

  /**
   * `POST /v1/cards/unfurl` — `links` block (variant `preview`) for a public https page; SSRF-guarded, cached 24 h.
   * Private targets throw 400 `unfurl_blocked`, non-https pages 422 `unfurl_not_https`.
   */
  unfurl(url: string, opts: CallOpts = {}): Promise<CardsUnfurlResponse> {
    const body: CardsUnfurlBody = { url };
    return this.http.json<CardsUnfurlResponse>('/v1/cards/unfurl', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
