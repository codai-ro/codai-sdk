import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';
import { solvePow } from './anon';

afterEach(() => vi.unstubAllGlobals());

const mk = (apiKey = 'sk-test') => new Codai({ apiKey, maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string; body: unknown; auth: string | undefined };
function stub(reply: (url: string) => unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({
        url,
        method: String(init.method ?? 'GET'),
        body: init.body,
        auth: headers.Authorization,
      });
      return json(reply(url));
    }),
  );
  return calls;
}

const leadingZeroBits = (hex: string): number => {
  let bits = 0;
  for (const ch of hex) {
    const n = parseInt(ch, 16);
    if (n === 0) {
      bits += 4;
      continue;
    }
    return bits + Math.clz32(n) - 28;
  }
  return bits;
};

const DEVICE = '0b9d6c3e-6f1a-4c1e-9a43-2f5b7d8e9a10';
const LIMITS = {
  sessions_per_day: 3,
  sessions_left: 2,
  messages_per_session: 10,
  messages_left: 10,
  soft_wall_at: 8,
  resets_at: '2026-10-29T00:00:00.000Z',
};

describe('anon', () => {
  it('solvePow(bits=8) returns a counter whose digest has >= 8 leading zero bits', async () => {
    const counter = await solvePow('nonce-abc', DEVICE, 8);
    expect(counter).toMatch(/^\d+$/);
    const hex = createHash('sha256').update(`nonce-abc:${DEVICE}:${counter}`).digest('hex');
    expect(leadingZeroBits(hex)).toBeGreaterThanOrEqual(8);
    // smallest such counter
    for (let i = 0; i < Number(counter); i++) {
      const h = createHash('sha256').update(`nonce-abc:${DEVICE}:${i}`).digest('hex');
      expect(leadingZeroBits(h)).toBeLessThan(8);
    }
  });

  it('challenge() GETs /v1/anon/challenge?surface=', async () => {
    const calls = stub(() => ({ nonce: 'n', pow_bits: 20, expires_at: '2026-10-28T10:05:00Z' }));
    const r = await mk().anon.challenge('desktop');
    expect(calls[0]).toMatchObject({
      url: 'https://ai.codai.ro/v1/anon/challenge?surface=desktop',
      method: 'GET',
    });
    expect(r.pow_bits).toBe(20);
  });

  it('createSession() POSTs the body as-is', async () => {
    const calls = stub(() => ({
      token: 'anon_v1.a.b',
      session_id: 's',
      expires_at: 'x',
      limits: LIMITS,
    }));
    const body = {
      surface: 'web' as const,
      device_id: DEVICE,
      nonce: 'n',
      accept_terms: true as const,
      confirm_adult: true as const,
      proof: { turnstile: 'tok' },
    };
    const r = await mk().anon.createSession(body);
    expect(calls[0]).toMatchObject({ url: 'https://ai.codai.ro/v1/anon/session', method: 'POST' });
    expect(JSON.parse(String(calls[0]!.body))).toEqual(body);
    expect(r.token).toBe('anon_v1.a.b');
  });

  it('status() GETs /v1/anon/status with the client key (the guest token)', async () => {
    const calls = stub(() => ({ budget_open: true, limits: LIMITS }));
    const r = await mk('anon_v1.p.s').anon.status();
    expect(calls[0]).toMatchObject({
      url: 'https://ai.codai.ro/v1/anon/status',
      method: 'GET',
      auth: 'Bearer anon_v1.p.s',
    });
    expect(r.budget_open).toBe(true);
  });

  it('importChat() POSTs anon_token + messages and omits an absent title', async () => {
    const calls = stub(() => ({ session_id: 'sess-1' }));
    const r = await mk('sk-new').anon.importChat({
      anon_token: 'anon_v1.p.s',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
    expect(calls[0]).toMatchObject({ url: 'https://ai.codai.ro/v1/anon/import', method: 'POST' });
    expect(JSON.parse(String(calls[0]!.body))).toEqual({
      anon_token: 'anon_v1.p.s',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
    expect(r.session_id).toBe('sess-1');
  });

  it('startGuestSession() chains challenge → pow → session with terms accepted', async () => {
    const calls = stub((url) =>
      url.includes('/challenge')
        ? { nonce: 'nonce-xyz', pow_bits: 8, expires_at: 'x' }
        : { token: 'anon_v1.t.s', session_id: 's', expires_at: 'x', limits: LIMITS },
    );
    const r = await mk('guest').anon.startGuestSession({ surface: 'vscode', deviceId: DEVICE });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/anon/challenge?surface=vscode');
    const sent = JSON.parse(String(calls[1]!.body));
    expect(sent).toMatchObject({
      surface: 'vscode',
      device_id: DEVICE,
      nonce: 'nonce-xyz',
      accept_terms: true,
      confirm_adult: true,
    });
    const hex = createHash('sha256')
      .update(`nonce-xyz:${DEVICE}:${sent.proof.pow.counter}`)
      .digest('hex');
    expect(leadingZeroBits(hex)).toBeGreaterThanOrEqual(8);
    expect(r.token).toBe('anon_v1.t.s');
  });
});
