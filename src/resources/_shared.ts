/** Type helpers over the generated OpenAPI types shared by every resource. */
import type { components, operations } from '../generated/gateway';

export type Schemas = components['schemas'];
export type Schema<K extends keyof Schemas> = Schemas[K];

/** JSON request body of an operation. */
export type Body<Op extends keyof operations> = operations[Op] extends {
  requestBody?: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** JSON response body of an operation for a given status (default 200). */
export type Reply<
  Op extends keyof operations,
  Status extends keyof operations[Op]['responses'] = 200 extends keyof operations[Op]['responses']
    ? 200
    : keyof operations[Op]['responses'],
> = operations[Op]['responses'][Status] extends {
  content: { 'application/json': infer R };
}
  ? R
  : never;

/** Query parameters of an operation. */
export type QueryOf<Op extends keyof operations> = operations[Op]['parameters'] extends {
  query?: infer Q;
}
  ? NonNullable<Q>
  : never;

/**
 * Strip the `readonly` modifiers that `--immutable` adds, so callers can
 * build request bodies with plain mutable objects.
 */
export type Mutable<T> =
  T extends ReadonlyArray<infer U>
    ? Array<Mutable<U>>
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}
