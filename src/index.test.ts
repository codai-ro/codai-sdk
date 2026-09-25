import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from './index';

type Captured = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

/** Mock fetch that records the request and answers with `payload` (+ headers). */
function capture(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  const seen: Captured[] = [];
  mockFetch(async (url, init) => {
    seen.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    });
    return new Response(payload === undefined ? null : JSON.stringify(payload), {
      status,
      headers,
    });
  });
  return seen;
}

const sse = (text: string, headers: Record<string, string> = {}) =>
  new Response(new Blob([text]).stream(), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...headers },
  });

afterEach(() => vi.unstubAllGlobals());

const mk = (extra: Partial<ConstructorParameters<typeof Codai>[0]> = {}) =>
  new Codai({ apiKey: 'sk-test', maxRetries: 0, ...extra });

describe('Codai client (0.2.x-compatible surface)', () => {
  it('requires an apiKey', () => {
    expect(() => new Codai({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('chat() sends auth + extension headers and parses the result', async () => {
    const seen = capture(
      {
        choices: [{ message: { content: 'hi there' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      200,
      {
        'x-codai-routed-to': 'claude-haiku-4-5',
        'x-request-id': 'req-1',
        'x-codai-event-id': 'ev-1',
      },
    );
    const client = mk({ sessionId: 'sess-1' });
    const result = await client.chat({
      messages: [{ role: 'user', content: 'hello' }],
      agentMode: true,
      bestOf: 0,
    });
    const req = seen[0]!;
    expect(req.url).toBe('https://ai.codai.ro/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer sk-test');
    expect(req.headers['x-codai-session-id']).toBe('sess-1');
    expect(req.headers['x-codai-mode']).toBe('agent');
    expect(req.headers['x-codai-best-of']).toBe('0');
    expect((req.body as { model: string; stream: boolean }).model).toBe('codai');
    expect((req.body as { stream: boolean }).stream).toBe(false);
    expect(result.content).toBe('hi there');
    expect(result.routedTo).toBe('claude-haiku-4-5');
    expect(result.requestId).toBe('req-1');
    expect(result.eventId).toBe('ev-1');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('chat.completions.create() is the same call with the raw OpenAI body', async () => {
    const seen = capture({ choices: [{ message: { content: 'ok', tool_calls: [{ id: 'c1' }] } }] });
    const client = mk();
    const r = await client.chat.completions.create(
      { messages: [{ role: 'user', content: 'x' }], max_completion_tokens: 12 },
      { ext: { effort: 'max' } },
    );
    expect((seen[0]!.body as { max_completion_tokens: number }).max_completion_tokens).toBe(12);
    expect(seen[0]!.headers['x-codai-effort']).toBe('max');
    expect(r.toolCalls).toEqual([{ id: 'c1' }]);
  });

  it('retries on 429 then succeeds', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls === 1) return new Response('{}', { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      });
    });
    const client = new Codai({ apiKey: 'sk-test', maxRetries: 1 });
    const result = await client.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(calls).toBe(2);
    expect(result.content).toBe('ok');
  });

  it('throws CodaiError with status + code on non-retryable failure', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'bad key', type: 'invalid_request_error', code: 'invalid_api_key' },
          }),
          { status: 401 },
        ),
    );
    const err = await mk()
      .chat({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('invalid_api_key');
  });

  it('chatStream() yields deltas; .final has metadata, usage, cached tokens and finish_reason', async () => {
    mockFetch(async () =>
      sse(
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n' +
          'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":5}}}\n\n' +
          'data: [DONE]\n\n',
        { 'x-request-id': 'req-stream', 'x-codai-routed-to': 'claude-haiku-4-5' },
      ),
    );
    const stream = mk().chatStream({ messages: [{ role: 'user', content: 'hi' }] });
    const chunks: string[] = [];
    for await (const d of stream) chunks.push(d);
    const final = await stream.final;
    expect(chunks.join('')).toBe('Hello');
    expect(final.content).toBe('Hello');
    expect(final.requestId).toBe('req-stream');
    expect(final.routedTo).toBe('claude-haiku-4-5');
    expect(final.usage).toEqual({ promptTokens: 7, completionTokens: 2, cachedTokens: 5 });
    expect(final.finishReason).toBe('stop');
    expect(final.toolCalls).toEqual([]);
  });

  it('chat.completions.stream().chunks() yields raw chunk objects', async () => {
    mockFetch(async () =>
      sse('data: {"id":"x","choices":[{"delta":{"content":"a"}}]}\n\ndata: [DONE]\n\n'),
    );
    const s = mk().chat.completions.stream({ messages: [{ role: 'user', content: 'hi' }] });
    const ids: string[] = [];
    for await (const c of s.chunks()) ids.push(c.id!);
    expect(ids).toEqual(['x']);
  });

  it('chatStream() assembles streamed tool calls into final.toolCalls', async () => {
    mockFetch(async () =>
      sse(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{\\"ci"}}]}}]}\n\n' +
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ty\\":\\"Paris\\"}"}}]}}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );
    const stream = mk().chatStream({ messages: [{ role: 'user', content: 'weather?' }] });
    for await (const _d of stream) void _d;
    const final = await stream.final;
    expect(final.toolCalls).toHaveLength(1);
    const tc = final.toolCalls[0] as { id: string; function: { name: string; arguments: string } };
    expect(tc.id).toBe('call_1');
    expect(JSON.parse(tc.function.arguments)).toEqual({ city: 'Paris' });
  });

  it('chatStream().final rejects when the request fails', async () => {
    mockFetch(async () => new Response('nope', { status: 401 }));
    const stream = mk().chatStream({ messages: [{ role: 'user', content: 'x' }] });
    await expect(
      (async () => {
        for await (const _d of stream) void _d;
      })(),
    ).rejects.toThrow(CodaiError);
    await expect(stream.final).rejects.toThrow(CodaiError);
  });

  it('chatStream() abort cancels the reader', async () => {
    const ac = new AbortController();
    mockFetch(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'),
          );
          // never closes — the abort must end the iteration
        },
      });
      return new Response(stream, { status: 200 });
    });
    const s = mk().chatStream({ messages: [{ role: 'user', content: 'x' }], signal: ac.signal });
    const got: string[] = [];
    for await (const d of s) {
      got.push(d);
      ac.abort();
    }
    expect(got).toEqual(['a']);
  });

  it('agents.run() posts the task and reads event_id', async () => {
    const seen = capture({
      result: 'done',
      model: 'codai',
      status: 'completed',
      event_id: 'ev-9',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const out = await mk().agents.run({ task: 'summarize repo' });
    expect((seen[0]!.body as { task: string }).task).toBe('summarize repo');
    expect(out.result).toBe('done');
    expect(out.eventId).toBe('ev-9');
  });

  it('embeddings() (callable) and embeddings.create() both work', async () => {
    capture({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3] }] }, 200, {
      'x-codai-embed-fallback': 'codai-embed->voyage-code-3',
    });
    const client = mk();
    const legacy = await client.embeddings({ input: ['a', 'b'] });
    expect(legacy.embeddings).toEqual([[0.1, 0.2], [0.3]]);
    const rich = await client.embeddings.create({ input: 'a' });
    expect(rich.fallback).toBe('codai-embed->voyage-code-3');
  });

  it('audio.transcribe() posts multipart with optional fields and returns text', async () => {
    let form: FormData | null = null;
    mockFetch(async (url, init) => {
      form = init.body as FormData;
      expect(url).toBe('https://ai.codai.ro/v1/audio/transcriptions');
      expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
      return new Response(JSON.stringify({ text: 'hello world' }), { status: 200 });
    });
    const text = await mk().audio.transcribe({
      file: new Uint8Array([1, 2, 3]),
      filename: 'clip.webm',
      language: 'ro',
    });
    expect(form).toBeInstanceOf(FormData);
    expect(form!.get('language')).toBe('ro');
    expect(form!.get('model')).toBe('codai-transcribe');
    expect(text).toBe('hello world');
    const r = await mk().audio.transcribeDetailed({ file: new Uint8Array([1]) });
    expect(r.text).toBe('hello world');
    expect(r.raw).toEqual({ text: 'hello world' });
  });

  it('audio.speech() returns audio bytes; speechDetailed() adds content-type', async () => {
    mockFetch(
      async () =>
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        }),
    );
    const client = mk();
    expect(new Uint8Array(await client.audio.speech({ input: 'hi' }))).toEqual(
      new Uint8Array([4, 5, 6]),
    );
    expect((await client.audio.speechDetailed({ input: 'hi' })).contentType).toBe('audio/wav');
  });

  it('mintToken() / tokens.create() return a scoped ephemeral token', async () => {
    const seen = capture({ token: 'eph_abc', expires_at: '2026-01-01T00:00:00Z', scope: 'audio' });
    const tok = await mk().mintToken('audio', 600);
    expect(seen[0]!.body).toEqual({ scope: 'audio', ttl_seconds: 600 });
    expect(tok.token).toBe('eph_abc');
    expect(tok.scope).toBe('audio');
  });

  it('models() (callable) returns ids; models.list() returns full entries', async () => {
    capture({ object: 'list', data: [{ id: 'codai', object: 'model', codai: { kind: 'alias' } }] });
    const client = mk();
    expect(await client.models()).toEqual([{ id: 'codai' }]);
    expect((await client.models.list())[0]!.codai).toEqual({ kind: 'alias' });
  });

  it('feedback(id, rating) (callable) and feedback.submit() post the envelope', async () => {
    const seen = capture({ ok: true, event_id: 'ev-1' });
    const client = mk();
    await client.feedback('ev-1', 1, 'nice');
    expect(seen[0]!.body).toEqual({ event_id: 'ev-1', rating: 1, comment: 'nice' });
    const r = await client.feedback.submit({ session_id: 's1', rating: -1 });
    expect(seen[1]!.body).toEqual({ session_id: 's1', rating: -1 });
    expect(r.event_id).toBe('ev-1');
  });
});

