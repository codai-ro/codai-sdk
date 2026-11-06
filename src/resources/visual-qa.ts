/**
 * `/v1/vqa/*` — Visual QA (operator-only: every call needs a key whose owner is `super_admin`, 403 otherwise).
 *
 * References: a finding is `UI-<n>` (the bare number also works), a screen is `SCR-<surface>-<route-slug>`.
 * Workflow for an agent: `findings.list({ status: 'todo' })` → `claim('UI-142')` → fix → `resolve('UI-142',
 * { status: 'fixed', fixRef: '<sha>' })` → `recapture({ screens: ['SCR-hub-ops-agentq'], finding: 'UI-142' })`.
 * `verified` is never set by a call: a clean re-capture sets it asynchronously. Baseline approval is hub-only.
 *
 * The run/capture/recapture-claim methods are for the capture runner.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type QueryOf, type Reply, type Schema } from './_shared';

export type VqaFinding = Schema<'VqaFinding'>;
export type VqaCapture = Schema<'VqaCapture'>;
export type VqaRun = Schema<'VqaRun'>;
export type VqaRunInput = Schema<'VqaRunInput'>;
export type VqaRunFinish = Schema<'VqaRunFinish'>;
export type VqaCaptureInput = Schema<'VqaCaptureInput'>;
export type VqaFindingsParams = QueryOf<'vqaListFindings'>;
export type VqaCapturesParams = QueryOf<'vqaListCaptures'>;
export type VqaResolveBody = Body<'vqaResolveFinding'>;
export type VqaRecaptureBody = Body<'vqaRequestRecapture'>;
export type VqaFindingsResponse = Reply<'vqaListFindings'>;
export type VqaFindingDetail = Reply<'vqaGetFinding'>;
export type VqaFindingReply = Reply<'vqaClaimFinding'>;
export type VqaCommentReply = Reply<'vqaCommentFinding'>;
export type VqaRecaptureReply = Reply<'vqaRequestRecapture'>;
export type VqaRunsResponse = Reply<'vqaListRuns'>;
export type VqaRunDetail = Reply<'vqaGetRun'>;
export type VqaCapturesResponse = Reply<'vqaListCaptures'>;
export type VqaBaselinesResponse = Reply<'vqaListBaselines'>;
export type VqaRecordCapturesResponse = Reply<'vqaRecordCaptures'>;
export type VqaFinishRunResponse = Reply<'vqaFinishRun'>;
export type VqaClaimRecapturesResponse = Reply<'vqaClaimRecaptures'>;
export type VqaSummary = Reply<'vqaSummary'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };
type Q = Record<string, string | number | boolean | undefined | null>;

/** `UI-142` | `142` | 142 → `UI-142` (URL-encoded path segment). */
function ref(r: string | number): string {
  const s = String(r).trim();
  return encodeURIComponent(/^ui-/i.test(s) ? s.toUpperCase() : `UI-${s}`);
}

