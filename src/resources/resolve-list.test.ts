import { describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';
import { type ResolveJob } from './resolve';

const job = (id: string): ResolveJob => ({
  id,
  status: 'resolved',
  repo_url: 'https://github.com/o/r',
  tier: 't7',
  quote_micro_usd: 7_000_000,
  triage_reason: null,
  decline_reason: null,
  fail_reason: null,
  cost_micro_usd: 0,
  attestation_id: null,
  attestation_url: null,
  created_at: '2026-10-16T00:00:00.000Z',
  completed_at: null,
  issue_url: 'https://github.com/o/r/issues/1',
  issue_title: 'it crashes',
});

function stub(pages: Array<{ jobs: ResolveJob[]; next_cursor: string | null }>) {
  const urls: string[] = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(pages[i++]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const c = new Codai({ apiKey: 'codai_test', maxRetries: 0, fetch: fetchMock as never });
  return { c, urls };
}

describe('client.resolve.list / iterate', () => {
  it('list() GETs /v1/resolve/jobs on the resolve host with status csv, limit and cursor', async () => {
    const { c, urls } = stub([{ jobs: [job('a')], next_cursor: 'c1' }]);
    const r = await c.resolve.list({ status: ['running', 'quoted'], limit: 10, cursor: 'c0' });
    expect(urls[0]).toBe(
      'https://resolve.codai.ro/v1/resolve/jobs?status=running%2Cquoted&limit=10&cursor=c0',
    );
    expect(r.next_cursor).toBe('c1');
    expect(r.jobs[0]!.issue_title).toBe('it crashes');
  });

  it('list() with no query sends no query string', async () => {
    const { c, urls } = stub([{ jobs: [], next_cursor: null }]);
    await c.resolve.list();
    expect(urls[0]).toBe('https://resolve.codai.ro/v1/resolve/jobs');
  });

  it('iterate() follows next_cursor until null', async () => {
    const { c, urls } = stub([
      { jobs: [job('a'), job('b')], next_cursor: 'c1' },
      { jobs: [job('c')], next_cursor: null },
    ]);
    const ids: string[] = [];
    for await (const j of c.resolve.iterate({ status: 'resolved', limit: 2 })) ids.push(j.id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(urls).toEqual([
      'https://resolve.codai.ro/v1/resolve/jobs?status=resolved&limit=2',
      'https://resolve.codai.ro/v1/resolve/jobs?status=resolved&limit=2&cursor=c1',
    ]);
  });
});
