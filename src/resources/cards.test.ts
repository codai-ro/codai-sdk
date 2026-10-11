import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type Call = { url: string; method: string; body: unknown };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: String(init.method ?? 'GET'), body: init.body });
      return replies.shift()!;
    }),
  );
  return calls;
}

const weather = {
  block: { type: 'weather', location: { name: 'București', lat: 44.43, lng: 26.1 } },
  provenance: { source: 'met_norway', cached: true, fetchedAt: '2026-10-11T08:00:00Z' },
};

describe('cards', () => {
  it('weather() sends lat/lng/name as query and returns { block, provenance }', async () => {
    const calls = stub([json(weather)]);
    const r = await mk().cards.weather({ lat: 44.43, lng: 26.1, name: 'București' });
    expect(calls[0]!.method).toBe('GET');
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/v1/cards/weather');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      lat: '44.43',
      lng: '26.1',
      name: 'București',
    });
    expect(r.block).toEqual(weather.block);
    expect(r.provenance).toEqual(weather.provenance);
  });

  it('places() passes text-search params and drops undefined ones', async () => {
    const reply = {
      block: { type: 'places', items: [] },
      provenance: { source: 'google_places', sku: 'google-places-text', costMicroUsd: 32000 },
    };
    const calls = stub([json(reply)]);
    const r = await mk().cards.places({ q: 'cafea', lat: 44.4, lng: 26.1, limit: 5, region: 'RO' });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/v1/cards/places');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      q: 'cafea',
      lat: '44.4',
      lng: '26.1',
      limit: '5',
      region: 'RO',
    });
    expect(r.provenance).toMatchObject({ costMicroUsd: 32000 });
  });

  it('geocode() returns the map block and raw results', async () => {
    const reply = {
      block: { type: 'map', markers: [{ lat: 44.43, lng: 26.1 }] },
      results: [{ formattedAddress: 'Piața Victoriei', lat: 44.43, lng: 26.1 }],
      provenance: { source: 'google_geocoding' },
    };
    const calls = stub([json(reply)]);
    const r = await mk().cards.geocode({ address: 'Piața Victoriei' });
    expect(new URL(calls[0]!.url).pathname).toBe('/v1/cards/geocode');
    expect(new URL(calls[0]!.url).searchParams.get('address')).toBe('Piața Victoriei');
    expect(r.results).toHaveLength(1);
  });

  it('staticMap() returns PNG bytes, content type and attribution', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const calls = stub([
      new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png', 'x-codai-attribution': 'Google Maps' },
      }),
    ]);
    const r = await mk().cards.staticMap({
      center: '44.43,26.10',
      zoom: 14,
      markers: '44.43,26.10,A',
    });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/v1/cards/static-map');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      center: '44.43,26.10',
      zoom: '14',
      markers: '44.43,26.10,A',
    });
    expect(Array.from(r.bytes)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(r.contentType).toBe('image/png');
    expect(r.attribution).toBe('Google Maps');
  });

  it('fx() works without params and with a pair', async () => {
    const table = { block: { type: 'table' }, provenance: { source: 'bnr', date: '2026-10-10' } };
    const metric = { block: { type: 'metric' }, provenance: { source: 'ecb' } };
    const calls = stub([json(table), json(metric)]);
    const c = mk();
    await c.cards.fx();
    await c.cards.fx({ source: 'ecb', from: 'EUR', to: 'USD', amount: 100 });
    expect(new URL(calls[0]!.url).search).toBe('');
    expect(Object.fromEntries(new URL(calls[1]!.url).searchParams)).toEqual({
      source: 'ecb',
      from: 'EUR',
      to: 'USD',
      amount: '100',
    });
  });

  it('unfurl() POSTs { url } and surfaces gateway errors as CodaiError', async () => {
    const reply = {
      block: {
        type: 'links',
        variant: 'preview',
        items: [{ url: 'https://codai.ro', title: 'codai' }],
      },
      provenance: { source: 'page', url: 'https://codai.ro', cached: false },
    };
    const calls = stub([
      json(reply),
      json(
        { error: { message: 'blocked', type: 'invalid_request_error', code: 'unfurl_blocked' } },
        400,
      ),
    ]);
    const c = mk();
    const r = await c.cards.unfurl('https://codai.ro');
    expect(calls[0]!.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/v1/cards/unfurl');
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ url: 'https://codai.ro' });
    expect(r.block).toEqual(reply.block);
    const err = await c.cards.unfurl('http://169.254.169.254').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(400);
    expect((err as CodaiError).code).toBe('unfurl_blocked');
  });
});
