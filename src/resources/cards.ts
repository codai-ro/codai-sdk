/**
 * `/v1/cards/*` — server-side DATA for typed cards (`@codai/cards`). Every JSON method returns `{ block, provenance }`
 * where `block` is already a valid card block (weather, places, map, metric, table or links) that can be dropped into
 * a card unchanged; `staticMap` returns PNG bytes.
 *
 * Weather and FX are free. Places, geocode and static maps are Google calls billed to your usage at Google's list price
 * (Places text/nearby $0.032, geocoding $0.005, static map $0.002) and limited per user per UTC day (200 Places,
 * 500 maps); `unfurl` and `product` are free but share a limit of 500 fetches per day (cache hits do not count). Maps methods throw a 503
 * `CodaiError` with code `maps_not_configured` when the gateway has no maps key — fall back to text.
 *
 * `render` turns a `chart` or `qr` block into a PNG or SVG on the gateway (free, 2000 per day) for surfaces that
 * cannot draw cards; Mermaid / math blocks throw a 422 `CodaiError` with code `render_unsupported`.
 *
 * `route` is Google Routes travel time (billed: $0.010 traffic-aware driving, $0.005 walk/bike/transit; maps limit).
 * `track` follows a parcel (Sameday live; FAN Courier, Cargus, DPD only when the gateway has their contract) and
 * `efactura` lists your fiscal documents issued through Brivio with their ANAF e-Factura status; both free.
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
export type CardsRouteParams = QueryOf<'cardsRoute'>;
export type CardsTrackParams = QueryOf<'cardsTrack'>;
export type CardsEfacturaParams = QueryOf<'cardsEfactura'>;
export type CardsUnfurlBody = Body<'cardsUnfurl'>;
export type CardsProductBody = Body<'cardsProduct'>;
export type CardsRenderBody = Body<'cardsRender'>;
export type CardsWeatherResponse = Reply<'cardsWeather'>;
export type CardsPlacesResponse = Reply<'cardsPlaces'>;
export type CardsGeocodeResponse = Reply<'cardsGeocode'>;
export type CardsFxResponse = Reply<'cardsFx'>;
export type CardsRouteResponse = Reply<'cardsRoute'>;
export type CardsTrackResponse = Reply<'cardsTrack'>;
export type CardsEfacturaResponse = Reply<'cardsEfactura'>;
export type CardsUnfurlResponse = Reply<'cardsUnfurl'>;
export type CardsProductResponse = Reply<'cardsProduct'>;

/** A rendered static map: PNG bytes plus the attribution the gateway sent (`x-codai-attribution`). */
export interface CardsStaticMap {
  bytes: Uint8Array;
  contentType: string;
  attribution: string | null;
}

/** A rendered card block: image bytes, `image/png` or `image/svg+xml`, and the pixel size (`x-codai-render-size`). */
export interface CardsRendered {
  bytes: Uint8Array;
  contentType: string;
  width: number | null;
  height: number | null;
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
   * `GET /v1/cards/route` — travel time from Google Routes: `route` { mode, durationS, staticDurationS, distanceM,
   * polyline } and a `map` block. `origin`/`destination` as "lat,lng" or `from`/`to` as addresses; `mode` drive
   * (traffic-aware, default), walk, bicycle, transit, two_wheeler. Billed per call; both null when no route exists.
   */
  route(params: CardsRouteParams, opts: CallOpts = {}): Promise<CardsRouteResponse> {
    return this.get('/v1/cards/route', params, opts);
  }

  /**
   * `GET /v1/cards/track` — parcel history as a `timeline` block plus `result` (carrier, configured, found,
   * delivered, events, trackingUrl). `carrier` (sameday | fan | cargus | dpd) is guessed from the AWB when omitted;
   * carriers without gateway credentials answer `configured: false` with only the tracking link. Free.
   */
  track(params: CardsTrackParams, opts: CallOpts = {}): Promise<CardsTrackResponse> {
    return this.get('/v1/cards/track', params, opts);
  }

  /**
   * `GET /v1/cards/efactura` — your fiscal documents issued through Brivio with their ANAF e-Factura status
   * (`documents[]` + a `table` block, null when there are none). Free.
   */
  efactura(params: CardsEfacturaParams = {}, opts: CallOpts = {}): Promise<CardsEfacturaResponse> {
    return this.get('/v1/cards/efactura', params, opts);
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

  /**
   * `POST /v1/cards/product` — `products` block with one item from a public https product page's schema.org
   * `Product` JSON-LD (or OpenGraph product tags): name, image, price + currency (lowest offer), old price, rating
   * (0–5), reviews, seller, availability badge in `lang` (en default). Only what the page states; never sponsored.
   * SSRF-guarded like `unfurl`, cached 6 h. No product data throws 422 `product_not_found`.
   */
  product(url: string, lang?: 'en' | 'ro', opts: CallOpts = {}): Promise<CardsProductResponse> {
    const body: CardsProductBody = lang ? { url, lang } : { url };
    return this.http.json<CardsProductResponse>('/v1/cards/product', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/cards/render` — renders a `chart` or `qr` block to `format` (`png` default, or `svg`) at
   * `width` x `height` CSS px (64–1200, defaults 480 x 300; QR is square) times `scale` (1–3, PNG only).
   * Other block types (Mermaid `diagram`, `math`, …) throw 422 `render_unsupported`. Free; 2000 renders per day.
   */
  async render(body: CardsRenderBody, opts: CallOpts = {}): Promise<CardsRendered> {
    const res = await this.http.request('/v1/cards/render', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
    const size = /^(\d+)x(\d+)$/.exec(res.headers.get('x-codai-render-size') ?? '');
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'image/png',
      width: size ? Number(size[1]) : null,
      height: size ? Number(size[2]) : null,
    };
  }
}
