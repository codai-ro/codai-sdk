import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  CodaiError,
  Codai,
  vaultResolveDigestInput,
  vaultResolveMessage,
  vaultUnlockMessage,
} from '../index';

const ITEM = '0b7d1a2e-1111-4222-8333-444455556666';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function stub(replies: { status: number; body: unknown }[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: String(init.method),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      const r = replies.shift() ?? { status: 200, body: { ok: true } };
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vault (V-05 SDK)', () => {
  it('maps account, items, cloud copy and rules to their routes with ciphertext-only bodies', async () => {
    const calls = stub([]);
    const v = new Codai({ apiKey: 'sk-test', maxRetries: 2 }).vault;
    await v.putAccount({ bundle: { slots: [] }, revision: 2 });
    await v.setDefaultTier('t2');
    await v.items({ since: '2026-10-18T00:00:00Z' });
    await v.putItem(ITEM, {
      id: ITEM,
      vault_id: ITEM,
      revision: 1,
      wrapped_key: 'w',
      ciphertext: 'c',
      kind: 'login',
    });
    await v.setItemCloud(ITEM, null);
    await v.deleteItem(ITEM);
    await v.createRule({ tier: 't1', agent: 'codaid*' });
    await v.events({ limit: 5 });
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'PUT /v1/vault/account',
      'PATCH /v1/vault/settings',
      'GET /v1/vault/items?since=2026-10-18T00%3A00%3A00Z',
      `PUT /v1/vault/items/${ITEM}`,
      `PUT /v1/vault/items/${ITEM}/cloud`,
      `DELETE /v1/vault/items/${ITEM}`,
      'POST /v1/vault/rules',
      'GET /v1/vault/events?limit=5',
    ]);
    expect(calls[1]!.body).toEqual({ default_tier: 't2' });
    expect(calls[4]!.body).toEqual({ item: null });
  });

  it('broker: use -> approval -> decide, and a 202 from http/resolve is a result, not an error', async () => {
    const calls = stub([
      {
        status: 200,
        body: { tier: 't3', allowed: false, reasons: ['approval'], approval_id: 'a 1' },
      },
      { status: 200, body: { status: 'approved' } },
      { status: 202, body: { approval_id: 'a2' } },
      { status: 202, body: { approvals: ['a3'] } },
    ]);
    const v = new Codai({ apiKey: 'sk-test', maxRetries: 2 }).vault;
    const d = await v.use({ handle: 'github', mode: 'http', action: 'push', host: undefined });
    expect(d.approval_id).toBe('a 1');
    expect(calls[0]!.body).toEqual({ handle: 'github', mode: 'http', action: 'push' });
    await v.decide('a 1', { decision: 'approve', scope: 'once', signature: 'sig' });
    expect(calls[1]!.url).toBe('https://ai.codai.ro/v1/vault/approvals/a%201/decide');
    expect(await v.httpCall({ handle: 'github', url: 'https://api.github.com/user' })).toEqual({
      approval_id: 'a2',
    });
    const proof = { device_id: 'cli-abcd1234', challenge: 'ch123', signature: 'sig' };
    expect(await v.resolve({ handles: ['db'], action: 'run', proof })).toEqual({
      approvals: ['a3'],
    });
    expect(calls[3]!.body).toEqual({ handles: ['db'], action: 'run', proof });
    // Mutations are never retried (one fetch each).
    expect(calls).toHaveLength(4);
  });

  it('resolveChallenge maps to POST /v1/vault/resolve/challenge; proof message matches the contract vector', async () => {
    const calls = stub([
      { status: 200, body: { challenge: 'ch123', expires_at: '2026-10-24T00:02:00Z' } },
    ]);
    const v = new Codai({ apiKey: 'sk-test', maxRetries: 2 }).vault;
    const ch = await v.resolveChallenge();
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', 'https://ai.codai.ro/v1/vault/resolve/challenge', {}],
    ]);
    const digest = createHash('sha256')
      .update(vaultResolveDigestInput(['github.token', 'aws.secret'], 'curl -H x https://api.github.com'))
      .digest('base64url');
    expect(digest).toBe('D_gl7EO9sGs-oo2tDZhv6JDMLE3vQ2Vo9jwdFPZRKdQ');
    expect(vaultResolveMessage(ch.challenge, 'cli-abcd1234', digest)).toBe(
      'codai-vault/resolve/v1|ch123|cli-abcd1234|D_gl7EO9sGs-oo2tDZhv6JDMLE3vQ2Vo9jwdFPZRKdQ',
    );
  });

  it('devices: challenge -> enroll -> list -> rename -> revoke map to /v1/vault/devices and unwrap replies', async () => {
    const device = {
      id: 'android-pixel.9a',
      kind: 'android_keystore',
      name: 'Pixel',
      surface: 'phone',
      public_key: 'spki',
      attestation: 'android-strongbox',
      attestation_info: {},
      created_at: '2026-10-19T00:00:00Z',
      last_used_at: null,
      revoked_at: null,
    };
    const calls = stub([
      { status: 200, body: { nonce: 'n0', expires_at: '2026-10-19T00:05:00Z' } },
      { status: 201, body: { device } },
      { status: 200, body: { devices: [device] } },
      { status: 200, body: { device: { ...device, name: 'Phone' } } },
      { status: 200, body: { ok: true } },
    ]);
    const d = new Codai({ apiKey: 'sk-test', maxRetries: 2 }).vault.devices;
    const ch = await d.challenge();
    expect(ch.nonce).toBe('n0');
    const enrolled = await d.enroll({
      device_id: device.id,
      kind: 'android_keystore',
      name: 'Pixel',
      surface: 'phone',
      public_key: 'spki',
      nonce: ch.nonce,
      vault_signature: 'vs',
      device_signature: 'ds',
      attestation: { android_chain: ['leaf', 'root'] },
    });
    expect(enrolled.attestation).toBe('android-strongbox');
    expect((await d.list()).map((x) => x.id)).toEqual([device.id]);
    expect((await d.rename(device.id, 'Phone')).name).toBe('Phone');
    expect(await d.revoke(device.id)).toEqual({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'POST /v1/vault/devices/challenge',
      'POST /v1/vault/devices',
      'GET /v1/vault/devices',
      `PATCH /v1/vault/devices/${device.id}`,
      `DELETE /v1/vault/devices/${device.id}`,
    ]);
    expect(calls[0]!.body).toEqual({});
    expect(calls[1]!.body).toMatchObject({
      nonce: 'n0',
      attestation: { android_chain: ['leaf', 'root'] },
    });
    expect(calls[3]!.body).toEqual({ name: 'Phone' });
  });

  it('decide sends a v2 device or passkey proof instead of a v1 signature, and a bare deny', async () => {
    const calls = stub([]);
    const v = new Codai({ apiKey: 'sk-test', maxRetries: 2 }).vault;
    await v.decide('a1', {
      decision: 'approve',
      scope: 'once',
      via: 'phone',
      proof: { type: 'device', device_id: 'android-pixel.9a', signature: 'sig' },
    });
    await v.decide('a1', {
      decision: 'approve',
      scope: '1h',
      proof: { type: 'passkey', response: { id: 'cred', type: 'public-key' } },
    });
    await v.decide('a1', { decision: 'deny', scope: 'once', via: 'phone' });
    expect(calls.map((c) => c.body)).toEqual([
      {
        decision: 'approve',
        scope: 'once',
        via: 'phone',
        proof: { type: 'device', device_id: 'android-pixel.9a', signature: 'sig' },
      },
      {
        decision: 'approve',
        scope: '1h',
        proof: { type: 'passkey', response: { id: 'cred', type: 'public-key' } },
      },
      { decision: 'deny', scope: 'once', via: 'phone' },
    ]);
  });

  it('v4 guards: settings, lock, unlock, limits and revoke-task map to their routes and unwrap replies', async () => {
    const guards = {
      new_host: true,
      burst_max: 3,
      burst_window_s: 60,
      hour_start: 7,
      hour_end: 23,
      tz: 'Europe/Bucharest',
    };
    const lim = { item_id: ITEM, per_minute: 5, per_day: null, units_per_day: 200 };
    const calls = stub([
      { status: 200, body: { default_tier: 't3', guards } },
      {
        status: 200,
        body: { locked_at: '2026-10-20T10:00:00Z', grants_revoked: 2, approvals_denied: 1 },
      },
      {
        status: 200,
        body: { challenge: 'c0', expires_at: '2026-10-20T10:05:00Z', message_template: 't' },
      },
      { status: 200, body: { unlocked: true } },
      { status: 200, body: { limits: [lim] } },
      { status: 200, body: { limits: lim } },
      { status: 200, body: { limits: null } },
      { status: 200, body: { revoked: 3 } },
    ]);
    const v = new Codai({ apiKey: 'sk-test', maxRetries: 2 }).vault;
    expect((await v.updateSettings({ guards: { burst_max: 3 } })).guards.burst_max).toBe(3);
    expect((await v.lock({ via: 'phone' })).grants_revoked).toBe(2);
    const ch = await v.unlockChallenge();
    expect(vaultUnlockMessage(ch.challenge, 'android-pixel.9a')).toBe(
      'codai-vault/unlock/v1|c0|android-pixel.9a',
    );
    expect(
      await v.unlock({
        challenge: ch.challenge,
        proof: { type: 'device', device_id: 'android-pixel.9a', signature: 'sig' },
        via: 'phone',
      }),
    ).toEqual({ unlocked: true });
    expect(await v.limits()).toEqual([lim]);
    expect(await v.setLimits(ITEM, { per_minute: 5, per_day: null, units_per_day: 200 })).toEqual(
      lim,
    );
    expect(
      await v.setLimits(ITEM, { per_minute: null, per_day: null, units_per_day: null }),
    ).toBeNull();
    expect(await v.revokeTaskGrants('task-1')).toEqual({ revoked: 3 });
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://ai.codai.ro', '')}`)).toEqual([
      'PATCH /v1/vault/settings',
      'POST /v1/vault/lock',
      'POST /v1/vault/unlock/challenge',
      'POST /v1/vault/unlock',
      'GET /v1/vault/limits',
      `PUT /v1/vault/items/${ITEM}/limits`,
      `PUT /v1/vault/items/${ITEM}/limits`,
      'POST /v1/vault/grants/revoke-task',
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      { guards: { burst_max: 3 } },
      { via: 'phone' },
      {},
      {
        challenge: 'c0',
        proof: { type: 'device', device_id: 'android-pixel.9a', signature: 'sig' },
        via: 'phone',
      },
      undefined,
      { per_minute: 5, per_day: null, units_per_day: 200 },
      { per_minute: null, per_day: null, units_per_day: null },
      { task: 'task-1' },
    ]);
    await expect(v.updateSettings({})).rejects.toThrow(TypeError);
  });

  it('lock without via sends an empty body; 429 vault_rate_limited surfaces code + Retry-After', async () => {
    const calls: { body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        calls.push({ body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
        if (calls.length === 1)
          return new Response(
            JSON.stringify({ locked_at: 'x', grants_revoked: 0, approvals_denied: 0 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        return new Response(
          JSON.stringify({
            error: { code: 'vault_rate_limited', type: 'rate_limit_error', message: 'cap' },
          }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '60' } },
        );
      }),
    );
    const v = new Codai({ apiKey: 'sk-test', maxRetries: 0 }).vault;
    await v.lock();
    expect(calls[0]!.body).toEqual({});
    const err = await v
      .use({ handle: 'github', mode: 'http', action: 'push' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(429);
    expect((err as CodaiError).code).toBe('vault_rate_limited');
    expect((err as CodaiError).retryAfter).toBe(60);
  });
});
