# codai-sdk

[![npm version](https://img.shields.io/npm/v/codai-sdk.svg)](https://www.npmjs.com/package/codai-sdk)
[![license](https://img.shields.io/npm/l/codai-sdk.svg)](./LICENSE)

Official TypeScript SDK for the [codai](https://codai.ro) AI gateway — a single
OpenAI-compatible endpoint with smart routing, sessions, server-side agents,
streaming, embeddings, audio, outcome-billed tasks, shared sessions, devices,
hosts, orgs and account — **full parity with the public gateway OpenAPI**.

- **Zero dependencies** — uses the platform `fetch`.
- Works in **Node 18+** and modern edge runtimes.
- **OpenAI-compatible** chat surface with codai extensions.
- Fully typed — request/response types are **generated from the OpenAPI spec**.
- Every `operationId` of the gateway has exactly one method (parity-tested).

```bash
npm install codai-sdk
# or
pnpm add codai-sdk
```

> You need a codai API key. Get one at **[codai.ro](https://codai.ro)**.

## Quickstart

```ts
import { Codai } from 'codai-sdk';

const codai = new Codai({ apiKey: process.env.CODAI_API_KEY! });

const res = await codai.chat({
  messages: [{ role: 'user', content: 'Explain async iterators in one line.' }],
});

console.log(res.content);
console.log(res.routedTo); // which upstream model actually served
```

## Resource groups

Everything hangs off the `Codai` client. The 0.2.x top-level methods (`chat()`,
`chatStream()`, `embeddings()`, `models()`, `feedback()`, `mintToken()`,
`agents.run()`, `audio.*`) still work; the resource groups below are the full
surface.

| Group              | Methods                                                                                                                                                                                              | Gateway paths                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `chat.completions` | `create`, `stream`                                                                                                                                                                                   | `POST /v1/chat/completions`                              |
| `messages`         | `create`, `stream`                                                                                                                                                                                   | `POST /v1/messages` (Anthropic wire)                     |
| `responses`        | `create`, `stream`                                                                                                                                                                                   | `POST /v1/responses` (OpenAI Responses wire)             |
| `embeddings`       | `create`                                                                                                                                                                                             | `POST /v1/embeddings`                                    |
| `audio`            | `transcribe`, `transcribeDetailed`, `speech`, `speechDetailed`                                                                                                                                       | `POST /v1/audio/transcriptions`, `POST /v1/audio/speech` |
| `tokens`           | `create`                                                                                                                                                                                             | `POST /v1/tokens`                                        |
| `models`           | `list`                                                                                                                                                                                               | `GET /v1/models`                                         |
| `health`           | `get`, `ready`, `status`                                                                                                                                                                             | `GET /health`, `GET /health/ready`, `GET /status`        |
| `agents`           | `run`; `runs.create`, `runs.get`, `runs.steps`, `runs.stats`, `runs.cancel`, `runs.stream`                                                                                                           | `/v1/agents/run`, `/v1/agents/runs/*`                    |
| `tools`            | `search`, `fetch`                                                                                                                                                                                    | `POST /v1/tools/search`, `POST /v1/tools/fetch`          |
| `tasks`            | `list`, `pending`, `stats`, `get`, `confirm`                                                                                                                                                         | `/v1/tasks/*`                                            |
| `sessions`         | `create`, `list`, `get`, `update`, `delete`, `dispatch`, `stream`; `events.list/append`; `controls.list/submit/markApplied`; `lease.acquire/renew/release`; `shares.list/create/delete/sharedWithMe` | `/v1/sessions/*`                                         |
| `devices`          | `list`, `update`, `delete`, `dispatchInbox`                                                                                                                                                          | `/v1/devices/*`                                          |
| `hosts`            | `list`, `exec`, `postResult`, `stream`                                                                                                                                                               | `/v1/hosts/*`                                            |
| `orgs`             | `create`, `list`; `members.list/add/remove`                                                                                                                                                          | `/v1/orgs/*`                                             |
| `account`          | `get`, `update`                                                                                                                                                                                      | `GET/PATCH /v1/account`                                  |
| `receipt`          | `get`                                                                                                                                                                                                | `GET /v1/receipt`                                        |
| `feedback`         | `submit`                                                                                                                                                                                             | `POST /v1/feedback`                                      |
| `phoneModels`      | `list`                                                                                                                                                                                               | `GET /v1/phone/models`                                   |

Every method takes an optional last argument `{ ext, signal }` where `ext` is a
typed bag of `X-Codai-*` extension headers (see below).

## Streaming

```ts
for await (const delta of codai.chatStream({
  messages: [{ role: 'user', content: 'Write a haiku about TypeScript.' }],
})) {
  process.stdout.write(delta);
}
```

After the stream ends, await `.final` for metadata (request id, token usage,
which model served, and any tool calls) — e.g. to submit feedback on a
streamed response:

```ts
const stream = codai.chatStream({
  messages: [{ role: 'user', content: 'Write a haiku about TypeScript.' }],
});

for await (const delta of stream) {
  process.stdout.write(delta);
}

const { requestId, usage, routedTo, toolCalls } = await stream.final;
if (requestId) await codai.feedback(requestId, 1);
```

`chat.completions.stream()` is the same stream; `stream.chunks()` yields the raw
`chat.completion.chunk` objects.

## Anthropic Messages and OpenAI Responses wires

```ts
// Anthropic Messages shape — text blocks, tool_use, streaming events
const msg = await codai.messages.create({
  messages: [{ role: 'user', content: 'Salut!' }],
  max_tokens: 256,
});
msg.text; // concatenated text blocks

for await (const ev of codai.messages.stream({ messages, max_tokens: 256 })) {
  if (ev.type === 'content_block_delta') {
    /* ev.delta */
  }
}

// OpenAI Responses shape
const r = await codai.responses.create({ input: 'Say hi.' });
r.outputText;
```

## Server-side agent

Run a plan-and-execute loop on the gateway — the heavy lifting (planning, tool
use, iteration) happens server-side; your client stays thin.

```ts
const run = await codai.agents.run({
  task: 'Summarize the key points of the provided text.',
  context: '…your input…',
});

console.log(run.result);
```

Async runs are persisted and can be polled, streamed and cancelled:

```ts
const { id } = await codai.agents.runs.create({ task: '…', client_request_id: 'ci-8812' });
for await (const ev of codai.agents.runs.stream(id)) {
  if (ev.event === 'step') console.log(ev.data.kind, ev.data.summary);
  if (ev.event === 'done') console.log(ev.data.status, ev.data.result);
}
const run = await codai.agents.runs.get(id);
```

## Tools, tasks and receipts

```ts
const hits = await codai.tools.search({ query: 'BNR EUR RON' });
const page = await codai.tools.fetch({ url: 'https://bnr.ro', format: 'markdown' });

const { tasks, next_cursor } = await codai.tasks.list({ outcome: 'unconfirmed', limit: 20 });
await codai.tasks.confirm(tasks[0].id, { outcome: 'confirmed' });

const receipt = await codai.receipt.get({ sessionId: 'my-project' });
receipt.cost_usd;
```

## Shared sessions, devices and hosts

Shared-sessions and hosts calls need a device UUID (`x-codai-device`). Set it once
on the client:

```ts
const codai = new Codai({
  apiKey,
  device: '6f1c2b3a-4d5e-4f60-8a9b-0c1d2e3f4a5b',
  deviceName: 'ci-runner',
  devicePlatform: 'cli',
});

const session = await codai.sessions.create({ session_key: 'desktop-main', title: 'Refactor' });
await codai.sessions.lease.acquire(session.id);
await codai.sessions.events.append(session.id, {
  events: [{ kind: 'user', payload: { text: 'hello' }, client_event_id: 'e1' }],
});

for await (const frame of codai.sessions.stream(session.id, { after: 0 })) {
  // frame.event ∈ 'event' | 'control' | 'lease' | 'presence'
}

await codai.sessions.dispatch(session.id, { device_id: phoneId, text: 'continue on the phone' });

// Host relay: run one op on a connected desktop
const hosts = await codai.hosts.list();
const out = await codai.hosts.exec(hosts[0].device_id, 'shell', { cmd: 'git status' });
```

## Orgs and account

```ts
const org = await codai.orgs.create('Acme Robotics');
await codai.orgs.members.add(org.id, { email: 'ana@example.com', role: 'admin' });
await codai.sessions.shares.create(session.id, {
  principal_type: 'org',
  principal_id: org.id,
  role: 'editor',
});

const me = await codai.account.get();
await codai.account.update({ training_opt_out: true });
```

## Feedback

```ts
const res = await codai.chat({ messages: [{ role: 'user', content: 'hi' }] });
if (res.requestId) {
  await codai.feedback(res.requestId, 1); // 1 = 👍, -1 = 👎
}
```

## Embeddings

```ts
const { embeddings } = await codai.embeddings({ input: ['hello', 'world'] });
```

## Audio

```ts
// Speech-to-text
const text = await codai.audio.transcribe({ file: audioBytes, filename: 'clip.webm' });

// Text-to-speech
const wav = await codai.audio.speech({ input: 'Hello from codai.' });
```

## List models

```ts
const models = await codai.models();
```

## Configuration

```ts
const codai = new Codai({
  apiKey: process.env.CODAI_API_KEY!,
  baseUrl: 'https://ai.codai.ro', // default
  sessionId: 'my-project', // enables session memory + stickiness
  device: '<uuid>', // shared sessions / hosts (x-codai-device)
  client: 'my-app/1.2.0', // x-codai-client surface tag
  defaults: { effort: 'medium' }, // any other X-Codai-* defaults
  timeoutMs: 120_000,
  maxRetries: 2,
});
```

## codai extensions

The chat surface is OpenAI-compatible, with opt-in extensions. On `chat()` the
0.2.x option names still work:

| Option            | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `sessionId`       | Stable conversation id — enables session memory and routing stickiness. |
| `agentMode`       | Plan-and-execute agent mode (Pro+).                                     |
| `compact: "auto"` | Server-side context compaction.                                         |
| `bestOf`          | Best-of-N sampling override (`0` disables, `3` forces).                 |

Every method also accepts `{ ext }` — a typed `CodaiRequestExtensions` bag that
covers all 41 documented `X-Codai-*` request headers (`effort`, `thinking`,
`thinkingBudget`, `cache`, `noTask`, `taskId`, `incognito`, `noRecall`,
`provenOnly`, `repo`, `agentId`, `disableSubagents`, `mode`, `serverTools`,
`orchestrate`, `cascade`, `bestOf`, `reflect`, `stepVerify`, `plan`, `consensus`,
`compact`, `retrieval`, `heuristics`, `identity`, `playbook`, `debug`, `device`,
`shareToken`, …):

```ts
await codai.chat.completions.create(
  { messages, model: 'codai' },
  { ext: { effort: 'high', thinking: true, thinkingBudget: 8192, taskId: 'task_42' } },
);
```

## Generated types

`paths`, `components` and `operations` from the gateway OpenAPI are exported, and
every resource re-exports friendly aliases (`ChatCompletionRequest`, `Task`,
`Session`, `AccountView`, …):

```ts
import type { components, Task, SessionStreamEvent } from 'codai-sdk';
type Receipt = components['schemas']['AccountReceipt'];
```

Regenerate after a spec change with `pnpm gen`; `operations.test.ts` fails when
the spec and the client drift.

## Migrating from the OpenAI SDK

The chat payload is OpenAI-shaped, so migration is mostly swapping the client:

```ts
// before: openai.chat.completions.create({ model, messages })
// after:
const res = await codai.chat({ messages });
```

## Error handling

```ts
import { Codai, CodaiError } from 'codai-sdk';

try {
  await codai.chat({ messages: [{ role: 'user', content: 'hi' }] });
} catch (err) {
  if (err instanceof CodaiError) {
    console.error(err.status, err.code, err.requestId, err.retryAfter, err.body);
  }
}
```

`code` is the stable gateway error code (`invalid_api_key`, `rate_limit_exceeded`,
`quota_exceeded`, `lease_held`, `host_offline`, …); `retryAfter` is the
`Retry-After` value in seconds on 429s.

## Migrating from 0.2.x

Nothing breaks: every 0.2.x method keeps its signature. What changed underneath:

- `chat`, `embeddings`, `models` and `feedback` are now **callable resource
  groups** — `codai.chat({...})` still works and `codai.chat.completions.create({...})`
  is the same call with the raw OpenAI body.
- `ChatResult` gained `eventId`, `toolCalls`, `headers`; `ChatStreamResult` gained
  `finishReason`, `headers`, `usage.cachedTokens`.
- `CodaiError` gained `code`, `requestId`, `retryAfter`.
- Streams are no longer subject to `timeoutMs` and are never retried.
- New client options: `device`, `deviceName`, `devicePlatform`, `client`, `defaults`, `fetch`.

## License

[MIT](./LICENSE) © codai
