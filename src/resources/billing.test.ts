import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, type BillingOverview } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function overview(balance: number): BillingOverview {
  return {
    plan: {
      tier_slug: 'pro',
      tier_label: 'Pro',
      tasks_per_month: 100,
      tasks_used_this_month: 3,
      has_active_subscription: true,
      supports_byok: true,
      subscription: {
        status: 'active',
        current_period_end: '2026-11-01T00:00:00.000Z',
        cancel_at_period_end: false,
        monthly_eur: 19,
      },
    },
    wallet: { balance_eur: balance, next_expiry_at: null, promo_granted_eur: 0, history: [] },
    auto_topup: {
      enabled: false,
      threshold_eur: 5,
      amount_eur: 20,
      monthly_cap_eur: 100,
      month_spent_eur: 0,
      last_topup_at: null,
      failures: 0,
    },
    compute_reserve_eur: 0,
    payment_methods: [],
    links: {
      billing: 'https://hub.codai.ro/billing',
      portal: 'https://pay.codai.ro/portal',
      topup: { '10': 'https://pay.codai.ro/checkout?topup=10' },
      checkout_plan: {},
    },
  };
}

type Call = { url: string; method: string };
function stub(next: () => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: String(init.method ?? 'GET') });
      return next();
    }),
  );
  return calls;
}

describe('billing', () => {
  it('get() GETs /v1/billing', async () => {
    const calls = stub(() => json(overview(12.5)));
    const r = await mk().billing.get();
    expect(calls).toEqual([{ url: 'https://ai.codai.ro/v1/billing', method: 'GET' }]);
    expect(r.wallet.balance_eur).toBe(12.5);
  });

  it('invoices() GETs /v1/billing/invoices with limit and unwraps the list', async () => {
    const inv = {
      id: 'inv_1',
      kind: 'invoice',
      number: 'CDI-0001',
      issued_at: '2026-10-01T00:00:00.000Z',
      total_eur: 19,
      currency: 'EUR',
      efactura_status: null,
      pdf_url: 'https://hub.codai.ro/api/billing/fiscal/inv_1/pdf',
    };
    const calls = stub(() => json({ invoices: [inv] }));
    const r = await mk().billing.invoices({ limit: 5 });
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/billing/invoices?limit=5');
    expect(r).toEqual([inv]);
  });

  it('watchBalance() calls onLow once per crossing, only GETs, and stops', async () => {
    vi.useFakeTimers();
    const balances = [10, 4, 3, 8, 2];
    let i = 0;
    const calls = stub(() => json(overview(balances[Math.min(i++, balances.length - 1)]!)));
    const lows: number[] = [];
    const stop = mk().billing.watchBalance({
      thresholdEur: 5,
      intervalMs: 1_000,
      onLow: (b) => {
        lows.push(b);
      },
    });
    for (let k = 0; k < 5; k++) await vi.advanceTimersByTimeAsync(1_000);
    stop();
    const n = calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(lows).toEqual([4, 2]);
    expect(calls.length).toBe(n);
    expect(calls.every((c) => c.method === 'GET' && c.url.endsWith('/v1/billing'))).toBe(true);
  });

  it('watchBalance() keeps polling after an error and honours an aborted signal', async () => {
    vi.useFakeTimers();
    let i = 0;
    stub(() => (i++ === 0 ? json({ error: { message: 'boom' } }, 500) : json(overview(1))));
    const errors: unknown[] = [];
    const lows: number[] = [];
    const ctrl = new AbortController();
    mk().billing.watchBalance({
      thresholdEur: 5,
      intervalMs: 1_000,
      signal: ctrl.signal,
      onLow: (b) => {
        lows.push(b);
      },
      onError: (e) => errors.push(e),
    });
    await vi.advanceTimersByTimeAsync(1_500);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(errors).toHaveLength(1);
    expect(lows).toEqual([1]);
    expect(i).toBe(2);
  });
});