export class VisualQa {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, query: object | undefined, opts: CallOpts): Promise<T> {
    return this.http.json<T>(path, { query: query as Q, ext: opts.ext, signal: opts.signal });
  }

  private post<T>(path: string, body: unknown, opts: CallOpts): Promise<T> {
    return this.http.json<T>(path, { method: 'POST', body, ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/vqa/findings` — `status` / `severity` are comma-separated (`'todo,in-progress'`, `'P0,P1'`). */
  findings(params: VqaFindingsParams = {}, opts: CallOpts = {}): Promise<VqaFindingsResponse> {
    return this.get('/v1/vqa/findings', params, opts);
  }

  /** `GET /v1/vqa/findings/{ref}` — finding + comments + the capture that last reported it (hub blob URLs). */
  finding(findingRef: string | number, opts: CallOpts = {}): Promise<VqaFindingDetail> {
    return this.get(`/v1/vqa/findings/${ref(findingRef)}`, undefined, opts);
  }

  /** `POST /v1/vqa/findings/{ref}/claim` — moves it to `in-progress` as `agent` (default: the key id prefix). 409 when not claimable. */
  claim(
    findingRef: string | number,
    agent?: string,
    opts: CallOpts = {},
  ): Promise<VqaFindingReply> {
    return this.post(`/v1/vqa/findings/${ref(findingRef)}/claim`, agent ? { agent } : {}, opts);
  }

  /** `POST /v1/vqa/findings/{ref}/resolve` — `fixed` (with `fixRef`), `wontfix` or back to `todo`. 409 on a bad transition. */
  resolve(
    findingRef: string | number,
    body: VqaResolveBody,
    opts: CallOpts = {},
  ): Promise<VqaFindingReply> {
    return this.post(`/v1/vqa/findings/${ref(findingRef)}/resolve`, body, opts);
  }

  /** `POST /v1/vqa/findings/{ref}/comments`. */
  comment(
    findingRef: string | number,
    body: string,
    opts: CallOpts = {},
  ): Promise<VqaCommentReply> {
    return this.post(`/v1/vqa/findings/${ref(findingRef)}/comments`, { body }, opts);
  }

  /** `POST /v1/vqa/recaptures` — queue a re-capture (asynchronous; verification flips `fixed` → `verified`). */
  recapture(body: VqaRecaptureBody, opts: CallOpts = {}): Promise<VqaRecaptureReply> {
    return this.post('/v1/vqa/recaptures', body, opts);
  }

  /** `GET /v1/vqa/summary` — finding counts + latest run. */
  summary(opts: CallOpts = {}): Promise<VqaSummary> {
    return this.get('/v1/vqa/summary', undefined, opts);
  }

  /** `GET /v1/vqa/runs`. */
  runs(limit?: number, opts: CallOpts = {}): Promise<VqaRunsResponse> {
    return this.get('/v1/vqa/runs', { limit }, opts);
  }

  /** `GET /v1/vqa/runs/{id}` — run + finding counts. */
  run(id: string, opts: CallOpts = {}): Promise<VqaRunDetail> {
    return this.get(`/v1/vqa/runs/${encodeURIComponent(id)}`, undefined, opts);
  }

  /** `GET /v1/vqa/captures` — latest capture per screen/config/state, or every capture of `run`. */
  captures(params: VqaCapturesParams = {}, opts: CallOpts = {}): Promise<VqaCapturesResponse> {
    return this.get('/v1/vqa/captures', params, opts);
  }

  /** `GET /v1/vqa/baselines` — approved baselines (approval is hub-only). */
  baselines(screens?: string[], opts: CallOpts = {}): Promise<VqaBaselinesResponse> {
    return this.get('/v1/vqa/baselines', { screens: screens?.join(',') }, opts);
  }

  // ── Capture runner ──────────────────────────────────────────────────────

  /** `POST /v1/vqa/runs` — idempotent on `id`. */
  openRun(run: VqaRunInput, opts: CallOpts = {}): Promise<{ readonly ok: true }> {
    return this.post('/v1/vqa/runs', run, opts);
  }

  /** `POST /v1/vqa/runs/{id}/captures` — at most 50 captures per call. */
  recordCaptures(
    runId: string,
    captures: VqaCaptureInput[],
    opts: CallOpts = {},
  ): Promise<VqaRecordCapturesResponse> {
    return this.post(`/v1/vqa/runs/${encodeURIComponent(runId)}/captures`, { captures }, opts);
  }

  /** `POST /v1/vqa/runs/{id}/finish`. */
  finishRun(runId: string, fin: VqaRunFinish, opts: CallOpts = {}): Promise<VqaFinishRunResponse> {
    return this.post(`/v1/vqa/runs/${encodeURIComponent(runId)}/finish`, fin, opts);
  }

  /** `GET /v1/vqa/recaptures/claim` — atomically claim queued re-captures. */
  claimRecaptures(limit?: number, opts: CallOpts = {}): Promise<VqaClaimRecapturesResponse> {
    return this.get('/v1/vqa/recaptures/claim', { limit }, opts);
  }

  /** `POST /v1/vqa/recaptures/{id}/finish`. */
  finishRecapture(
    id: number,
    runId: string | null,
    ok: boolean,
    opts: CallOpts = {},
  ): Promise<{ readonly ok: true }> {
    return this.post(`/v1/vqa/recaptures/${id}/finish`, { runId, ok }, opts);
  }
}
