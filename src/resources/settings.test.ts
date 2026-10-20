import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError, settingsConflictCurrent } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const view = {
  settings: {
    transcripts: {
      waveform: 'bars',
      haptics: true,
      liveText: true,
      target: 'auto',
      language: null,
    },
  },
  version: 2,
  updatedAt: '2026-10-10T12:00:00.000Z',
};

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

describe('settings', () => {
  it('get() GETs /v1/settings and returns the full view', async () => {
    const calls = stub([json(view)]);
    const r = await mk().settings.get();
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/settings');
    expect(r).toEqual(view);
  });

  it('update() PATCHes { settings, version } and omits version when not given', async () => {
    const calls = stub([json(view), json(view)]);
    await mk().settings.update({ transcripts: { waveform: 'bars' } }, { version: 1 });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/settings');
    expect(JSON.parse(String(calls[0]!.body))).toEqual({
      settings: { transcripts: { waveform: 'bars' } },
      version: 1,
    });
    await mk().settings.update({ transcripts: { language: null } });
    expect(JSON.parse(String(calls[1]!.body))).toEqual({
      settings: { transcripts: { language: null } },
    });
  });

  it('a 409 version_conflict throws CodaiError whose current state is readable', async () => {
    stub([
      json(
        {
          error: { message: 'stale', type: 'invalid_request_error', code: 'version_conflict' },
          current: view,
        },
        409,
      ),
    ]);
    const err = await mk()
      .settings.update({ transcripts: { haptics: false } }, { version: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).code).toBe('version_conflict');
    expect(settingsConflictCurrent(err)).toEqual(view);
    expect(settingsConflictCurrent(new Error('x'))).toBeNull();
  });
});
