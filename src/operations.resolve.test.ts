/**
 * OpenAPI parity gate for the Resolve service: every `operationId` in
 * `apps/docs/openapi/en/resolve.yaml` maps to exactly one method on
 * `client.resolve`, and the table names no operation the spec lacks.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { Codai } from './index';
import { RESOLVE_OPERATION_METHODS } from './operations';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, '..', '..', '..', 'apps', 'docs', 'openapi', 'en', 'resolve.yaml');

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function readOperationIds(): string[] {
  const spec = parse(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  return Object.values(spec.paths).flatMap((item) =>
    Object.entries(item)
      .filter(([m, op]) => METHODS.has(m) && typeof op?.operationId === 'string')
      .map(([, op]) => op.operationId!),
  );
}

function lookup(root: object, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
      root,
    );
}

describe('OpenAPI parity (apps/docs/openapi/en/resolve.yaml ↔ client.resolve)', () => {
  const ids = readOperationIds();
  const client = new Codai({ apiKey: 'x' });

  it('the spec has unique operationIds', () => {
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every operationId is mapped and the map has no extra keys', () => {
    expect(ids.filter((id) => !(id in RESOLVE_OPERATION_METHODS))).toEqual([]);
    expect(Object.keys(RESOLVE_OPERATION_METHODS).filter((k) => !ids.includes(k))).toEqual([]);
  });

  it('every mapped method is a unique function on the client', () => {
    const broken = Object.entries(RESOLVE_OPERATION_METHODS)
      .filter(([, dotted]) => typeof lookup(client, dotted) !== 'function')
      .map(([id, dotted]) => `${id} → ${dotted}`);
    expect(broken).toEqual([]);
    const values = Object.values(RESOLVE_OPERATION_METHODS);
    expect(new Set(values).size).toBe(values.length);
  });
});
