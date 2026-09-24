/**
 * LIVE smoke test against a running gateway — NOT part of the vitest suite.
 *
 *   $env:CODAI_API_KEY = '<key>'; $env:CODAI_BASE_URL = 'http://127.0.0.1:8787'
 *   pnpm --filter codai-sdk smoke:local
 *
 * Exercises models.list, chat (non-stream + stream), account.get, receipt.get,
 * tasks.list, devices.list, hosts.list and prints one status line per call.
 * Never prints the key. Exit code 1 when any call fails.
 */
import { Codai, CodaiError } from '../src/index';

const apiKey = process.env.CODAI_API_KEY;
const baseUrl = process.env.CODAI_BASE_URL ?? 'http://127.0.0.1:8787';
const model = process.env.CODAI_SMOKE_MODEL ?? 'gemini-2.5-flash';
if (!apiKey) {
  console.error('CODAI_API_KEY is required');
  process.exit(2);
}

const client = new Codai({
  apiKey,
  baseUrl,
  maxRetries: 0,
  timeoutMs: 60_000,
  sessionId: `sdk-smoke-${Date.now()}`,
  // Fixed v4-shaped UUID so repeated smokes reuse one device row.
  device: process.env.CODAI_SMOKE_DEVICE ?? '5dc0de00-0000-4000-8000-00000000c0da',
  devicePlatform: 'cli',
  client: 'codai-sdk-smoke/0.3.0',
});

let failures = 0;
async function step<T>(
  name: string,
  fn: () => Promise<T>,
  summary: (v: T) => string,
): Promise<void> {
  const t0 = Date.now();
  try {
    const v = await fn();
    console.info(
      `OK   ${name.padEnd(22)} ${String(Date.now() - t0).padStart(5)} ms  ${summary(v)}`,
    );
  } catch (err) {
    failures++;
    if (err instanceof CodaiError) {
      console.info(
        `FAIL ${name.padEnd(22)} ${String(Date.now() - t0).padStart(5)} ms  HTTP ${err.status} code=${err.code ?? '-'} ${err.message}`,
      );
    } else {
      console.info(
        `FAIL ${name.padEnd(22)} ${String(Date.now() - t0).padStart(5)} ms  ${String(err)}`,
      );
    }
  }
}

console.info(`codai-sdk live smoke → ${baseUrl} (model ${model}, key length ${apiKey.length})`);

await step(
  'models.list',
  () => client.models.list(),
  (m) => `${m.length} models; has ${model}: ${m.some((x) => x.id === model)}`,
);

await step(
  'chat (non-stream)',
  () =>
    client.chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: 'Reply with exactly the word PONG.' }],
        max_tokens: 64,
      },
      { ext: { effort: 'minimal' } },
    ),
  (r) =>
    `status 200 routed=${r.routedTo} content=${JSON.stringify(r.content.trim())} tokens=${r.usage?.promptTokens}/${r.usage?.completionTokens} eventId=${r.eventId ? 'yes' : 'no'}`,
);

await step(
  'chat (stream)',
  async () => {
    const s = client.chat.completions.stream(
      {
        model,
        messages: [{ role: 'user', content: 'Count from 1 to 5, digits separated by spaces.' }],
        max_tokens: 64,
      },
      { ext: { effort: 'minimal' } },
    );
    let deltas = 0;
    for await (const _d of s) deltas++;
    const final = await s.final;
    return { deltas, final };
  },
  ({ deltas, final }) =>
    `status 200 deltas=${deltas} routed=${final.routedTo} content=${JSON.stringify(final.content.trim())} usage=${final.usage ? `${final.usage.promptTokens}/${final.usage.completionTokens}` : 'none'} finish=${final.finishReason} costEstimate=${final.headers?.get('x-codai-cost-estimate') ?? '-'}`,
);

await step(
  'account.get',
  () => client.account.get(),
  (a) =>
    `status 200 keys=${Object.keys(a).length} plan=${JSON.stringify((a as { plan?: unknown }).plan ?? null).slice(0, 60)}`,
);

await step(
  'receipt.get',
  () => client.receipt.get(),
  (r) => `status 200 keys=${Object.keys(r).length} ${JSON.stringify(r).slice(0, 120)}`,
);

await step(
  'tasks.list',
  () => client.tasks.list({ limit: 5 }),
  (p) => `status 200 tasks=${p.tasks.length} next_cursor=${p.next_cursor}`,
);

await step(
  'devices.list',
  () => client.devices.list(),
  (d) => `status 200 devices=${d.length}`,
);

await step(
  'hosts.list',
  () => client.hosts.list(),
  (h) => `status 200 hosts=${h.length}`,
);

console.info(failures === 0 ? 'SMOKE OK' : `SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
