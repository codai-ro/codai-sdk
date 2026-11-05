/** `POST /v1/embeddings`. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type EmbeddingsRequest = Mutable<Body<'createEmbeddings'>>;
export type EmbeddingsResponse = Reply<'createEmbeddings'>;

export interface EmbeddingsResult {
  /** One vector per input, in order. */
  embeddings: number[][];
  raw: EmbeddingsResponse;
  /** Upstream embedding model that produced the vectors (`x-codai-routed-to`). */
  routedTo: string | null;
  /** `<requested>-><served>` when a different model was substituted; vectors live in another space. */
  fallback: string | null;
  headers: Headers;
}

export class Embeddings {
  constructor(private readonly http: HttpClient) {}

  async create(
    body: Omit<EmbeddingsRequest, 'model'> & { model?: string },
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<EmbeddingsResult> {
    const res = await this.http.request('/v1/embeddings', {
      body: { ...body, model: body.model ?? 'codai-embed' },
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as EmbeddingsResponse;
    return {
      embeddings: (raw.data ?? []).map((d) => [...(d.embedding as readonly number[])]),
      raw,
      routedTo: res.headers.get('x-codai-routed-to'),
      fallback: res.headers.get('x-codai-embed-fallback'),
      headers: res.headers,
    };
  }
}
