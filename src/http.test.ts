import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodaiError, extensionHeaders, frameJson, HttpClient, readSse } from './http';

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(handler);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const sseResponse = (text: string, headers: Record<string, string> = {}) =>
  new Response(new Blob([text]).stream(), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...headers },
  });

afterEach(() => vi.unstubAllGlobals());

const client = () =>
  new HttpClient({
    apiKey: 'codai_test',
    baseUrl: 'https://gw.test/',
    timeoutMs: 5000,
    maxRetries: 0,
  });

describe('HttpClient', () => {
  it('sends the bearer header, JSON content-type and builds the URL from baseUrl', async () => {
    const fetchFn = mockFetch(async () => new Response('{}', { status: 200 }));
    await client().request('/v1/models', { body: { a: 1 } });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://gw.test/v1/models');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer codai_test');
    expect(h['Content-Type']).toBe('application/json');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });

  it('GET without a body has no Content-Type and serialises query (dropping undefined)', async () => {
    const fetchFn = mockFetch(async () => new Response('{}', { status: 200 }));
    await client().request('/v1/tasks', { query: { limit: 5, cursor: undefined, applied: true } });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://gw.test/v1/tasks?limit=5&applied=1');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('maps extension bags to X-Codai-* headers (defaults < per-call)', async () => {
    const fetchFn = mockFetch(async () => new Response('{}', { status: 200 }));
    const http = new HttpClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      timeoutMs: 1000,
      maxRetries: 0,
      defaults: { sessionId: 'sess-default', device: 'dev-1', client: 'codai-cli/1.0' },
    });
    await http.request('/v1/chat/completions', {
      body: {},
      ext: {
        sessionId: 'sess-call',
        effort: 'high',
        thinking: true,
        thinkingBudget: 8192,
        cache: false,
        mode: 'agent',
        bestOf: 3,
        compact: 'auto',
        requestId: 'req-42',
        headers: { 'x-custom': 'y' },
      },
    });
    const h = fetchFn.mock.calls[0]![1].headers as Record<string, string>;
    expect(h['x-codai-session-id']).toBe('sess-call');
    expect(h['x-codai-device']).toBe('dev-1');
    expect(h['x-codai-client']).toBe('codai-cli/1.0');
    expect(h['x-codai-effort']).toBe('high');
    expect(h['x-codai-thinking']).toBe('1');
    expect(h['x-codai-thinking-budget']).toBe('8192');
    expect(h['x-codai-cache']).toBe('0');
    expect(h['x-codai-mode']).toBe('agent');
    expect(h['x-codai-best-of']).toBe('3');
    expect(h['x-codai-compact']).toBe('1');
    expect(h['x-request-id']).toBe('req-42');
    expect(h['x-custom']).toBe('y');
  });

  it('extensionHeaders() covers every documented header name', () => {
    const all = extensionHeaders({
      sessionId: 's',
      requestId: 'r',
      effort: 'low',
      thinking: false,
      thinkingBudget: 1,
      thinkingPin: true,
      cache: true,
      noTask: true,
      taskId: 't',
      taskOutcome: 'pass',
      taskEvidence: 'exec_verdict',
      client: 'c',
      incognito: true,
      noRecall: true,
      provenOnly: true,
      newSession: true,
      repo: 'o/r',
      agentId: 'a',
      disableSubagents: true,
      mode: 'agent',
      serverTools: true,
      orchestrate: true,
      cascade: 'verify',
      bestOf: 'off',
      bestOfDepth: 1,
      reflect: true,
      stepVerify: false,
      plan: true,
      consensus: true,
      compact: true,
      retrieval: true,
      heuristics: false,
      identity: 'shadow',
      playbook: 'p',
      noPlaybook: true,
      debug: true,
      device: 'd',
      deviceName: 'n',
      devicePlatform: 'cli',
      pushToken: 'tok',
      shareToken: 'sh',
    });
    expect(Object.keys(all).sort()).toEqual(
      [
        'x-request-id',
        'x-codai-session-id',
        'x-codai-effort',
        'x-codai-thinking',
        'x-codai-thinking-budget',
        'x-codai-thinking-pin',
        'x-codai-cache',
        'x-codai-no-task',
        'x-codai-task-id',
        'x-codai-task-outcome',
        'x-codai-task-evidence',
        'x-codai-client',
        'x-codai-incognito',
        'x-codai-no-recall',
        'x-codai-proven-only',
        'x-codai-new-session',
        'x-codai-repo',
        'x-codai-agent-id',
        'x-codai-disable-subagents',
        'x-codai-mode',
        'x-codai-server-tools',
        'x-codai-orchestrate',
        'x-codai-cascade',
        'x-codai-best-of',
        'x-codai-best-of-depth',
        'x-codai-reflect',
        'x-codai-step-verify',
        'x-codai-plan',
        'x-codai-consensus',
        'x-codai-compact',
        'x-codai-retrieval',
        'x-codai-heuristics',
        'x-codai-identity',
        'x-codai-playbook',
        'x-codai-no-playbook',
        'x-codai-debug',
        'x-codai-device',
        'x-codai-device-name',
        'x-codai-device-platform',
        'x-codai-push-token',
        'x-codai-share-token',
      ].sort(),
    );
    expect(all['x-codai-best-of']).toBe('off');
    expect(all['x-codai-step-verify']).toBe('0');
  });

  it('maps the error envelope to CodaiError with code, status, requestId and retryAfter', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Too many requests',
              type: 'rate_limit_error',
              code: 'rate_limit_exceeded',
            },
          }),
          { status: 429, headers: { 'retry-after': '17', 'x-codai-trace-id': 'trace-9' } },
        ),
    );
    const err = await client()
      .request('/v1/chat/completions', { body: {} })
      .catch((e) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('rate_limit_exceeded');
    expect(err.requestId).toBe('trace-9');
    expect(err.retryAfter).toBe(17);
    expect(err.message).toContain('Too many requests');
    expect(err.body.error.type).toBe('rate_limit_error');
  });

  it('non-JSON error bodies still produce a CodaiError with a null code', async () => {
    mockFetch(async () => new Response('nope', { status: 401 }));
    const err = await client()
      .request('/v1/models')
      .catch((e) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect(err.status).toBe(401);
    expect(err.code).toBeNull();
    expect(err.body).toBeNull();
  });

  it('retries 429/5xx up to maxRetries then succeeds', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      return calls < 3
        ? new Response('{}', { status: 503 })
        : new Response('{"ok":1}', { status: 200 });
    });
    const http = new HttpClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      timeoutMs: 1000,
      maxRetries: 2,
    });
    const body = await http.json<{ ok: number }>('/v1/models');
    expect(calls).toBe(3);
    expect(body.ok).toBe(1);
  });

  it('never retries multipart (rawBody) or noRetry requests', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      return new Response('{}', { status: 502 });
    });
    const http = new HttpClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      timeoutMs: 1000,
      maxRetries: 3,
    });
    await expect(
      http.request('/v1/audio/transcriptions', { rawBody: new FormData() }),
    ).rejects.toThrow(CodaiError);
    expect(calls).toBe(1);
    await expect(http.request('/health', { noRetry: true })).rejects.toThrow(CodaiError);
    expect(calls).toBe(2);
  });

  it('acceptStatus lets a 503 through as a normal response', async () => {
    mockFetch(async () => new Response('{"ok":false}', { status: 503 }));
    const res = await client().request('/health/ready', { acceptStatus: [503] });
    expect(res.status).toBe(503);
  });

  it('a caller abort is surfaced immediately and not retried', async () => {
    let calls = 0;
    mockFetch(async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const http = new HttpClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      timeoutMs: 10_000,
      maxRetries: 3,
    });
    const ac = new AbortController();
    const p = http.request('/v1/models', { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow(/aborted/);
    expect(calls).toBe(1);
  });
});

