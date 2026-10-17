import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

afterEach(() => vi.unstubAllGlobals());

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

const DOC_ID = '5a7b2c3d-0000-4000-8000-000000000020';
const CID = '7a1b2c3d-0000-4000-8000-000000000041';
const creative = (existing: boolean) => ({
  id: CID,
  object: 'studio.creative',
  kind: 'deck',
  title: 'Rezultate T3',
  head_seq: 1,
  version: { seq: 1, doc_hash: 'abc' },
  doc: { schemaVersion: 1, kind: 'deck', title: 'Rezultate T3', scenes: [] },
  document_id: DOC_ID,
  existing,
});
const document = {
  id: '5a7b2c3d-0000-4000-8000-000000000021',
  object: 'studio.document',
  type: 'deck',
  theme: 'codai-light',
  model: 'codai-docs',
  title: 'Rezultate T3',
  version: 2,
  based_on: DOC_ID,
  warnings: [],
  cost_micro_usd: '0',
  creative_id: CID,
  file: { asset_id: '5a7b2c3d-0000-4000-8000-000000000021' },
};

describe('creatives from documents', () => {
  it('fromDocument POSTs /v1/studio/documents/{id}/creative without a body (201 new)', async () => {
    const calls = stub([json(creative(false), 201)]);
    const c = await mk().creatives.fromDocument(DOC_ID);
    expect(c.existing).toBe(false);
    expect(c.document_id).toBe(DOC_ID);
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `https://ai.codai.ro/v1/studio/documents/${DOC_ID}/creative`,
        body: undefined,
      },
    ]);
  });

  it('fromDocument resolves the already linked creative (200 existing) and encodes the id', async () => {
    const calls = stub([json(creative(true))]);
    const c = await mk().creatives.fromDocument('a/b');
    expect(c.existing).toBe(true);
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/studio/documents/a%2Fb/creative');
  });

  it('build POSTs /v1/studio/creatives/{id}/build with seq, preview and filename', async () => {
    const calls = stub([
      json({
        object: 'studio.creative_build',
        creative_id: CID,
        seq: 4,
        warnings: ['skipped node logo (shape) on s2'],
        document,
      }),
    ]);
    const b = await mk().creatives.build(CID, { seq: 4, preview: true, filename: 'raport.pptx' });
    expect(b.document.version).toBe(2);
    expect(b.document.creative_id).toBe(CID);
    expect(b.warnings).toEqual(['skipped node logo (shape) on s2']);
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `https://ai.codai.ro/v1/studio/creatives/${CID}/build`,
        body: { seq: 4, preview: true, filename: 'raport.pptx' },
      },
    ]);
  });

  it('build without options sends an empty body and drops undefined fields', async () => {
    const calls = stub([
      json({ object: 'studio.creative_build', creative_id: CID, seq: 1, warnings: [], document }),
      json({ object: 'studio.creative_build', creative_id: CID, seq: 1, warnings: [], document }),
    ]);
    await mk().creatives.build(CID);
    await mk().creatives.build(CID, { seq: undefined, preview: false });
    expect(calls.map((c) => c.body)).toEqual([{}, { preview: false }]);
  });

  it('surfaces document_spec_missing and not_supported_for_kind as CodaiError', async () => {
    stub([
      json(
        {
          error: {
            message: 'no spec',
            type: 'invalid_request_error',
            code: 'document_spec_missing',
          },
        },
        409,
      ),
      json(
        {
          error: {
            message: 'video creatives cannot be built',
            type: 'invalid_request_error',
            code: 'not_supported_for_kind',
          },
        },
        400,
      ),
    ]);
    const a = await mk()
      .creatives.fromDocument(DOC_ID)
      .catch((e: unknown) => e);
    expect(a).toBeInstanceOf(CodaiError);
    expect((a as CodaiError).status).toBe(409);
    const b = await mk()
      .creatives.build(CID)
      .catch((e: unknown) => e);
    expect((b as CodaiError).code).toBe('not_supported_for_kind');
  });
});
