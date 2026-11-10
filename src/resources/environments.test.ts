import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown; contentType: string | null };

function capture(payload: unknown, status = 200) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      const ct = headers.get('content-type');
      seen.push({
        url,
        method: init.method ?? 'GET',
        body:
          typeof init.body === 'string' && ct?.includes('json') ? JSON.parse(init.body) : init.body,
        contentType: ct,
      });
      return new Response(JSON.stringify(payload), { status });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });
const route = (s: Seen) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`;
const ENV = 'e1';

describe('client.environments REST exec', () => {
  it('exec posts the body and returns the flattened shell result', async () => {
    const seen = capture({ ok: true, exit_code: 0, stdout: 'hi\n', stderr: '' });
    const r = await mk().environments.exec(ENV, { command: 'echo hi', timeout_ms: 5000 });
    expect(r.exit_code).toBe(0);
    expect(route(seen[0]!)).toBe('POST /v1/environments/e1/exec');
    expect(seen[0]!.body).toEqual({ command: 'echo hi', timeout_ms: 5000 });
  });

  it('files.list sends path only when given', async () => {
    const seen = capture({ path: '/w', entries: [], truncated: false });
    const c = mk();
    await c.environments.files.list(ENV);
    await c.environments.files.list(ENV, '/w/src');
    expect(seen.map(route)).toEqual([
      'GET /v1/environments/e1/files',
      'GET /v1/environments/e1/files?path=%2Fw%2Fsrc',
    ]);
  });

  it('files.get encodes each segment of the absolute path and passes max_bytes', async () => {
    const seen = capture({ path: '/w/a b.txt', content: 'x', size: 1, truncated: false });
    const r = await mk().environments.files.get(ENV, '/w/a b.txt', { maxBytes: 100 });
    expect(r.content).toBe('x');
    expect(route(seen[0]!)).toBe('GET /v1/environments/e1/files/w/a%20b.txt?max_bytes=100');
  });

  it('files.put sends the raw text body', async () => {
    const seen = capture({ path: '/w/n.txt', bytes: 5, created: true });
    const r = await mk().environments.files.put(ENV, '/w/n.txt', 'hello');
    expect(r.created).toBe(true);
    expect(route(seen[0]!)).toBe('PUT /v1/environments/e1/files/w/n.txt');
    expect(seen[0]!.body).toBe('hello');
    expect(seen[0]!.contentType).toContain('text/plain');
  });

  it('jobs.start and jobs.get', async () => {
    const seen = capture({ job_id: 7, label: 'pnpm test' }, 201);
    const c = mk();
    const started = await c.environments.jobs.start(ENV, { command: 'pnpm test' });
    expect(started.job_id).toBe(7);
    await c.environments.jobs.get(ENV, 7, { since: 10, tail: 50 });
    expect(seen.map(route)).toEqual([
      'POST /v1/environments/e1/jobs',
      'GET /v1/environments/e1/jobs/7?since=10&tail=50',
    ]);
    expect(seen[0]!.body).toEqual({ command: 'pnpm test' });
  });
});