describe('SSE parsing', () => {
  it('yields OpenAI-style data-only frames and stops at [DONE]', async () => {
    const res = sseResponse(
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
        ': keep-alive\n\n' +
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
        'data: [DONE]\n\n',
    );
    const frames = [];
    for await (const f of readSse(res)) frames.push(f);
    expect(frames.map((f) => f.event)).toEqual(['message', 'message', 'message']);
    expect(
      frameJson<{ choices: Array<{ delta: { content: string } }> }>(frames[0]!)!.choices[0]!.delta
        .content,
    ).toBe('Hel');
    expect(frames[2]!.data).toBe('[DONE]');
    expect(frameJson(frames[2]!)).toBeNull();
  });

  it('yields named events (agents / sessions / hosts framing) and skips ping comments', async () => {
    const res = sseResponse(
      'event: hello\ndata: {"device_id":"d1","heartbeat_ms":15000}\n\n' +
        ': ping 1700000000000\n\n' +
        'event: step\ndata: {"seq":0,"kind":"answer","summary":"done"}\n\n' +
        'event: done\ndata: {"status":"completed","result":"42","error":null,"step_count":1}\n\n',
    );
    const frames = [];
    for await (const f of readSse(res)) frames.push(f);
    expect(frames.map((f) => f.event)).toEqual(['hello', 'step', 'done']);
    expect(frameJson<{ status: string }>(frames[2]!)!.status).toBe('completed');
  });

  it('handles frames split across chunks, CRLF delimiters and multi-line data', async () => {
    const parts = [
      'event: control\r\ndata: {"v":1,',
      '"id":"c1"}\r\n\r\nevent: lease\ndata: {"a":1}\ndata: ',
      '{"b":2}\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        const enc = new TextEncoder();
        for (const p of parts) ctl.enqueue(enc.encode(p));
        ctl.close();
      },
    });
    const res = new Response(stream, { status: 200 });
    const frames = [];
    for await (const f of readSse(res)) frames.push(f);
    expect(frames).toEqual([
      { event: 'control', data: '{"v":1,"id":"c1"}' },
      { event: 'lease', data: '{"a":1}\n{"b":2}' },
    ]);
  });

  it('http.sse() opens the stream without a timeout and without retries', async () => {
    const fetchFn = mockFetch(async () => sseResponse('event: ping\ndata: {"t":1}\n\n'));
    const http = new HttpClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      timeoutMs: 1,
      maxRetries: 2,
    });
    const frames = [];
    for await (const f of http.sse('/v1/hosts/stream', { query: { os: 'windows' } }))
      frames.push(f);
    expect(frames).toEqual([{ event: 'ping', data: '{"t":1}' }]);
    const init = fetchFn.mock.calls[0]![1];
    expect(init.signal).toBeUndefined();
    expect(fetchFn.mock.calls[0]![0]).toBe('https://gw.test/v1/hosts/stream?os=windows');
  });
});
