import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodaiApps, CodaiError } from '../index';

type Seen = { url: string; method: string; auth: string | null; body: unknown };

function capture(payloads: Array<{ body: unknown; status?: number }>) {
  const seen: Seen[] = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      seen.push({
        url,
        method: init.method ?? 'GET',
        auth: headers.get('authorization'),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      const p = payloads[Math.min(i++, payloads.length - 1)]!;
      return new Response(JSON.stringify(p.body), { status: p.status ?? 200 });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () =>
  new CodaiApps({ appToken: 'codai_app_t', validateToken: 'vsecret', maxRetries: 0 });
const route = (s: Seen) => `${s.method} ${s.url.replace(/^https:\/\/api\.codai\.ro/, '')}`;

describe('CodaiApps', () => {
  it('requires a token', () => {
    expect(() => new CodaiApps({})).toThrow(/appToken or validateToken/);
  });

  it('mints with the app token and unwraps data', async () => {
    const seen = capture([
      {
        body: {
          ok: true,
          data: {
            id: 'k1',
            key: 'codai_x',
            prefix: 'codai_x',
            subscriptionId: null,
            expiresAt: null,
          },
        },
      },
    ]);
    const r = await mk().keys.mint({ email: 'a@b.ro', endUserExternalId: 'u:1', tierSlug: 'pro' });
    expect(r.key).toBe('codai_x');
    expect(route(seen[0]!)).toBe('POST /apps/keys');
    expect(seen[0]!.auth).toBe('Bearer codai_app_t');
    expect(seen[0]!.body).toEqual({ email: 'a@b.ro', endUserExternalId: 'u:1', tierSlug: 'pro' });
  });

  it('lists with query, encodes ids, and maps every route', async () => {
    const seen = capture([{ body: { ok: true, data: [] } }]);
    const c = mk();
    await c.keys.list({ endUserExternalId: 'u:1', limit: 5 });
    await c.keys.update('a/b', { enabled: false });
    await c.keys.revoke('k1');
    await c.keys.usage('k1', 7);
    await c.users.getOverride('u:1');
    await c.users.setOverride('u:1', { tasksPerDay: 10, resetUsage: true });
    await c.users.clearOverride('u:1');
    await c.subscriptions.sync({
      email: 'a@b.ro',
      event: { id: 'evt', type: 'customer.subscription.updated' },
    });
    expect(seen.map(route)).toEqual([
      'GET /apps/keys?endUserExternalId=u%3A1&limit=5',
      'PATCH /apps/keys/a%2Fb',
      'DELETE /apps/keys/k1',
      'GET /apps/keys/k1/usage?days=7',
      'GET /apps/users/u%3A1/overrides',
      'PUT /apps/users/u%3A1/overrides',
      'DELETE /apps/users/u%3A1/overrides',
      'POST /apps/subscriptions/sync',
    ]);
    expect(seen[5]!.body).toEqual({ tasksPerDay: 10, resetUsage: true });
  });

  it('throws CodaiError with the mgmt error code on non-2xx', async () => {
    capture([{ body: { ok: false, error: { code: 'no_key_for_external_id' } }, status: 404 }]);
    const err = await mk()
      .users.getOverride('nope')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(404);
    expect((err as CodaiError).code).toBe('no_key_for_external_id');
  });

  it('throws on a 200 ok=false envelope', async () => {
    capture([{ body: { ok: false } }]);
    await expect(mk().keys.list()).rejects.toBeInstanceOf(CodaiError);
  });

  it('never retries mint, retries idempotent reads', async () => {
    const seen = capture([{ body: {}, status: 503 }, { body: { ok: true, data: [] } }]);
    const c = new CodaiApps({ appToken: 't', maxRetries: 1 });
    await expect(c.keys.mint({ email: 'a@b.ro', endUserExternalId: 'u' })).rejects.toBeInstanceOf(
      CodaiError,
    );
    expect(seen).toHaveLength(1);
    await expect(c.keys.list()).resolves.toEqual([]);
  }, 10_000);

  it('revokeAllFor skips revoked keys', async () => {
    const seen = capture([
      {
        body: {
          ok: true,
          data: [
            { id: 'a', revokedAt: null },
            { id: 'b', revokedAt: '2026-10-01T00:00:00Z' },
          ],
        },
      },
      { body: { ok: true, data: { id: 'a' } } },
    ]);
    expect(await mk().keys.revokeAllFor('u:1')).toBe(1);
    expect(seen.map(route)).toEqual([
      'GET /apps/keys?endUserExternalId=u%3A1&limit=200',
      'DELETE /apps/keys/a',
    ]);
  });

  it('validateKey uses the validate secret and returns the raw reply', async () => {
    const seen = capture([
      { body: { ok: false, valid: false, reason: 'key_not_found_or_disabled' } },
    ]);
    const r = await mk().validateKey('codai_plain');
    expect(r.valid).toBe(false);
    expect(route(seen[0]!)).toBe('POST /internal/keys/validate');
    expect(seen[0]!.auth).toBe('Bearer vsecret');
    expect(seen[0]!.body).toEqual({ key: 'codai_plain' });
  });

  it('refuses calls whose token is missing', async () => {
    await expect(new CodaiApps({ validateToken: 'v' }).keys.list()).rejects.toThrow(/appToken/);
    await expect(new CodaiApps({ appToken: 'a' }).validateKey('x')).rejects.toThrow(
      /validateToken/,
    );
  });
});
