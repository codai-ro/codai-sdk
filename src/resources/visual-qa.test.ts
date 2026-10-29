import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

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

describe('visualQa', () => {
  it('findings() passes comma-separated filters as query', async () => {
    const calls = stub([json({ findings: [] })]);
    await mk().visualQa.findings({ status: 'todo,in-progress', severity: 'P0' });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/v1/vqa/findings');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      status: 'todo,in-progress',
      severity: 'P0',
    });
  });

  it('claim/resolve normalise the ref to UI-<n>', async () => {
    const calls = stub([json({ ok: true, finding: {} }), json({ ok: true, finding: {} })]);
    await mk().visualQa.claim(142);
    await mk().visualQa.resolve('ui-7', { status: 'fixed', fixRef: 'abc' });
    expect(new URL(calls[0]!.url).pathname).toBe('/v1/vqa/findings/UI-142/claim');
    expect(calls[0]!.method).toBe('POST');
    expect(new URL(calls[1]!.url).pathname).toBe('/v1/vqa/findings/UI-7/resolve');
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ status: 'fixed', fixRef: 'abc' });
  });

  it('recapture() posts screens and returns the queued id', async () => {
    const calls = stub([json({ id: 9, state: 'queued' })]);
    const r = await mk().visualQa.recapture({ screens: ['SCR-hub-ops-agentq'], finding: 'UI-142' });
    expect(new URL(calls[0]!.url).pathname).toBe('/v1/vqa/recaptures');
    expect(r).toEqual({ id: 9, state: 'queued' });
  });

  it('a 409 bad transition surfaces as CodaiError', async () => {
    stub([json({ error: { code: 'bad_transition', message: 'no' } }, 409)]);
    await expect(mk().visualQa.resolve('UI-1', { status: 'todo' })).rejects.toBeInstanceOf(
      CodaiError,
    );
  });
});
