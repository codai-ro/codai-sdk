# Changelog

All notable changes to `codai-sdk` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-09-24

### Added

- `WalletLedgerEntry.source` gains `compute_charge` — the debit written every 10 minutes for a
  running managed cloud environment (F2, `plan/feature-cloud-environments-2026-09.md`). Additive;
  callers that switch over `source` should treat unknown values as opaque.

## [0.3.0] - 2026-09-23

### Added

- **Full parity with the public gateway OpenAPI** (`apps/docs/openapi/en/gateway.yaml`, 62 operations).
  Every `operationId` has exactly one SDK method; the mapping lives in `OPERATION_METHODS`
  (`src/operations.ts`) and `operations.test.ts` fails when the spec and the client drift.
- **Resource groups** on the client: `chat.completions.{create,stream}`, `messages.{create,stream}`
  (Anthropic wire), `responses.{create,stream}` (OpenAI Responses wire), `embeddings.create`,
  `audio.{transcribe,transcribeDetailed,speech,speechDetailed}`, `tokens.create`, `models.list`,
  `health.{get,ready,status}`, `agents.run` + `agents.runs.{create,get,steps,stats,cancel,stream}`,
  `tools.{search,fetch}`, `tasks.{list,pending,stats,get,confirm}`,
  `sessions.{create,list,get,update,delete,dispatch,stream}` + `sessions.events.{list,append}` +
  `sessions.controls.{list,submit,markApplied}` + `sessions.lease.{acquire,renew,release}` +
  `sessions.shares.{list,create,delete,sharedWithMe}`, `devices.{list,update,delete,dispatchInbox}`,
  `hosts.{list,exec,postResult,stream}`, `orgs.{create,list}` + `orgs.members.{list,add,remove}`,
  `account.{get,update}`, `receipt.get`, `feedback.submit`, `phoneModels.list`.
- **Generated types** from the OpenAPI document (`openapi-typescript`, committed at
  `src/generated/gateway.ts`, regenerate with `pnpm gen`). `paths`, `components` and `operations`
  are exported; request/response types of every resource derive from them.
- **`X-Codai-*` extension headers** as a typed bag (`CodaiRequestExtensions`): pass `ext` per call or
  `defaults` on the client (`sessionId`, `device`, `client`, `effort`, `thinking`, `cache`, `taskId`,
  `incognito`, `mode: 'agent'`, `bestOf`, `compact`, `shareToken`, … — 41 headers).
- Codai-native SSE streams (`agents.runs.stream`, `sessions.stream`, `hosts.stream`) as async
  iterators of `{ event, data }` frames; Anthropic / Responses streams as async iterators of typed
  events with `.text()` and `.final`.
- `CodaiError` gained `code` (the stable gateway error code), `requestId` (`x-codai-trace-id`) and
  `retryAfter` (seconds, from 429s). `ChatResult` gained `eventId`, `toolCalls` and `headers`;
  `ChatStreamResult` gained `finishReason`, `headers` and `usage.cachedTokens`.
- `Codai` options: `device`, `deviceName`, `devicePlatform`, `client`, `defaults`, `fetch`.
- `scripts/smoke-local.ts` — live smoke against a running gateway (`pnpm smoke:local`, reads
  `CODAI_API_KEY` / `CODAI_BASE_URL`); not part of the test suite.

### Changed

- Internals split into `src/http.ts` (shared `HttpClient`: auth, retries, timeouts, SSE parsing,
  error mapping) and `src/resources/*.ts`; `src/index.ts` is the barrel. Streams are no longer
  capped by `timeoutMs` and are never retried.
- `audio.transcribe()` still returns the transcript string and `audio.speech()` still returns
  `ArrayBuffer`; the new `audio.transcribeDetailed()` / `audio.speechDetailed()` add the raw body,
  `contentType` and headers. `transcribe()` now also forwards `language`, `prompt`,
  `responseFormat` and `temperature`.

### Breaking

- None. `chat()`, `chatStream()`, `agents.run()`, `feedback(id, rating, comment?)`, `models()`,
  `embeddings({...})`, `audio.transcribe()`, `audio.speech()` and `mintToken()` keep their 0.2.x
  signatures (`chat`, `embeddings`, `models` and `feedback` are now callable resource groups that
  also expose `.completions` / `.create()` / `.list()` / `.submit()`).

## [0.2.3] - 2026-09-19

### Fixed

- Build under TypeScript 6: `ignoreDeprecations: "6.0"` in `tsconfig.build.json` so tsup's injected `baseUrl` no longer fails the DTS build (TS5101). No API changes.

## [0.2.2] - 2026-09-13

### Changed

- Repository moved to https://github.com/codai-ro/codai-sdk (package metadata URLs updated). No code changes.

## [0.2.1] - 2026-07-30

### Changed

- Dev-only: added `test:coverage` script (`vitest run --coverage`) and
  `@vitest/coverage-v8` devDependency; vitest aligned to 4.1.10. No runtime
  changes.

## [0.2.0] - 2026-06-23

### Added

- `chatStream()` now returns a `ChatStream` (still async-iterable for text
  deltas) with a `.final` promise resolving to `{ content, requestId, routedTo,
execVerify, usage, toolCalls }` — so you can call `feedback()` on a streamed
  response and read token usage.
- Streamed **tool calls** are assembled from deltas into `final.toolCalls`.
- Expanded test coverage: streaming metadata, tool-call assembly, stream error
  propagation, `embeddings()`, `audio.transcribe()`/`speech()`, `mintToken()`,
  `models()`.

### Changed

- **BREAKING:** `chatStream()` returns a `ChatStream` object instead of a bare
  `AsyncGenerator`. Existing `for await (const delta of codai.chatStream(...))`
  loops keep working unchanged; only direct generator-method use (e.g.
  `.next()`) is affected.

## [0.1.0] - 2026-06-23

### Added

- Initial public release.
- `chat()` — OpenAI-compatible completions with codai extensions
  (`sessionId`, `agentMode`, `compact`, `bestOf`).
- `chatStream()` — SSE streaming via async iterator.
- `agents.run()` — server-side agent loop.
- `feedback()` — thumbs rating on a completed request.
- `models()` — list models available to the key.
- `embeddings()`, `audio.transcribe()`, `audio.speech()`, `mintToken()`.
- Typed `CodaiError` with `status`, `message`, and `body`.

[Unreleased]: https://github.com/codai-ro/codai-sdk/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/codai-ro/codai-sdk/compare/v0.2.3...v0.3.0
[0.2.0]: https://github.com/codai-ro/codai-sdk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/codai-ro/codai-sdk/releases/tag/v0.1.0
