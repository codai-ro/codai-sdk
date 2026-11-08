import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';
import { realtimeUrl, type RealtimeAnyEvent, type RealtimeSocket } from './realtime';

class FakeWebSocket implements RealtimeSocket {
  static last: FakeWebSocket | null = null;
  readyState = 0;
  binaryType = 'blob';
  sent: string[] = [];
  closedWith: [number?, string?] | null = null;
  onopen: RealtimeSocket['onopen'] = null;
  onmessage: RealtimeSocket['onmessage'] = null;
  onclose: RealtimeSocket['onclose'] = null;
  onerror: RealtimeSocket['onerror'] = null;
  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
    readonly options?: { headers?: Record<string, string> },
  ) {
    FakeWebSocket.last = this;
  }
  send(data: string | ArrayBuffer | ArrayBufferView) {
    this.sent.push(String(data));
  }
  close(code?: number, reason?: string) {
    this.closedWith = [code, reason];
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSends(ev: unknown) {
    this.onmessage?.({ data: JSON.stringify(ev) });
  }
}

/** Fake ephemeral credentials (built at runtime so secret scanners don't flag fixtures). */
const eph = (...parts: string[]) => ['codai_eph_v1', ...parts].join('.');
const EPH = eph('x', 'y');

afterEach(() => {
  FakeWebSocket.last = null;
  vi.unstubAllGlobals();
});

const client = (apiKey = 'codai_live_secret') =>
  new Codai({ apiKey, baseUrl: 'https://ai.codai.ro' });

describe('realtimeUrl', () => {
  it('builds a wss URL with model, language, session_id and the token as ?key=', () => {
    const u = new URL(
      realtimeUrl('https://ai.codai.ro', {
        model: 'codai-transcribe-live',
        language: 'ro',
        sessionId: 'live-1',
        token: eph('a', 'b'),
      }),
    );
    expect(u.protocol).toBe('wss:');
    expect(u.pathname).toBe('/v1/realtime');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      model: 'codai-transcribe-live',
      language: 'ro',
      session_id: 'live-1',
      key: eph('a', 'b'),
    });
  });
});

describe('codai.realtime.connect', () => {
  it('browser path: ephemeral token in ?key=, no Authorization header', () => {
    client().realtime.connect({
      token: EPH,
      language: 'ro',
      WebSocket: FakeWebSocket,
    });
    const ws = FakeWebSocket.last!;
    expect(new URL(ws.url).searchParams.get('key')).toBe(EPH);
    expect(ws.options).toBeUndefined();
    expect(ws.binaryType).toBe('arraybuffer');
  });

  it('server path: raw key goes in the Authorization header, never in the URL', () => {
    client().realtime.connect({ WebSocket: FakeWebSocket });
    const ws = FakeWebSocket.last!;
    expect(new URL(ws.url).searchParams.has('key')).toBe(false);
    expect(ws.options?.headers?.Authorization).toBe('Bearer codai_live_secret');
  });

  it('a client built with an ephemeral token uses it as ?key=', () => {
    client(eph('p', 's')).realtime.connect({ WebSocket: FakeWebSocket });
    expect(new URL(FakeWebSocket.last!.url).searchParams.get('key')).toBe(eph('p', 's'));
  });

  it('falls back to globalThis.WebSocket', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    client().realtime.connect({ token: EPH });
    expect(FakeWebSocket.last).not.toBeNull();
  });

  it('sends the transcription session.update on open, then queued audio as base64 PCM', async () => {
    const live = client().realtime.connect({
      token: EPH,
      language: 'ro',
      WebSocket: FakeWebSocket,
    });
    live.appendAudio(new Int16Array([1, -1]));
    const ws = FakeWebSocket.last!;
    expect(ws.sent).toEqual([]);
    ws.open();
    await live.ready;
    expect(JSON.parse(ws.sent[0]!)).toMatchObject({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'codai-transcribe-live', language: 'ro' },
          },
        },
      },
    });
    expect(JSON.parse(ws.sent[1]!)).toEqual({
      type: 'input_audio_buffer.append',
      audio: 'AQD//w==',
    });
    live.appendAudio(new Uint8Array([7]).buffer);
    live.commit();
    expect(JSON.parse(ws.sent[2]!).audio).toBe('Bw==');
    expect(JSON.parse(ws.sent[3]!)).toEqual({ type: 'input_audio_buffer.commit' });
  });

  it('yields typed events through async iteration and on() listeners, ending with close', async () => {
    const live = client().realtime.connect({ token: EPH, WebSocket: FakeWebSocket });
    const ws = FakeWebSocket.last!;
    ws.open();
    const deltas: string[] = [];
    live.on('conversation.item.input_audio_transcription.delta', (ev) => {
      deltas.push((ev as { delta: string }).delta);
    });
    ws.serverSends({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'i1',
      delta: 'bună',
    });
    ws.serverSends({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'i1',
      transcript: 'Bună!',
    });
    ws.onmessage?.({ data: 'not json' });
    live.close();
    const seen: RealtimeAnyEvent[] = [];
    for await (const ev of live) seen.push(ev);
    expect(deltas).toEqual(['bună']);
    expect(seen.map((e) => e.type)).toEqual([
      'conversation.item.input_audio_transcription.delta',
      'conversation.item.input_audio_transcription.completed',
      'close',
    ]);
    expect(ws.closedWith).toEqual([1000, 'client closed']);
    expect(() => live.appendAudio(new Int16Array([1]))).toThrow(/closed/);
  });

  it('ready rejects when the socket closes before opening (e.g. 4401)', async () => {
    const live = client().realtime.connect({ token: EPH, WebSocket: FakeWebSocket });
    FakeWebSocket.last!.onclose?.({ code: 4401, reason: 'invalid api key' });
    await expect(live.ready).rejects.toThrow(/4401/);
  });

  it('sends no first frame for non-transcription models unless asked', () => {
    client().realtime.connect({
      model: 'codai-realtime',
      token: EPH,
      WebSocket: FakeWebSocket,
    });
    const ws = FakeWebSocket.last!;
    ws.open();
    expect(ws.sent).toEqual([]);
  });

  it('throws without any credential or WebSocket', () => {
    expect(() =>
      new Codai({ apiKey: 'k' }).realtime.connect({ apiKey: '', WebSocket: undefined }),
    ).toThrow();
  });
});
