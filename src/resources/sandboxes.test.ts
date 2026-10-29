import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown; headers: Record<string, string> };

function capture(payload: unknown, status = 200, contentType = 'application/json') {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return new Response(status === 204 ? null : text, {
        status,
        headers: { 'content-type': contentType, 'x-sha256': 'abc' },
      });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });
const route = (s: Seen) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`;

const receipt = {
  image_digest: 'sha256:x',
  template: 'codai-base',
  input_sha256: 'i',
  command_sha256: 'c',
  outputs: [],
  generation_before: 0,
  generation_after: 1,
};

describe('client.sandboxes', () => {
  it('creates with a JSON body and lists / retrieves', async () => {
    const seen = capture({ id: 'sb1', object: 'sandbox', status: 'running' }, 201);
    const c = mk();
    const sb = await c.sandboxes.create({
      ttl_seconds: 600,
      egress: { mode: 'preset', preset: 'pypi' },
    });
    expect(sb.id).toBe('sb1');
    await c.sandboxes.list();
    await c.sandboxes.list({ status: 'running' });
    await c.sandboxes.retrieve('sb1');
    expect(seen.map(route)).toEqual([
      'POST /v1/sandboxes',
      'GET /v1/sandboxes',
      'GET /v1/sandboxes?status=running',
      'GET /v1/sandboxes/sb1',
    ]);
    expect(seen[0]!.body).toEqual({ ttl_seconds: 600, egress: { mode: 'preset', preset: 'pypi' } });
  });

  it('execs and sends Idempotency-Key only when given', async () => {
    const seen = capture({
      exit_code: 0,
      stdout: 'hi\n',
      stderr: '',
      timed_out: false,
      duration_ms: 12,
      receipt,
    });
    const c = mk();
    const r = await c.sandboxes.exec('sb1', { shell: 'echo hi' });
    expect(r.stdout).toBe('hi\n');
    await c.sandboxes.exec(
      'sb1',
      { language: 'python', code: 'print(1)' },
      { idempotencyKey: 'k1' },
    );
    expect(seen.map(route)).toEqual(['POST /v1/sandboxes/sb1/exec', 'POST /v1/sandboxes/sb1/exec']);
    expect(seen[0]!.body).toEqual({ shell: 'echo hi' });
    expect(seen[0]!.headers['Idempotency-Key']).toBeUndefined();
    expect(seen[1]!.headers['Idempotency-Key']).toBe('k1');
  });

  it('streams exec events and stops after exit', async () => {
    const sse =
      'data: {"type":"start","exec_id":"e1","instance":"i","restored":"hot","restore_ms":3}\n\n' +
      ': ping\n\n' +
      'data: {"type":"stdout","data":"ș"}\n\n' +
      'data: {"type":"stderr","data":"warn"}\n\n' +
      `data: ${JSON.stringify({ type: 'exit', exit_code: 0, timed_out: false, duration_ms: 5, cpu_ms: 2, generation: 1, workspace_bytes: 10, changed: ['out/a.pdf'], receipt })}\n\n` +
      'data: {"type":"stdout","data":"after"}\n\n';
    const seen = capture(sse, 200, 'text/event-stream');
    const types: string[] = [];
    let out = '';
    for await (const ev of mk().sandboxes.execStream('sb1', { cmd: ['python3', 'a.py'] })) {
      types.push(ev.type);
      if (ev.type === 'stdout') out += ev.data;
    }
    expect(types).toEqual(['start', 'stdout', 'stderr', 'exit']);
    expect(out).toBe('ș');
    expect(route(seen[0]!)).toBe('POST /v1/sandboxes/sb1/exec');
    expect(seen[0]!.headers.Accept).toBe('text/event-stream');
    expect(seen[0]!.body).toEqual({ cmd: ['python3', 'a.py'] });
  });

  it('puts, gets and lists files with per-segment encoding', async () => {
    const seen = capture({ path: 'in/a b.txt', bytes: 2, sha256: 'abc', generation: 1 });
    const c = mk();
    const w = await c.sandboxes.files.put('sb1', '/in/a b.txt', 'hi');
    expect(w.generation).toBe(1);
    const f = await c.sandboxes.files.get('sb1', 'out/act.pdf');
    expect(f.sha256).toBe('abc');
    expect(f.bytes).toBeInstanceOf(Uint8Array);
    await c.sandboxes.files.list('sb1', 'out');
    expect(seen.map(route)).toEqual([
      'PUT /v1/sandboxes/sb1/files/in/a%20b.txt',
      'GET /v1/sandboxes/sb1/files/out/act.pdf',
      'GET /v1/sandboxes/sb1/files?path=out',
    ]);
    expect(seen[0]!.body).toBeInstanceOf(Uint8Array);
    expect(seen[0]!.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('artifacts, snapshot, delete and run', async () => {
    const seen = capture({ data: [] });
    const c = mk();
    await c.sandboxes.artifacts('sb1');
    await c.sandboxes.snapshot('sb1', { name: 'v1' });
    await c.sandboxes.delete('sb/1');
    await c.sandboxes.run(
      { shell: 'python3 make.py', inputs: [{ path: 'data.csv', base64: 'YQ==' }] },
      { idempotencyKey: 'run-1' },
    );
    expect(seen.map(route)).toEqual([
      'GET /v1/sandboxes/sb1/artifacts',
      'POST /v1/sandboxes/sb1/snapshot',
      'DELETE /v1/sandboxes/sb%2F1',
      'POST /v1/sandboxes/run',
    ]);
    expect(seen[1]!.body).toEqual({ name: 'v1' });
    expect(seen[3]!.body).toEqual({
      shell: 'python3 make.py',
      inputs: [{ path: 'data.csv', base64: 'YQ==' }],
    });
    expect(seen[3]!.headers['Idempotency-Key']).toBe('run-1');
  });

  it('creates a v2 sandbox with backend + template', async () => {
    const seen = capture(
      { id: 'sb2', object: 'sandbox', status: 'running', backend: 'v2', restored: true },
      201,
    );
    const sb = await mk().sandboxes.create({ backend: 'v2', template: 'brivio-acte' });
    expect(sb.backend).toBe('v2');
    expect(sb.restored).toBe(true);
    expect(seen[0]!.body).toEqual({ backend: 'v2', template: 'brivio-acte' });
  });

  it('v2: runCode, resetKernel, pause, resume, fork, preview map to snake_case bodies', async () => {
    const seen = capture({
      stdout: '',
      stderr: '',
      result: '2',
      error: null,
      duration_ms: 3,
      execution_count: 1,
      kernel_restarted: false,
    });
    const c = mk();
    const r = await c.sandboxes.runCode('sb2', { code: '1+1', timeoutSeconds: 30 });
    expect(r.result).toBe('2');
    await c.sandboxes.runCode('sb2', { code: 'x' });
    await c.sandboxes.resetKernel('sb2');
    await c.sandboxes.pause('sb2');
    await c.sandboxes.resume('sb2');
    await c.sandboxes.fork('sb2', { count: 2, ttlSeconds: 600 });
    await c.sandboxes.fork('sb2', { count: 1 });
    await c.sandboxes.preview('sb2', { port: 3000, ttlSeconds: 300 });
    await c.sandboxes.preview('sb2', { port: 6080 });
    expect(seen.map(route)).toEqual([
      'POST /v1/sandboxes/sb2/run_code',
      'POST /v1/sandboxes/sb2/run_code',
      'POST /v1/sandboxes/sb2/kernel/reset',
      'POST /v1/sandboxes/sb2/pause',
      'POST /v1/sandboxes/sb2/resume',
      'POST /v1/sandboxes/sb2/fork',
      'POST /v1/sandboxes/sb2/fork',
      'POST /v1/sandboxes/sb2/preview',
      'POST /v1/sandboxes/sb2/preview',
    ]);
    expect(seen[0]!.body).toEqual({ code: '1+1', timeout_seconds: 30 });
    expect(seen[1]!.body).toEqual({ code: 'x' });
    expect(seen[5]!.body).toEqual({ count: 2, ttl_seconds: 600 });
    expect(seen[6]!.body).toEqual({ count: 1 });
    expect(seen[7]!.body).toEqual({ port: 3000, ttl_seconds: 300 });
    expect(seen[8]!.body).toEqual({ port: 6080 });
  });

  it('ptyUrl builds the wss URL with cols/rows and validates them', () => {
    const c = mk();
    expect(c.sandboxes.ptyUrl('sb 1', { cols: 120, rows: 32 })).toBe(
      'wss://ai.codai.ro/v1/sandboxes/sb%201/pty?cols=120&rows=32',
    );
    expect(c.sandboxes.ptyUrl('sb1')).toBe('wss://ai.codai.ro/v1/sandboxes/sb1/pty');
    expect(c.sandboxes.ptyUrl('sb1', { baseUrl: 'http://localhost:8787/' })).toBe(
      'ws://localhost:8787/v1/sandboxes/sb1/pty',
    );
    expect(() => c.sandboxes.ptyUrl('sb1', { cols: 0 })).toThrow(RangeError);
    expect(() => c.sandboxes.ptyUrl('sb1', { rows: 1001 })).toThrow(RangeError);
    expect(() => c.sandboxes.ptyUrl('sb1', { cols: 80.5 })).toThrow(RangeError);
  });
});
