import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(payload: unknown, status = 200) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      return new Response(JSON.stringify(payload), { status });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });
const route = (s: Seen) => `${s.method} ${s.url.replace(/^https:\/\/ai\.codai\.ro/, '')}`;

describe('client.memory', () => {
  it('lists with no query by default and every filter when given', async () => {
    const seen = capture({ memories: [], total: 0 });
    const c = mk();
    await c.memory.list();
    await c.memory.list({ tier: 'episodic', limit: 5, offset: 10 });
    expect(seen.map(route)).toEqual([
      'GET /v1/memory',
      'GET /v1/memory?tier=episodic&limit=5&offset=10',
    ]);
  });

  it('searches with q and limit', async () => {
    const seen = capture({
      memories: [{ id: 'm1', tier: 'semantic', content: 'tea', relevance: 0.9 }],
    });
    const r = await mk().memory.search({ q: 'drinks', limit: 3 });
    expect(seen.map(route)).toEqual(['GET /v1/memory/search?q=drinks&limit=3']);
    expect(r.memories[0]!.relevance).toBe(0.9);
  });

  it('creates with a JSON body and returns the id', async () => {
    const seen = capture({ id: 'm2' }, 201);
    const r = await mk().memory.create({ content: 'prefers RON', importance: 0.8 });
    expect(r.id).toBe('m2');
    expect(seen[0]).toMatchObject({
      method: 'POST',
      body: { content: 'prefers RON', importance: 0.8 },
    });
    expect(route(seen[0]!)).toBe('POST /v1/memory');
  });

  it('deletes by encoded id', async () => {
    const seen = capture({ deleted: true });
    const r = await mk().memory.delete('a/b');
    expect(r.deleted).toBe(true);
    expect(seen.map(route)).toEqual(['DELETE /v1/memory/a%2Fb']);
  });

  it('deleteAll sends the explicit confirm=all and returns the counts (AL-234)', async () => {
    const seen = capture({
      deleted: { semantic: 2, episodic: 1, procedural: 0, graph: 0 },
      total: 3,
    });
    const r = await mk().memory.deleteAll();
    expect(r.total).toBe(3);
    expect(seen.map(route)).toEqual(['DELETE /v1/memory?confirm=all']);
  });
});
