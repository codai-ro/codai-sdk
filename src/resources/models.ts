/** `GET /v1/models`. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply, type Schema } from './_shared';

export type Model = Schema<'CoreModel'>;
export type ModelList = Reply<'listModels'>;

export class Models {
  constructor(private readonly http: HttpClient) {}

  /** Every model the calling key may address (OpenAI list shape, `data[]`). */
  async list(opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {}): Promise<Model[]> {
    const raw = await this.http.json<ModelList>('/v1/models', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.data ?? [])];
  }
}
