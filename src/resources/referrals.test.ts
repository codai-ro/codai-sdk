import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string; body: unknown };
function stub(body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: String(init.method ?? 'GET'), body: init.body });
      return json(body);
    }),
  );
  return calls;
}

describe('referrals', () => {
  it('get() GETs /v1/referrals', async () => {
    const view = {
      referral: null,
      redeem_until: null,
      referrals: [
        {
          id: '11111111-2222-4333-8444-555555555555',
          referee: '#a1b2c3',
          status: 'pending',
          created_at: '2026-10-01T00:00:00.000Z',
          rewarded_at: null,
          reward_eur: null,
        },
      ],
    };
    const calls = stub(view);
    const r = await mk().referrals.get();
    expect(calls[0]).toMatchObject({ url: 'https://ai.codai.ro/v1/referrals', method: 'GET' });
    expect(r.referrals[0]!.referee).toBe('#a1b2c3');
  });

  it('redeem() PATCHes /v1/account with referral_code only', async () => {
    const calls = stub({ referral_result: 'ok' });
    await mk().referrals.redeem('ana_pop');
    expect(calls[0]).toMatchObject({ url: 'https://ai.codai.ro/v1/account', method: 'PATCH' });
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ referral_code: 'ana_pop' });
  });

  it('setConsent() PATCHes /v1/account with referral_consent only', async () => {
    const calls = stub({});
    await mk().referrals.setConsent(false);
    expect(calls[0]!.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ referral_consent: false });
  });
});