describe('Codai resources (new groups)', () => {
  it('messages.create() joins text blocks; messages.stream() yields named events', async () => {
    capture({
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'codai',
      content: [
        { type: 'text', text: 'Bu' },
        { type: 'text', text: 'nă' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const r = await mk().messages.create({
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });
    expect(r.text).toBe('Bună');

    mockFetch(async () =>
      sse(
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
          'event: ping\ndata: {"type":"ping"}\n\n' +
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n' +
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ),
    );
    const s = mk().messages.stream({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 });
    const types: string[] = [];
    for await (const ev of s) types.push(ev.type);
    expect(types).toEqual([
      'message_start',
      'content_block_delta',
      'ping',
      'message_delta',
      'message_stop',
    ]);
    const final = await s.final;
    expect(final.text).toBe('Hi');
    expect(final.stopReason).toBe('end_turn');
    expect(final.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it('responses.create() reads output_text; responses.stream() collects deltas + completed', async () => {
    capture({ id: 'r', object: 'response', output_text: 'yo', output: [] });
    expect((await mk().responses.create({ input: 'hi' })).outputText).toBe('yo');
    mockFetch(async () =>
      sse(
        'event: response.created\ndata: {"type":"response.created","sequence_number":0,"response":{"id":"r"}}\n\n' +
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","sequence_number":1,"item_id":"i","delta":"he"}\n\n' +
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","sequence_number":2,"item_id":"i","delta":"y"}\n\n' +
          'event: response.completed\ndata: {"type":"response.completed","sequence_number":3,"response":{"id":"r","output_text":"hey"}}\n\n',
      ),
    );
    const s = mk().responses.stream({ input: 'hi' });
    const text: string[] = [];
    for await (const d of s.text()) text.push(d);
    expect(text.join('')).toBe('hey');
    const final = await s.final;
    expect(final.response?.output_text).toBe('hey');
  });

  it('health.* hit root paths without /v1 and ready() tolerates 503', async () => {
    const seen = capture({ ok: false, checks: {} }, 503);
    const r = await mk().health.ready();
    expect(seen[0]!.url).toBe('https://ai.codai.ro/health/ready');
    expect(r.httpStatus).toBe(503);
    capture({ ok: true });
    await mk().health.get();
    await mk().health.status();
  });

  it('agents.runs.* map to the documented paths; stream() ends on done', async () => {
    const seen = capture({ id: 'run-1', status: 'queued' }, 202);
    const client = mk();
    await client.agents.runs.create({ task: 't', client_request_id: 'ci-1' });
    await client.agents.runs.get('run-1');
    await client.agents.runs.steps('run-1').catch(() => {});
    await client.agents.runs.stats(30);
    await client.agents.runs.cancel('run-1');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST https://ai.codai.ro/v1/agents/runs',
      'GET https://ai.codai.ro/v1/agents/runs/run-1',
      'GET https://ai.codai.ro/v1/agents/runs/run-1/steps',
      'GET https://ai.codai.ro/v1/agents/runs/stats?days=30',
      'POST https://ai.codai.ro/v1/agents/runs/run-1/cancel',
    ]);
    mockFetch(async () =>
      sse(
        'event: step\ndata: {"seq":0,"kind":"answer","summary":"x"}\n\n' +
          'event: done\ndata: {"status":"completed","result":"42","error":null,"step_count":1}\n\n' +
          'event: step\ndata: {"seq":99,"kind":"answer","summary":"never"}\n\n',
      ),
    );
    const evs = [];
    for await (const ev of client.agents.runs.stream('run-1')) evs.push(ev);
    expect(evs.map((e) => e.event)).toEqual(['step', 'done']);
    expect(evs[1]!.data).toMatchObject({ status: 'completed', result: '42' });
  });

  it('tasks.* build queries and paths', async () => {
    const seen = capture({ tasks: [], next_cursor: null });
    const client = mk();
    await client.tasks.list({ outcome: 'pass', limit: 10, cursor: '2026-09-22T14:03:11.512Z' });
    await client.tasks.pending();
    await client.tasks.stats(new Date('2026-09-01T00:00:00Z'));
    await client.tasks.get('t1');
    await client.tasks.confirm('t1', { outcome: 'confirmed', note: 'ok' });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET https://ai.codai.ro/v1/tasks?outcome=pass&limit=10&cursor=2026-09-22T14%3A03%3A11.512Z',
      'GET https://ai.codai.ro/v1/tasks/pending',
      'GET https://ai.codai.ro/v1/tasks/stats?since=2026-09-01T00%3A00%3A00.000Z',
      'GET https://ai.codai.ro/v1/tasks/t1',
      'POST https://ai.codai.ro/v1/tasks/t1/confirm',
    ]);
    expect(seen[4]!.body).toEqual({ outcome: 'confirmed', note: 'ok' });
  });

  it('sessions.* send x-codai-device from the client default and cover the whole protocol', async () => {
    const seen = capture(
      {
        id: 's-1',
        session_key: 'k',
        sessions: [],
        events: [],
        controls: [],
        shares: [],
        last_seq: 0,
      },
      201,
    );
    const client = mk({ device: 'dev-uuid', devicePlatform: 'cli' });
    const created = await client.sessions.create({ session_key: 'k', title: 'T' });
    expect(created.created).toBe(true);
    await client.sessions.list({ archived: true, limit: 5 });
    await client.sessions.get('s-1', { share: 'tok' });
    await client.sessions.update('s-1', { title: null });
    await client.sessions.delete('s-1');
    await client.sessions.events.list('s-1', { after: 3, limit: 50 });
    await client.sessions.events.append('s-1', {
      events: [{ kind: 'user', payload: {} }],
      expected_last_seq: 3,
    });
    await client.sessions.controls.list('s-1', { target: 'me' });
    await client.sessions.controls.submit('s-1', { id: 'c1', kind: 'send', text: 'hi' });
    await client.sessions.controls.markApplied('s-1', 'c1');
    await client.sessions.dispatch('s-1', { device_id: 'd2', text: 'go' });
    await client.sessions.lease.acquire('s-1', { force: true });
    await client.sessions.lease.renew('s-1');
    await client.sessions.lease.release('s-1');
    await client.sessions.shares.list('s-1');
    await client.sessions.shares.create('s-1', { principal_type: 'link', role: 'viewer' });
    await client.sessions.shares.delete('s-1', 'sh-1');
    await client.sessions.shares.sharedWithMe({ archived: true });
    expect(seen.every((s) => s.headers['x-codai-device'] === 'dev-uuid')).toBe(true);
    expect(seen[0]!.headers['x-codai-device-platform']).toBe('cli');
    expect(seen.map((s) => `${s.method} ${s.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'POST /v1/sessions',
      'GET /v1/sessions?limit=5&archived=1&v=2',
      'GET /v1/sessions/s-1?share=tok&v=2',
      'PATCH /v1/sessions/s-1',
      'DELETE /v1/sessions/s-1',
      'GET /v1/sessions/s-1/events?after=3&limit=50',
      'POST /v1/sessions/s-1/events',
      'GET /v1/sessions/s-1/controls?target=me',
      'POST /v1/sessions/s-1/control',
      'POST /v1/sessions/s-1/control/c1/applied',
      'POST /v1/sessions/s-1/dispatch',
      'POST /v1/sessions/s-1/lease',
      'PUT /v1/sessions/s-1/lease',
      'DELETE /v1/sessions/s-1/lease',
      'GET /v1/sessions/s-1/shares',
      'POST /v1/sessions/s-1/shares',
      'DELETE /v1/sessions/s-1/shares/sh-1',
      'GET /v1/sessions/shared-with-me?archived=1',
    ]);
    expect(seen[11]!.body).toEqual({ force: true });
    expect(seen[12]!.body).toBeUndefined();
  });

  it('sessions.stream() yields event/control/lease/presence frames and skips ping comments', async () => {
    mockFetch(async () =>
      sse(
        'event: event\ndata: {"v":1,"seq":1,"kind":"user","payload":{}}\n\n' +
          ': ping 1700000000000\n\n' +
          'event: lease\ndata: {"v":1,"holder_device_id":null,"expires_at":null}\n\n' +
          'event: presence\ndata: {"v":1,"device_id":"d","user_id":"u","role":"owner","executor":false,"last_seen":"x","driving":false,"online":true}\n\n' +
          'event: control\ndata: {"v":1,"id":"c1","kind":"send","seq":2,"applied":true}\n\n',
      ),
    );
    const evs = [];
    for await (const ev of mk({ device: 'd' }).sessions.stream('s-1', { after: 0 })) evs.push(ev);
    expect(evs.map((e) => e.event)).toEqual(['event', 'lease', 'presence', 'control']);
    expect(evs[0]!.data).toMatchObject({ v: 1, seq: 1 });
  });

  it('devices.* and hosts.* map to paths; hosts.exec builds the body', async () => {
    const seen = capture({
      devices: [],
      hosts: [],
      sessions: [],
      ok: true,
      req_id: 'r',
      result: null,
      error: null,
    });
    const client = mk({ device: 'me' });
    await client.devices.list();
    await client.devices.update('d1', { push_token: null, capabilities: ['fs'] });
    await client.devices.delete('d1');
    await client.devices.dispatchInbox({ limit: 10 });
    await client.hosts.list();
    await client.hosts.exec(
      'h1',
      'shell',
      { cmd: 'git status' },
      { timeoutMs: 30_000, label: 'term' },
    );
    await client.hosts.postResult('req-1', { ok: true, result: { stdout: 'x' } });
    expect(seen.map((s) => `${s.method} ${s.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'GET /v1/devices',
      'PATCH /v1/devices/d1',
      'DELETE /v1/devices/d1',
      'GET /v1/devices/me/dispatch?limit=10',
      'GET /v1/hosts',
      'POST /v1/hosts/h1/exec',
      'POST /v1/hosts/exec/req-1/result',
    ]);
    expect(seen[5]!.body).toEqual({
      op: 'shell',
      args: { cmd: 'git status' },
      timeout_ms: 30_000,
      label: 'term',
    });
  });

  it('hosts.stream() joins roots and yields hello/ping/exec', async () => {
    let url = '';
    mockFetch(async (u) => {
      url = u;
      return sse(
        'event: hello\ndata: {"device_id":"d","heartbeat_ms":15000}\n\n' +
          'event: ping\ndata: {"t":1}\n\n' +
          'event: exec\ndata: {"req_id":"r","op":"fs_roots","args":{},"timeout_ms":60000,"from_device_id":"f","ts":1}\n\n',
      );
    });
    const evs = [];
    for await (const ev of mk({ device: 'd' }).hosts.stream({
      os: 'windows',
      hostname: 'pc',
      roots: ['E:\\gh', 'C:\\x'],
    }))
      evs.push(ev);
    expect(url).toBe(
      'https://ai.codai.ro/v1/hosts/stream?os=windows&hostname=pc&roots=E%3A%5Cgh%2CC%3A%5Cx',
    );
    expect(evs.map((e) => e.event)).toEqual(['hello', 'ping', 'exec']);
  });

  it('orgs.*, account.*, receipt.get, phoneModels.list map to paths', async () => {
    const seen = capture({ orgs: [], members: [], models: [], id: 'o1', role: 'owner' });
    const client = mk();
    await client.orgs.create('Acme');
    await client.orgs.list();
    await client.orgs.members.list('o1');
    await client.orgs.members.add('o1', { email: 'a@b.c', role: 'admin' });
    await client.orgs.members.remove('o1', 'u1');
    await client.account.get();
    await client.account.update({ training_opt_out: true });
    await client.receipt.get({ sessionId: 'sess', since: '2026-09-22T00:00:00.000Z' });
    await client.receipt.get({ since: new Date('2026-09-22T00:00:00.000Z') });
    await client.phoneModels.list();
    expect(seen.map((s) => `${s.method} ${s.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'POST /v1/orgs',
      'GET /v1/orgs',
      'GET /v1/orgs/o1/members',
      'POST /v1/orgs/o1/members',
      'DELETE /v1/orgs/o1/members/u1',
      'GET /v1/account',
      'PATCH /v1/account',
      'GET /v1/receipt?session_id=sess&since=2026-09-22T00%3A00%3A00.000Z',
      'GET /v1/receipt?since=2026-09-22T00%3A00%3A00.000Z',
      'GET /v1/phone/models',
    ]);
    expect(seen[0]!.body).toEqual({ name: 'Acme' });
  });

  it('projects.* and environments.* map to paths, methods and bodies', async () => {
    const seen = capture({
      projects: [],
      project: { id: 'p1' },
      environments: [],
      environment: { id: 'e1' },
      members: [],
      member: { user_id: 'u1' },
      ports: [],
      port: { port: 3000 },
      secrets: [],
    });
    const c = mk();
    await c.projects.list();
    expect(await c.projects.create({ name: 'brivio' })).toEqual({ id: 'p1' });
    await c.projects.get('p1');
    await c.projects.update('p1', { name: 'b2' });
    await c.projects.delete('p1');
    await c.environments.list({ project_id: 'p1', for_user_id: 'me' });
    expect(await c.environments.create({ project_id: 'p1', provider: 'byo', name: 'x' })).toEqual({
      id: 'e1',
    });
    await c.environments.enroll({
      token: 'codai_env_x',
      device_id: 'd1',
      daemon_version: '1',
      os: 'linux',
      arch: 'x64',
    });
    await c.environments.get('e1');
    await c.environments.update('e1', { idle_timeout_minutes: 30 });
    await c.environments.start('e1');
    await c.environments.stop('e1');
    await c.environments.archive('e1');
    await c.environments.destroy('e1');
    await c.environments.enrollToken('e1');
    await c.environments.members.list('e1');
    await c.environments.members.add('e1', { email: 'a@b.c', role: 'developer' });
    await c.environments.members.setSshKey('e1', 'ssh-ed25519 AAAA a@b');
    await c.environments.members.setRole('e1', 'u1', 'viewer');
    await c.environments.members.remove('e1', 'u1');
    await c.environments.ports.list('e1');
    await c.environments.ports.set('e1', 3000, { visibility: 'org' });
    await c.environments.ports.remove('e1', 3000);
    await c.environments.secrets.list('e1');
    await c.environments.secrets.set('e1', 'API_KEY', 's3cr3t');
    await c.environments.secrets.remove('e1', 'API_KEY');
    expect(seen.map((s) => `${s.method} ${s.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'GET /v1/projects',
      'POST /v1/projects',
      'GET /v1/projects/p1',
      'PATCH /v1/projects/p1',
      'DELETE /v1/projects/p1',
      'GET /v1/environments?project_id=p1&for_user_id=me',
      'POST /v1/environments',
      'POST /v1/environments/enroll',
      'GET /v1/environments/e1',
      'PATCH /v1/environments/e1',
      'POST /v1/environments/e1/start',
      'POST /v1/environments/e1/stop',
      'POST /v1/environments/e1/archive',
      'POST /v1/environments/e1/destroy',
      'POST /v1/environments/e1/enroll-token',
      'GET /v1/environments/e1/members',
      'POST /v1/environments/e1/members',
      'PUT /v1/environments/e1/members/me/ssh-key',
      'PATCH /v1/environments/e1/members/u1',
      'DELETE /v1/environments/e1/members/u1',
      'GET /v1/environments/e1/ports',
      'PUT /v1/environments/e1/ports/3000',
      'DELETE /v1/environments/e1/ports/3000',
      'GET /v1/environments/e1/secrets',
      'PUT /v1/environments/e1/secrets/API_KEY',
      'DELETE /v1/environments/e1/secrets/API_KEY',
    ]);
    expect(seen[17]!.body).toEqual({ public_key: 'ssh-ed25519 AAAA a@b' });
    expect(seen[18]!.body).toEqual({ role: 'viewer' });
    expect(seen[24]!.body).toEqual({ value: 's3cr3t' });
  });

  it('tools.search / tools.fetch post bodies', async () => {
    const seen = capture({ results: [] });
    await mk().tools.search({ query: 'bnr eur ron' });
    await mk().tools.fetch({ url: 'https://example.com', format: 'markdown' });
    expect(seen.map((s) => s.url.replace('https://ai.codai.ro', ''))).toEqual([
      '/v1/tools/search',
      '/v1/tools/fetch',
    ]);
  });
});
