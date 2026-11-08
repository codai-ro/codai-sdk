import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

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

const DOC_ID = '5a7b2c3d-0000-4000-8000-000000000020';
const PREVIEW_ID = '6b8c3d4e-0000-4000-8000-000000000021';
const RENDER_ID = '7c9d4e5f-0000-4000-8000-000000000022';
const BASE = 'https://ai.codai.ro';

const fileAsset = {
  asset_id: DOC_ID,
  kind: 'document',
  status: 'ready',
  model: 'codai-docs',
  url: 'https://storage.googleapis.com/b/u/5a7b2c3d.pptx?X-Goog-Signature=abc',
  mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  bytes: 48211,
  duration_seconds: null,
  width: null,
  height: null,
  created_at: '2026-10-10T08:00:00.000Z',
  expires_at: '2026-10-10T09:00:00.000Z',
};

const document = {
  id: DOC_ID,
  object: 'studio.document',
  type: 'deck',
  theme: 'codai-light',
  model: 'codai-docs',
  title: 'Raport trimestrial — ședință',
  version: 1,
  based_on: null,
  warnings: [],
  cost_micro_usd: '0',
  file: fileAsset,
  preview: null,
};

const previewAccepted = {
  id: PREVIEW_ID,
  object: 'studio.preview',
  status: 'queued',
  document_id: DOC_ID,
  price_micro_usd_per_page: '2000',
  minimum_micro_usd: '10000',
};

const preview = (status: string, over: Record<string, unknown> = {}) => ({
  id: PREVIEW_ID,
  object: 'studio.preview',
  document_id: DOC_ID,
  model: 'codai-docs-preview',
  status,
  error: null,
  page_count: null,
  cost_micro_usd: '0',
  pdf: null,
  pages: [],
  contact_sheet_url: null,
  ...over,
});

const videoAccepted = {
  id: RENDER_ID,
  object: 'studio.render',
  status: 'queued',
  model: 'codai-render',
  quality: 'draft',
  aspect_ratio: '16:9',
  fps: 15,
  price_micro_usd_per_second: '5000',
  minimum_micro_usd: '25000',
  preview_id: PREVIEW_ID,
  narration_cost_micro_usd: '4200',
  slides: 2,
  duration_seconds: 9.4,
};

const renderStatus = (status: string, over: Record<string, unknown> = {}) => ({
  id: RENDER_ID,
  object: 'studio.render',
  status,
  progress: 0,
  quality: 'draft',
  aspect_ratio: '16:9',
  fps: 15,
  error: null,
  ...over,
});

const deckSpec = {
  slides: [
    { layout: 'title' as const, title: 'Raport trimestrial', subtitle: 'T3 2026' },
    {
      layout: 'bullets' as const,
      title: 'Rezultate',
      bullets: ['Venituri în creștere', 'Țintă atinsă'],
    },
  ],
};

