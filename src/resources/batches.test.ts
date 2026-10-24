import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string; body: unknown };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: String(init.method ?? 'GET'),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return replies.shift()!;
    }),
  );
  return calls;
}

const ID = '9b1c2d3e-0000-4000-8000-000000000060';
const TPL = '5d2e8f1a-3b4c-4d5e-9f60-7a8b9c0d1e2f';
const BASE = 'https://ai.codai.ro/v1/studio/batches';
const CSV = 'headline,price\nVara la mare,199\n';

const batch = (status: string, extra: Record<string, unknown> = {}) => ({
  id: ID,
  title: 'Promo',
  status,
  source: { kind: 'template', id: TPL, seq: null },
  total: 1,
  done: status === 'completed' ? 1 : 0,
  failed: 0,
  pending: status === 'completed' ? 0 : 1,
  skipped: 0,
  options: {},
  columns: { header: ['headline', 'price'], columns: [], unmapped_vars: [] },
  cost_micro_usd: '0',
  zip: { status: 'none', url: null, error: null },
  created_at: '2026-10-15T08:00:00Z',
  updated_at: '2026-10-15T08:00:00Z',
  finished_at: null,
  ...extra,
});

describe('client.batches (E-11b)', () => {
  it('create POSTs the body with dry_run false; dryRun POSTs dry_run true', async () => {
    const dry = {
      dry_run: true,
      columns: [{ name: 'headline', index: 0, maps_to: 'headline', kind: 'var' }],
      unmapped_vars: [],
      rows: 1,
      valid: 1,
      errors: [],
      preview: [
        { row: 0, title: null, locale: null, format: null, vars: { headline: 'Vara la mare' } },
      ],
      estimate: { renders: 0, localized_rows: 0 },
    };
    const calls = stub([json(dry), json({ batch: batch('queued') }, 201)]);
    const c = mk();
    const body = {
      source: { template_id: TPL },
      csv: CSV,
      mapping: { price: null },
      title: undefined,
    };
    expect((await c.batches.dryRun(body)).valid).toBe(1);
    expect((await c.batches.create(body)).batch.status).toBe('queued');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['POST', BASE],
      ['POST', BASE],
    ]);
    expect(calls[0]!.body).toEqual({
      source: { template_id: TPL },
      csv: CSV,
      mapping: { price: null },
      dry_run: true,
    });
    expect(calls[1]!.body).toEqual({
      source: { template_id: TPL },
      csv: CSV,
      mapping: { price: null },
      dry_run: false,
    });
  });

  it('create surfaces 400 invalid_rows as a CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'Every row is invalid.',
            type: 'invalid_request_error',
            code: 'invalid_rows',
          },
        },
        400,
      ),
    ]);
    const err = await mk()
      .batches.create({ source: { template_id: TPL }, csv: CSV })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(400);
  });

  it('list / get / cancel / retry / zip hit their routes with the query', async () => {
    const calls = stub([
      json({ batches: [batch('running')], next_before: null }),
      json({
        batch: batch('running'),
        rows: [
          {
            idx: 0,
            status: 'done',
            creative_id: null,
            render_id: null,
            render_url: null,
            locale: 'ro',
            title: null,
            error: null,
            cost_micro_usd: 0,
          },
        ],
      }),
      json(batch('cancelled')),
      json(batch('running')),
      json(batch('completed', { zip: { status: 'building', url: null, error: null } }), 202),
    ]);
    const c = mk();
    expect(
      (await c.batches.list({ limit: 10, before: '2026-10-15T08:00:00Z' })).batches,
    ).toHaveLength(1);
    expect(
      (await c.batches.get(ID, { rows: 1, status: 'done', limit: 20 })).rows?.[0]?.locale,
    ).toBe('ro');
    expect((await c.batches.cancel(ID)).status).toBe('cancelled');
    expect((await c.batches.retry(ID)).status).toBe('running');
    expect((await c.batches.zip(ID)).zip.status).toBe('building');
    expect(calls.map((x) => [x.method, x.url])).toEqual([
      ['GET', `${BASE}?limit=10&before=2026-10-15T08%3A00%3A00Z`],
      ['GET', `${BASE}/${ID}?rows=1&status=done&limit=20`],
      ['POST', `${BASE}/${ID}/cancel`],
      ['POST', `${BASE}/${ID}/retry`],
      ['POST', `${BASE}/${ID}/zip`],
    ]);
  });

  it('exportCsv returns the CSV text', async () => {
    const csv = 'headline,price,creative_id,status,error,render_url\nVara la mare,199,,done,,\n';
    const calls = stub([
      new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } }),
    ]);
    expect(await mk().batches.exportCsv(ID)).toBe(csv);
    expect(calls[0]!.url).toBe(`${BASE}/${ID}/export.csv`);
  });

  it('wait polls get until the batch is finished', async () => {
    const calls = stub([
      json({ batch: batch('queued') }),
      json({ batch: batch('running') }),
      json({ batch: batch('completed') }),
    ]);
    const done = await mk().batches.wait(ID, { intervalMs: 1 });
    expect(done.status).toBe('completed');
    expect(calls).toHaveLength(3);
    expect(calls.every((x) => x.url === `${BASE}/${ID}`)).toBe(true);
  });

  it('wait throws when the batch is not finished within timeoutMs', async () => {
    stub([json({ batch: batch('running') }), json({ batch: batch('running') })]);
    await expect(mk().batches.wait(ID, { intervalMs: 50, timeoutMs: 10 })).rejects.toThrow(
      /did not finish/,
    );
  });
});
