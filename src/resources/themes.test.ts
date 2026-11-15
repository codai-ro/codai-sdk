import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';
import type { CatalogTheme, ThemesCatalog } from './themes';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const theme = {
  id: 'catalog.dracula',
  name: 'Dracula',
  base: 'dark',
  accentHue: 300,
  colors: { bg: '#282a36', foreground: '#f8f8f2' },
  author: 'Zeno Rocha',
  license: {
    spdx: 'MIT',
    copyright: 'Copyright (c) Dracula Theme',
    url: 'https://example.com/LICENSE',
  },
  source: {
    repo: 'dracula/visual-studio-code',
    commit: 'abc',
    path: 'theme.json',
    url: 'https://example.com',
  },
} satisfies CatalogTheme;
const catalog = {
  version: '2026.10.30-1',
  etag: '"abc123"',
  themes: [theme],
} satisfies ThemesCatalog;

type Call = { url: string; method: string; headers: Record<string, string> };
function stub(replies: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: String(init.method ?? 'GET'),
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      return replies.shift()!;
    }),
  );
  return calls;
}

describe('themes', () => {
  it('list() GETs /v1/themes without If-None-Match and returns the catalogue', async () => {
    const calls = stub([json(catalog)]);
    const r = await mk().themes.list();
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/themes');
    expect(calls[0]!.headers['If-None-Match']).toBeUndefined();
    expect(r).toEqual(catalog);
  });

  it('list({ etag }) sends If-None-Match and maps 304 to { notModified: true }', async () => {
    const calls = stub([new Response(null, { status: 304 })]);
    const r = await mk().themes.list({ etag: '"abc123"' });
    expect(calls[0]!.headers['If-None-Match']).toBe('"abc123"');
    expect(r).toEqual({ notModified: true });
  });

  it('list({ etag }) returns the fresh catalogue when the ETag is stale', async () => {
    stub([json(catalog)]);
    const r = await mk().themes.list({ etag: '"old"' });
    expect(r).toEqual(catalog);
  });

  it('list() throws CodaiError on non-2xx', async () => {
    stub([json({ error: { code: 'internal_error', message: 'boom' } }, 500)]);
    const err = await mk()
      .themes.list()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodaiError);
    expect((err as CodaiError).status).toBe(500);
  });
});
