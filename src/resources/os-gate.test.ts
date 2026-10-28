import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError, type OsGateEvent } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

describe('osGate', () => {
  it('policy() GETs /v1/policy and returns the folded policy', async () => {
    const calls = stub([json({ os_gate: { allow_override: false } })]);
    const r = await mk().osGate.policy();
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/policy');
    expect(r.os_gate.allow_override).toBe(false);
  });

  it('policy() surfaces 503 policy_unavailable as a CodaiError', async () => {
    stub([
      json({ error: { message: 'down', type: 'server_error', code: 'policy_unavailable' } }, 503),
    ]);
    const err = await mk()
      .osGate.policy()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(503);
    expect((err as CodaiError).code).toBe('policy_unavailable');
  });

  it('recordEvent() POSTs the event verbatim to /v1/os-gate/events and returns the 202 body', async () => {
    const calls = stub([json({ ok: true }, 202)]);
    const event: OsGateEvent = {
      action: 'granted',
      checks: ['win.uac_off', 'win.uac_no_prompt'],
      surface: 'desktop',
      app_version: '0.9.4',
      at: '2026-10-19T21:00:00.000Z',
    };
    const r = await mk().osGate.recordEvent(event);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/os-gate/events');
    expect(JSON.parse(String(calls[0]!.body))).toEqual(event);
    expect(r).toEqual({ ok: true });
  });
});
