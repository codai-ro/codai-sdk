import { afterEach, describe, expect, it } from 'vitest';
import { Codai } from '../index';
import { JAM_CLOSE_CODES, jamUrl, type JamEvent } from './jam';
import type { RealtimeSocket } from './realtime';

class FakeWebSocket implements RealtimeSocket {
  static last: FakeWebSocket | null = null;
  readyState = 0;
  binaryType = 'blob';
  sent: string[] = [];
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
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
}

const eph = (...parts: string[]) => ['codai_eph_v1', ...parts].join('.');

afterEach(() => {
  FakeWebSocket.last = null;
});

const client = (apiKey = 'codai_live_secret') =>
  new Codai({ apiKey, baseUrl: 'https://ai.codai.ro' });

describe('jamUrl', () => {
  it('builds wss://…/v1/studio/jam with session_id only (never a credential)', () => {
    const u = new URL(jamUrl('https://ai.codai.ro/', { sessionId: 's1' }));
    expect(u.protocol).toBe('wss:');
    expect(u.pathname).toBe('/v1/studio/jam');
    expect(Object.fromEntries(u.searchParams)).toEqual({ session_id: 's1' });
  });
});

describe('codai.jam.connect (MU-09)', () => {
  it('browser path: token travels as the bearer.<token> subprotocol, not in the URL', () => {
    const token = eph('a', 'b');
    client().jam.connect({ token, WebSocket: FakeWebSocket });
    const ws = FakeWebSocket.last!;
    expect(ws.protocols).toEqual(['codai-jam', `bearer.${token}`]);
    expect(ws.options).toBeUndefined();
    expect(ws.url).not.toContain(token);
    expect(ws.binaryType).toBe('arraybuffer');
  });

  it('server path: the API key goes in the Authorization header', () => {
    client('codai_live_k').jam.connect({ WebSocket: FakeWebSocket });
    const ws = FakeWebSocket.last!;
    expect(ws.protocols).toEqual(['codai-jam']);
    expect(ws.options?.headers?.Authorization).toBe('Bearer codai_live_k');
  });

  it('queues messages until open, then sends typed JSON frames; emits status, audio and close', async () => {
    const jam = client().jam.connect({ WebSocket: FakeWebSocket });
    const ws = FakeWebSocket.last!;
    jam.prompts([{ text: 'warm lo-fi piano', weight: 1 }]);
    jam.config({ bpm: 90, scale: 'C_MAJOR_A_MINOR' });
    expect(ws.sent).toEqual([]);
    ws.open();
    await jam.ready;
    jam.play();
    expect(ws.sent.map((f) => JSON.parse(f) as { type: string })).toEqual([
      { type: 'prompts', prompts: [{ text: 'warm lo-fi piano', weight: 1 }] },
      { type: 'config', bpm: 90, scale: 'C_MAJOR_A_MINOR' },
      { type: 'play' },
    ]);
    const seen: JamEvent[] = [];
    jam.on('*', (ev) => seen.push(ev));
    let bytes = 0;
    jam.on('audio', (ev) => (bytes += ev.data.byteLength));
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'status',
        state: 'ready',
        sample_rate: 48000,
        channels: 2,
        remaining_ms: 600000,
      }),
    });
    ws.onmessage?.({ data: new Uint8Array([1, 2, 3, 4]).buffer });
    ws.onmessage?.({ data: 'not json' });
    ws.close(JAM_CLOSE_CODES.maxDuration, 'max_duration');
    expect(bytes).toBe(4);
    expect(seen.map((e) => e.type)).toEqual(['status', 'audio', 'close']);
    expect(seen.at(-1)).toEqual({ type: 'close', code: 4408, reason: 'max_duration' });
    expect(() => jam.play()).toThrow(/closed/);
  });

  it('ready rejects when the server closes before open (e.g. 4401)', async () => {
    const jam = client().jam.connect({ WebSocket: FakeWebSocket });
    FakeWebSocket.last!.close(JAM_CLOSE_CODES.unauthorized, 'invalid api key');
    await expect(jam.ready).rejects.toThrow(/4401/);
  });
});
