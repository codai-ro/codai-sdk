import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(payload: unknown, status = 200, contentType = 'application/json') {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return new Response(text, { status, headers: { 'content-type': contentType } });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });
const route = (s: Seen) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`;

describe('client.hosts', () => {
  it('list returns caps and environment_id from the presence rows', async () => {
    capture({
      hosts: [
        {
          device_id: 'd1',
          name: 'iPhone Ana',
          platform: 'ios',
          os: 'ios',
          hostname: 'iPhone Ana',
          roots: [],
          caps: ['iphone', 'video'],
          environment_id: '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
          since: 1,
          last_seen: 2,
        },
      ],
    });
    const [h] = await mk().hosts.list();
    expect(h!.caps).toEqual(['iphone', 'video']);
    expect(h!.environment_id).toBe('7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f');
  });

  it('iphone() posts op iphone with { tool, args } and returns the typed result', async () => {
    const seen = capture({
      req_id: 'r1',
      ok: true,
      result: { data: { tapped: true }, image: 'data:image/jpeg;base64,AAA' },
      error: null,
    });
    const r = await mk().hosts.iphone('d1', 'tap', { x: 200, y: 640 }, { timeoutMs: 20_000 });
    expect(route(seen[0]!)).toBe('POST /v1/hosts/d1/exec');
    expect(seen[0]!.body).toEqual({
      op: 'iphone',
      args: { tool: 'tap', args: { x: 200, y: 640 } },
      timeout_ms: 20_000,
    });
    expect(r.result?.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(r.result?.data).toEqual({ tapped: true });
  });

  it('iphone() omits args when none are given', async () => {
    const seen = capture({ req_id: 'r2', ok: true, result: { data: {} }, error: null });
    await mk().hosts.iphone('d1', 'screen');
    expect(seen[0]!.body).toEqual({ op: 'iphone', args: { tool: 'screen' } });
  });

  it('iphone() rejects a malformed tool name without calling the gateway', async () => {
    const seen = capture({});
    await expect(mk().hosts.iphone('d1', 'Tap-Now')).rejects.toThrow(/\^\[a-z_\]/);
    expect(seen).toHaveLength(0);
  });

  it('stream() sends caps and env as query params', async () => {
    const seen = capture(
      'event: hello\ndata: {"device_id":"d1","heartbeat_ms":15000}\n\n',
      200,
      'text/event-stream',
    );
    const events = [];
    for await (const e of mk().hosts.stream({
      os: 'ios',
      caps: ['iphone', 'video'],
      environmentId: '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    }))
      events.push(e);
    expect(events[0]!.event).toBe('hello');
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe('/v1/hosts/stream');
    expect(url.searchParams.get('caps')).toBe('iphone,video');
    expect(url.searchParams.get('env')).toBe('7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f');
    expect(url.searchParams.get('os')).toBe('ios');
  });
});
