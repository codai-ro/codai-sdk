import { describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';
import { uploadIdFromLocation } from './transcripts';

function client(handler: (url: string, init: RequestInit) => Response) {
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init ?? {}),
  );
  return {
    codai: new Codai({
      apiKey: 'codai_test',
      baseUrl: 'https://gw.test',
      fetch: fetch as unknown as typeof globalThis.fetch,
      maxRetries: 0,
    }),
    fetch,
  };
}

describe('transcripts', () => {
  it('parses the upload id from absolute and relative Location headers', () => {
    expect(uploadIdFromLocation('https://ai.codai.ro/v1/uploads/u.abc')).toBe('u.abc');
    expect(uploadIdFromLocation('/v1/uploads/u.abc/')).toBe('u.abc');
  });

  it('lists with query params', async () => {
    const { codai, fetch } = client(() => Response.json({ transcripts: [], next_cursor: null }));
    const r = await codai.transcripts.list({ pinned: true, limit: 5 });
    expect(r.next_cursor).toBeNull();
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v1/transcripts');
    expect(url.searchParams.get('pinned')).toBe('1'); // gateway accepts true|false|1|0
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('uploads with tus: create, then PATCH chunks with continuous offsets and metadata', async () => {
    const seen: { method: string; headers: Record<string, string>; size: number }[] = [];
    let held = 0;
    const { codai } = client((_url, init) => {
      const headers = init.headers as Record<string, string>;
      const method = init.method ?? 'GET';
      if (method === 'POST') {
        seen.push({ method, headers, size: 0 });
        return new Response(null, {
          status: 201,
          headers: { Location: 'https://gw.test/v1/uploads/u1.f' },
        });
      }
      const size = (init.body as Uint8Array).byteLength;
      expect(Number(headers['Upload-Offset'])).toBe(held);
      held += size;
      seen.push({ method, headers, size });
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(held) } });
    });
    const progress: number[] = [];
    const id = await codai.transcripts.uploadAudio(new Uint8Array(25), {
      chunkSize: 10,
      track: 'system',
      transcriptId: 't-1',
      onProgress: (s) => progress.push(s),
    });
    expect(id).toBe('u1.f');
    expect(seen.map((s) => `${s.method}:${s.size}`)).toEqual([
      'POST:0',
      'PATCH:10',
      'PATCH:10',
      'PATCH:5',
    ]);
    expect(seen[0]!.headers['Upload-Length']).toBe('25');
    expect(seen[0]!.headers['Tus-Resumable']).toBe('1.0.0');
    const md = Object.fromEntries(
      seen[0]!.headers['Upload-Metadata']!.split(',').map((p) => {
        const [k, v] = p.split(' ');
        return [k, atob(v!)];
      }),
    );
    expect(md).toEqual({ track: 'system', transcript: 't-1' });
    expect(progress).toEqual([0, 10, 20, 25]);
  });

  it('resumes from the server offset', async () => {
    const methods: string[] = [];
    const { codai } = client((_url, init) => {
      const method = init.method ?? 'GET';
      methods.push(method);
      if (method === 'HEAD')
        return new Response(null, {
          status: 200,
          headers: { 'Upload-Offset': '20', 'Upload-Length': '25' },
        });
      return new Response(null, { status: 204, headers: { 'Upload-Offset': '25' } });
    });
    await codai.transcripts.uploadAudio(new Uint8Array(25), { uploadId: 'u1.f' });
    expect(methods).toEqual(['HEAD', 'PATCH']);
  });

  it('exports pdf/docx as bytes and text formats as text', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 \u0219');
    const { codai, fetch } = client((url) =>
      new URL(url).searchParams.get('format') === 'pdf'
        ? new Response(pdf, {
            headers: {
              'content-type': 'application/pdf',
              'content-disposition': `attachment; filename="Sedinta.pdf"; filename*=UTF-8''${encodeURIComponent('Ședință.pdf')}`,
            },
          })
        : new Response('# t\n', { headers: { 'content-type': 'text/markdown; charset=utf-8' } }),
    );
    const bin = await codai.transcripts.export('t1', 'pdf');
    expect(Array.from(bin.bytes)).toEqual(Array.from(pdf));
    expect(bin.filename).toBe('Ședință.pdf');
    expect(bin.contentType).toBe('application/pdf');
    const txt = await codai.transcripts.export('t1');
    expect(txt.text).toBe('# t\n');
    expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe('/v1/transcripts/t1/export');
  });

  it('creates, lists and revokes share links', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const { codai } = client((url, init) => {
      const method = init.method ?? 'GET';
      const path = new URL(url).pathname;
      calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'POST')
        return Response.json(
          {
            id: 's1',
            token: 'x'.repeat(43),
            url: `https://hub.codai.ro/t/${'x'.repeat(43)}`,
            expiresAt: null,
          },
          { status: 201 },
        );
      if (method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({
        data: [{ id: 's1', url: null, createdAt: '2026-10-06T00:00:00Z', expiresAt: null }],
      });
    });
    const created = await codai.transcripts.shares.create('t1', { expiresInDays: 7 });
    expect(created.url).toMatch(/^https:\/\/hub\.codai\.ro\/t\//);
    const list = await codai.transcripts.shares.list('t1');
    expect(list).toEqual([
      { id: 's1', url: null, createdAt: '2026-10-06T00:00:00Z', expiresAt: null },
    ]);
    await codai.transcripts.shares.revoke('t1', 's1');
    expect(calls).toEqual([
      { method: 'POST', path: '/v1/transcripts/t1/shares', body: { expiresInDays: 7 } },
      { method: 'GET', path: '/v1/transcripts/t1/shares', body: undefined },
      { method: 'DELETE', path: '/v1/transcripts/t1/shares/s1', body: undefined },
    ]);
  });

  it('reads the public view of a share token', async () => {
    const view = {
      title: 'T',
      createdAt: '2026-10-06T00:00:00Z',
      durationMs: 1,
      speakers: [],
      utterances: [],
      insights: null,
    };
    const { codai, fetch } = client(() => Response.json(view));
    expect(await codai.transcripts.publicView('tok_en')).toEqual(view);
    expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe('/v1/public/transcripts/tok_en');
  });
});
