/** `/v1/tasks/*` — outcome-billing task lifecycle. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

export type Task = Schema<'Task'>;
export type TaskOutcome = Schema<'TaskOutcome'>;
export type TaskStats = Reply<'getTaskStats'>;
export type TaskListPage = Reply<'listTasks'>;
export type TaskConfirmRequest = Mutable<Body<'confirmTask'>>;
export type TaskConfirmResponse = Reply<'confirmTask'>;
export type TaskListQuery = Mutable<QueryOf<'listTasks'>>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Tasks {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/tasks` — newest first; page with `cursor` = previous `next_cursor`. */
  list(query: TaskListQuery = {}, opts: CallOpts = {}): Promise<TaskListPage> {
    return this.http.json<TaskListPage>('/v1/tasks', {
      query: { outcome: query.outcome, limit: query.limit, cursor: query.cursor },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/tasks/pending` — tasks awaiting your confirmation (max 100). */
  async pending(opts: CallOpts = {}): Promise<Task[]> {
    const raw = await this.http.json<Reply<'listPendingTasks'>>('/v1/tasks/pending', {
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...(raw.tasks ?? [])];
  }

  /** `GET /v1/tasks/stats?since=` */
  stats(since?: string | Date, opts: CallOpts = {}): Promise<TaskStats> {
    return this.http.json<TaskStats>('/v1/tasks/stats', {
      query: { since: since instanceof Date ? since.toISOString() : since },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/tasks/{id}` */
  get(id: string, opts: CallOpts = {}): Promise<Task> {
    return this.http.json<Task>(`/v1/tasks/${encodeURIComponent(id)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `POST /v1/tasks/{id}/confirm` — answer "Did codai solve it?". */
  confirm(id: string, body: TaskConfirmRequest, opts: CallOpts = {}): Promise<TaskConfirmResponse> {
    return this.http.json<TaskConfirmResponse>(`/v1/tasks/${encodeURIComponent(id)}/confirm`, {
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