describe('documents', () => {
  it('create() POSTs /v1/studio/documents with the spec and returns the document', async () => {
    const calls = stub([json(document)]);
    const r = await mk().documents.create({ type: 'deck', theme: 'codai-light', spec: deckSpec });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/v1/studio/documents`);
    expect(calls[0]!.body).toEqual({ type: 'deck', theme: 'codai-light', spec: deckSpec });
    expect(r.id).toBe(DOC_ID);
    expect(r.file.kind).toBe('document');
    expect(r.title).toBe('Raport trimestrial — ședință');
    expect(r.cost_micro_usd).toBe('0');
  });

  it('create() surfaces 400 invalid_spec as a CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'spec.slides: Required',
            type: 'invalid_request_error',
            code: 'invalid_spec',
          },
        },
        400,
      ),
    ]);
    await expect(
      mk().documents.create({ type: 'deck', spec: { slides: [] } as never }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('retrieve() GETs the document with its spec, URL-encoding the id', async () => {
    const calls = stub([json({ ...document, spec: deckSpec, latest_preview_id: PREVIEW_ID })]);
    const r = await mk().documents.retrieve('a/b');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe(`${BASE}/v1/studio/documents/a%2Fb`);
    expect(r.spec).toEqual(deckSpec);
    expect(r.latest_preview_id).toBe(PREVIEW_ID);
  });

  it('preview() POSTs .../previews (202) and retrievePreview() GETs /v1/studio/previews/{id}', async () => {
    const calls = stub([json(previewAccepted, 202), json(preview('rendering'))]);
    const docs = mk().documents;
    const acc = await docs.preview(DOC_ID);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/v1/studio/documents/${DOC_ID}/previews`);
    expect(calls[0]!.body).toEqual({});
    expect(acc.price_micro_usd_per_page).toBe('2000');
    const st = await docs.retrievePreview(acc.id);
    expect(calls[1]!.method).toBe('GET');
    expect(calls[1]!.url).toBe(`${BASE}/v1/studio/previews/${PREVIEW_ID}`);
    expect(st.status).toBe('rendering');
  });

  it('createPreviewAndWait() polls until succeeded and returns the preview', async () => {
    const done = preview('succeeded', {
      page_count: 2,
      cost_micro_usd: '10000',
      pdf: { ...fileAsset, asset_id: PREVIEW_ID, kind: 'preview', mime_type: 'application/pdf' },
      pages: [
        {
          page: 1,
          url: 'https://storage.googleapis.com/b/u/p001.png?s=1',
          width: 1280,
          height: 720,
        },
        {
          page: 2,
          url: 'https://storage.googleapis.com/b/u/p002.png?s=1',
          width: 1280,
          height: 720,
        },
      ],
      contact_sheet_url: 'https://storage.googleapis.com/b/u/contact.png?s=1',
    });
    const calls = stub([
      json(previewAccepted, 202),
      json(preview('queued')),
      json(preview('rendering')),
      json(done),
    ]);
    const r = await mk().documents.createPreviewAndWait(DOC_ID, { pollIntervalMs: 1 });
    expect(r.status).toBe('succeeded');
    expect(r.pages).toHaveLength(2);
    expect(r.pdf?.kind).toBe('preview');
    expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ['POST', `/v1/studio/documents/${DOC_ID}/previews`],
      ['GET', `/v1/studio/previews/${PREVIEW_ID}`],
      ['GET', `/v1/studio/previews/${PREVIEW_ID}`],
      ['GET', `/v1/studio/previews/${PREVIEW_ID}`],
    ]);
  });

  it('createPreviewAndWait() throws on failed', async () => {
    stub([
      json(previewAccepted, 202),
      json(preview('failed', { error: 'convert_failed: soffice timeout' })),
    ]);
    await expect(
      mk().documents.createPreviewAndWait(DOC_ID, { pollIntervalMs: 1 }),
    ).rejects.toThrow(/preview failed: convert_failed/);
  });

  it('createPreviewAndWait() throws on timeout', async () => {
    stub([json(previewAccepted, 202), json(preview('rendering'))]);
    await expect(
      mk().documents.createPreviewAndWait(DOC_ID, { pollIntervalMs: 50, timeoutMs: 10 }),
    ).rejects.toThrow(/did not finish within 10 ms/);
  });

  it('video() POSTs .../video and returns the queued render', async () => {
    const calls = stub([json(videoAccepted, 202)]);
    const body = {
      quality: 'draft' as const,
      transition: 'fade' as const,
      narrate: { model: 'codai-speech' as const, language: 'ro-RO' },
    };
    const r = await mk().documents.video(DOC_ID, body);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/v1/studio/documents/${DOC_ID}/video`);
    expect(calls[0]!.body).toEqual(body);
    expect(r.object).toBe('studio.render');
    expect(r.preview_id).toBe(PREVIEW_ID);
    expect(r.narration_cost_micro_usd).toBe('4200');
  });

  it('videoAndWait() polls renders.retrieve until the MP4 is ready', async () => {
    const mp4 = {
      ...fileAsset,
      asset_id: RENDER_ID,
      kind: 'render',
      model: 'codai-render',
      mime_type: 'video/mp4',
      duration_seconds: 9.4,
      width: 1920,
      height: 1080,
    };
    const qa = { duration_seconds: 9.4, width: 1920, height: 1080, lufs: null, warnings: [] };
    const calls = stub([
      json(videoAccepted, 202),
      json(renderStatus('queued')),
      json(
        renderStatus('succeeded', {
          progress: 1,
          data: [mp4],
          qa,
          cost_micro_usd: '47000',
          poster_url: 'https://storage.googleapis.com/b/u/r.poster.jpg?s=1',
        }),
      ),
    ]);
    const r = await mk().documents.videoAndWait(
      DOC_ID,
      { quality: 'draft' },
      { pollIntervalMs: 1 },
    );
    expect(r.id).toBe(RENDER_ID);
    expect(r.asset).toEqual(mp4);
    expect(r.qa).toEqual(qa);
    expect(r.costMicroUsd).toBe(47000);
    expect(r.posterUrl).toContain('poster.jpg');
    expect(r.accepted.slides).toBe(2);
    expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ['POST', `/v1/studio/documents/${DOC_ID}/video`],
      ['GET', `/v1/studio/renders/${RENDER_ID}`],
      ['GET', `/v1/studio/renders/${RENDER_ID}`],
    ]);
  });

  it('videoAndWait() throws on a failed render (e.g. preview_failed)', async () => {
    stub([
      json(videoAccepted, 202),
      json(renderStatus('failed', { error: 'preview_failed: convert_failed' })),
    ]);
    await expect(mk().documents.videoAndWait(DOC_ID, {}, { pollIntervalMs: 1 })).rejects.toThrow(
      /deck video failed: preview_failed/,
    );
  });

  it('videoAndWait() throws on timeout', async () => {
    stub([json(videoAccepted, 202), json(renderStatus('rendering', { progress: 0.3 }))]);
    await expect(
      mk().documents.videoAndWait(DOC_ID, {}, { pollIntervalMs: 50, timeoutMs: 10 }),
    ).rejects.toThrow(/did not finish within 10 ms/);
  });
});
