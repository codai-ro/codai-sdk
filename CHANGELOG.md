# Changelog

All notable changes to `codai-sdk` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.29.0] - 2026-10-11

- `CodaiApps` — management client for host apps on the mgmt API (`api.codai.ro`) with an app connection token:
  `keys.mint/list/update/revoke/usage/revokeAllFor`, `users.getOverride/setOverride/clearOverride`,
  `subscriptions.sync` and `validateKey` (`/internal/keys/validate`, separate shared secret). Unwraps `{ ok, data }`,
  throws `CodaiError` with the mgmt error code; 20 s timeout, one retry on 429/5xx, mint never retried.

## [0.28.0] - 2026-10-11

- `client.cards` — typed card data from `/v1/cards/*`. Every JSON method returns `{ block, provenance }` where
  `block` is already a valid `@codai/cards` block: `cards.weather({ lat, lng, name? })` (MET Norway, free),
  `cards.places({ q? | lat+lng, radius?, type?, limit?, lang?, region?, open_now? })` (Google Places, billed $0.032 per
  call, 200/day), `cards.geocode({ address })` (map block + raw `results`, billed $0.005), `cards.fx({ source?, from?,
to?, amount?, quote?, symbols? })` (BNR / ECB, free), `cards.unfurl(url)` (links preview block, 500/day) and
  `cards.staticMap({ center? | markers?, zoom?, w?, h?, maptype?, path? })` which returns `{ bytes, contentType,
attribution }` for the PNG (billed $0.002, counted in the 500/day maps limit).
- Generated types: `CardDataResponse`; operations `cardsWeather`, `cardsPlaces`, `cardsGeocode`, `cardsStaticMap`,
  `cardsFx`, `cardsUnfurl`.

## [0.27.0] - 2026-10-11

- `schedules.pause/resume` (vacation mode with optional backfill), `schedules.templates/renderTemplate`, and
  `client.heartbeats` (`list/create/update/delete`) for dead-man-switch monitors of crons codai does not run.

## [0.26.0] - 2026-10-11

- `client.schedules` — the codai Scheduler: `list`, `create`, `preview` (cron or plain words in English or Romanian →
  next runs + DST warning), `get`, `update`, `delete`, `runNow`, `runs`, `recentRuns`, `decide` (approve / skip a run
  waiting for you) and `stream()`; `schedules.hosts.list/update` (devices as hosts: os, kind, tags); and the host executor
  protocol `schedules.executor.claim/heartbeat/result/approveCommand`.
- `transcripts.publishLive` mapped to `publishTranscriptLive` in the operation table.

## [0.25.0] - 2026-10-10

- `client.settings` — account-level settings shared by every device of the account (per user, not per key):
  `settings.get()` for `GET /v1/settings` (full object with defaults, `version` 0 / `updatedAt` null until the first
  write) and `settings.update(partial, { version })` for `PATCH /v1/settings` (deep merge, strict validation; with
  `version` the write is conditional and a stale one throws a 409 `CodaiError` with code `version_conflict`).
  `settingsConflictCurrent(err)` returns the current state carried by that 409.
- Generated types: `SettingsResponse`, `UserSettings`, `TranscriptsSettings`, `SettingsPatchRequest`,
  `SettingsConflict`; error codes `version_conflict`, `settings_unavailable`; operations `getSettings`, `patchSettings`.

## [0.24.0] - 2026-10-10

### Added

- `client.documents` — codai Studio documents (`codai-docs`): `documents.create({ type, spec, theme?, based_on?,
preview? })` builds a deck (PPTX), doc (DOCX) or sheet (XLSX) from a JSON spec (free; `file` is an `AssetDto` with
  `kind: 'document'`), `documents.retrieve(id)` returns it with the stored `spec`, `documents.preview(id)` queues a
  `codai-docs-preview` preview (tagged PDF + page PNGs + contact sheet, HTTP 202), `documents.retrievePreview(previewId)`
  polls it and `documents.video(id, body)` turns a deck into an MP4 queued as a `codai-render` render (optional
  narration from speaker notes). Pollers `documents.createPreviewAndWait(id, opts)` and
  `documents.videoAndWait(id, body, opts)` (polls `renders.retrieve`) throw on `failed` / timeout.
- Generated types: `DocumentCreateRequest`, `Document`, `DocumentPreviewAccepted`, `DocumentPreview`,
  `DocumentVideoRequest`, `DocumentVideoAccepted`, `DeckSpec`, `DocSpec`, `SheetSpec` and their parts; `AssetKind`
  gains `document` and `preview`; operations `createDocument`, `retrieveDocument`, `createDocumentPreview`,
  `retrievePreview`, `createDocumentVideo`.

## [0.23.0] - 2026-10-10

### Added

- `client.sfx` — the codai Studio sound-effects library (`codai-sfx`, curated CC0 sounds + a Freesound CC0-only
  fallback): `sfx.search({ q, category, tags, max_duration, limit })` for `GET /v1/studio/sfx` (`tags` accepts an
  array; the result adds `fallbackUnavailable` from `x-codai-sfx-fallback: unavailable`) and `sfx.import(sfxId)` for
  `POST /v1/studio/sfx/{sfx_id}/import`, which returns an `AssetDto` with `kind: 'sfx'` usable as `asset:<asset_id>`
  in renders. Both are free.
- Generated types: `SfxDto`, `SfxCategory`, `SfxList`; `AssetKind` gains `sfx`; operations `searchSfx`, `importSfx`.

## [0.22.0] - 2026-10-10

### Added

- `audio.speechJson()` for `POST /v1/audio/speech` with `timestamps` and/or `store`: returns per-word timings
  (`words`), the decoded audio or the stored studio asset (`asset`, kind `speech`, usable as `asset:<id>` in renders),
  `durationSeconds`, `costMicroUsd` and `timestampsUnavailable` (`x-codai-timestamps: unavailable`). Defaults to
  `codai-speech` and `timestamps: true`.
- New speech models in the generated types: `codai-speech` (Chirp 3 HD, 30 native Romanian voices) and
  `codai-speech-expressive` (Gemini 2.5 Flash TTS, honours `instructions`); new request fields `language`,
  `timestamps`, `store`; new schemas `SpeechJson`, `SpeechWord`, `MusicTrackMeta`.
- `music.generate()` accepts `lyrics`, `instrumental`, `bpm`, `duration_seconds`, `language` and the models
  `codai-music` (now Lyria 3 Clip, 30 s with vocals), `codai-music-pro` (Lyria 3 Pro, up to 184 s) and
  `codai-music-legacy` (Lyria 2); the result adds `tracks` (lyrics, caption, lyrics_match, warnings) and `warnings`.

### Changed

- `audio.speech()` / `speechDetailed()` no longer send the Azure default `voice: alloy` for `codai-speech*` models.
- `music.generate()` client timeout floor raised from 180 s to 300 s (Lyria 3 Pro songs).
- `MusicClip.sample_rate` is optional (Lyria 3 returns MP3 without it).

## [0.21.1] - 2026-10-10

### Changed

- Generated types: render pricing note now states that up to 50 ms of encoder padding is never billed.

## [0.21.0] - 2026-10-10

### Added

- `renders` resource for codai Studio renders (`codai-render`, HyperFrames HTML composition → MP4, up to 180 s at
  1080p): `create({ html, aspect_ratio?, quality?, fps?, variables?, title? })` (`POST /v1/studio/renders`, HTTP 202),
  `retrieve(id)` (`GET /v1/studio/renders/{id}`, status + `progress` + `qa`) and `render(body, { pollIntervalMs,
timeoutMs, signal })`, which polls until `succeeded` (returns the MP4 `asset`, `posterUrl`, `qa`, `costMicroUsd`)
  and throws on `failed` or timeout. Types `RenderRequest`, `RenderJob`, `RenderJobStatus`, `RenderQa`,
  `RenderResult`, `RenderAspectRatio`, `RenderQuality`, `RenderStatus`.
- Regenerated `src/generated/gateway.ts`: the `createRender` / `getRender` operations, the `StudioRender*` schemas and
  the `asset_not_found`, `too_many_renders` and `renders_unavailable` error codes.

## [0.20.0] - 2026-10-10

### Added

- `assets` resource for codai Studio assets (`/v1/assets`, owner-scoped, kept 90 days): `list({ kind, before,
limit })`, `iterate()` (follows `next_before`), `retrieve(id)`, `contentUrl(id)` (fresh 1 h signed URL),
  `contentPath(id)` (authenticated `GET /v1/assets/{id}/content` redirect), `content(id)` (bytes) and `delete(id)`.
  Types `AssetDto`, `AssetKind`, `AssetList`, `AssetDeleted`, `MediaResponseFormat` and the `isAssetDto()` guard.
- `response_format: 'url'` on `images.generate` / `images.edit` and `music.generate`, and `responseFormat: 'url'` on
  `videos.retrieve` / `videos.generate`: results are stored as assets and returned as `assets` / `asset` with signed
  URLs instead of decoded bytes. The default `b64_json` behaviour is unchanged; `ImagesResult.assets`,
  `MusicResult.assets` and `VideoResult.asset` are empty / `null` then.
- Regenerated `src/generated/gateway.ts`: `AssetDto` and friends, the `listAssets` / `getAsset` / `getAssetContent` /
  `deleteAsset` operations, the `response_format` enums and the `assets_unavailable` error code.

## [0.19.0] - 2026-10-09

### Added

- codai Studio media (US-only, English prompts): `music.generate({ prompt, n? })` (`POST /v1/audio/music`, Lyria 2,
  30 s WAV clips decoded to `clips: Uint8Array[]`, client timeout floor 180 s) and `videos.create` / `.retrieve(id)` /
  `.generate({ prompt }, { pollIntervalMs, timeoutMs, signal })` (`POST /v1/videos` + `GET /v1/videos/{id}`, Veo 3.1
  Fast; `generate` polls until `succeeded` and throws on `failed`, `filtered` or timeout).

## [0.18.0] - 2026-10-08

### Added

- `tools.ground()` — `POST /v1/tools/ground`: locate a UI element described in words on an inline screenshot
  (codai's self-hosted GUI grounding model). Returns normalised `x_norm`/`y_norm`, optional pixel `x`/`y`, `conf`.

## [0.17.1] - 2026-10-07

### Added

- Web search result `source` gains `ocw` (MIT OpenCourseWare course records for education queries that name MIT / OCW).

## [0.17.0] - 2026-10-06

### Added

- `transcripts.export(id, 'pdf' | 'docx')` returns `{ bytes, filename, contentType }` (PDF with an embedded Unicode
  font, DOCX); text formats keep returning `{ text, … }`. `TranscriptExportFormat` gains `pdf` and `docx`.
- `transcripts.shares.create(id, { expiresInDays? })` / `.list(id)` / `.revoke(id, shareId)` — read-only share links
  (`https://hub.codai.ro/t/<token>`; the token is returned once).
- `transcripts.publicView(token)` — the read-only view behind a share link (`GET /v1/public/transcripts/{token}`).

## [0.16.4] - 2026-10-06

### Added

- `TranscriptDetail.processing` - the pending background job (`kind`, `attempts`, `max_attempts`, `last_error`,
  `next_attempt_at`) or `null`, so a retrying transcription is visible instead of looking stuck.

## [0.16.3] - 2026-10-05

### Changed

- Build toolchain moved from tsup to tsdown. The published files (`dist/index.{js,cjs,d.ts,d.cts}` + maps), the
  runtime exports and the public type names are unchanged.

## [0.16.2] - 2026-10-05

### Added

- `POST /v1/tools/search` types: request `depth: "fast" | "deep"` (deep = more sources, ~12 s budget); `mode`
  also accepts `fast` / `deep` as an alias (means `codai` with that depth).

## [0.16.1] - 2026-10-05

### Added

- `POST /v1/tools/search` types: request `fallback: "auto" | "off"` (automatic Grounding with Google Search when
  codai results are weak, returned as a separate `google` block + `fallback: { used, reason }`), new intents
  `academic` / `definition` / `education`, and new result sources (`mdn`, `mslearn`, `hn`, `osv`, `endoflife`,
  `openalex`, `crossref`, `arxiv`, `europepmc`, `doaj`, `core`, `wiktionary`, `openstax`, `dexonline`).

## [0.16.0] - 2026-10-05

### Added

- `client.usage.get(query)` — `GET /v1/usage`: your own requests, errors, tasks, tokens and cost grouped by
  `day` | `key` | `device` | `app` | `platform` | `model` | `client` | `tag`, filtered by `key`, `device`, `app`,
  `platform`, `model`, `tag`; `from` / `to` are inclusive `YYYY-MM-DD` (default last 30 days, max 400).
  `cost_micro_usd` is USD micros as a string. Types `UsageReport`, `UsageRow`, `UsageQuery`, `UsageGroupBy`.
- `client.keys.list({ include_revoked })` — `GET /v1/keys`: your API keys with `kind`, `device_id`, `platform`,
  `client_version`, `tags` and `current`. Type `ApiKeyInfo`.
- `client.keys.setTags(id, tags)` — `PATCH /v1/keys/{id}`: replace a key's tags (≤ 16, each ≤ 32 chars).

## [0.15.0] - 2026-10-05

### Added

- `client.transcripts` — Transcripts API: create, list (folder / tag / pinned / status / q filters), get, update,
  delete, finalize, retry, segments, speaker rename, insights + regenerate, hybrid search, ask, export
  (md / srt / vtt / txt / json), accept an agent prompt, folders and custom-vocabulary CRUD, SSE status events.
- `client.transcripts.uploadAudio(id, blob, { chunkSize, onProgress, signal })` — resumable tus 1.0 upload to
  `/v1/uploads` (HEAD resume, PATCH chunks).
- HTTP layer: `HEAD` / `OPTIONS` methods and a per-request `headers` option.

## [0.14.1] - 2026-10-05

### Added

- `POST /v1/tools/search` types: request `mode: "codai" | "google"` (default `codai`) and the
  `ToolSearchGoogleResponse` shape (Grounding with Google Search: `answer`, `sources`, `queries`,
  `search_suggestions_html`, `attribution`), plus the `releases` / `registry` / `engine` result sources.

## [0.14.0] - 2026-10-05

### Added

- Pending prompts track delivery: statuses `sent`, `answered`, `verified` and fields `sent_at`, `answered_at`,
  `verified_at`, `match_ref`, `match_turn_id`, `match_score`, `base_sha`, `head_sha`, `report`, `report_at`.
- `client.prompts.match(id, body)` — `POST /v1/prompts/:id/match`: record that a prompt was sent into a session.
- `client.prompts.verify(id, body)` — `POST /v1/prompts/:id/verify`: report (done / partial / not started, what
  changed, what remains) from the session transcript and an optional client-side git diff.
- `client.prompts.verifyMany(body)` — `POST /v1/prompts/verify`: transcript-only verify of many / all active prompts.
- `PromptStreamEvent` type for `GET /v1/prompts/stream` (SSE, `event: prompt`).

## [0.13.0] - 2026-10-05

### Added

- `client.realtime.connect({ model, language, token | apiKey, sessionId, WebSocket? })` — dependency-free
  `wss://…/v1/realtime` client. Returns a `RealtimeSession`: async-iterable of typed events
  (`conversation.item.input_audio_transcription.delta|completed`, `session.*`, `error`, final `close`), `on(type, fn)`,
  `appendAudio(Int16Array | ArrayBuffer | Uint8Array)` (PCM16 → base64 `input_audio_buffer.append`), `commit()`,
  `clear()`, `send()`, `close()`, `ready`. Browser path sends an ephemeral token as `?key=`; a raw key goes in the
  `Authorization` header (needs a WebSocket constructor with headers, e.g. `ws`). For `codai-transcribe-live` it sends
  the transcription `session.update` (PCM 24 kHz + `language`) on open. Uses the global `WebSocket` unless one is
  injected. Not part of `OPERATION_METHODS` (WebSockets are outside OpenAPI).
- `client.audio.speechStream({ input, voice?, response_format?, speed? })` → `POST /v1/audio/speech/stream`
  (`codai-tts-ro`, Azure neural TTS): async generator of `start` / `audio` (base64 `delta` + decoded `audio` bytes) /
  `viseme` `{id, offsetMs}` / `word` `{text, offsetMs, durationMs}` / `done` / `error`. `createSpeechStream` in the
  parity table (streaming operation).
- `client.systemOne.batch({ items: [{ id, state }], questions, timeout_ms?, fallback? })` and typed overloads of
  `systemOne.create` (`SystemOneSingleRequest` → `answers`, `SystemOneBatchRequest` → `items`). New request fields
  `timeout_ms` (100-5000) and `fallback: 'codai-fast'`; response `fallback_used`.
- `EphemeralScope` gains `'live'` (realtime + audio in one token).

## [0.12.0] - 2026-10-02

### Added

- `client.devices.revokeSelfKey()` — `POST /v1/keys/self/revoke`: the calling API key revokes itself (sign out).

## [0.11.0] - 2026-09-29

### Added

- `client.prompts.{list, create, get, update, delete, launch}` — pending prompts (`/v1/prompts/*`):
  ready-to-paste prompts left for a future chat, with `goal_key` supersede, `not_before` reminders
  (`prompt.due` notifications) and `launch` into a new session on a device. `launch` is never retried.
  Types `Prompt`, `PromptCreateRequest`, `PromptPatch`, `PromptCreated`, `PromptLaunched`, ….

## [0.10.0] - 2026-09-29

### Added

- `sessions.dispatch()` handoff mode: `SessionDispatchRequest` is now a union —
  `{ device_id, mode?: 'send', text, turn_id?, control_id? }` (unchanged default) or
  `{ device_id, mode: 'open', control_id? }`, which only opens the session on the target (no text,
  no user turn). New `SessionDispatchMode` type; `SessionDispatchResponse.mode` echoes the effective
  mode. Existing `{ device_id, text }` calls compile and behave as before.
- `SessionControl.mode?: 'open'` on open-handoff controls (`sessions.controls.list`,
  `devices.dispatchInbox`).
- `Device.online` (`devices.list()`): `true` when the device was seen in the last 2 minutes.
- `client.images.edit({ prompt, image, model?, n?, aspect_ratio?, image_size? })` →
  `POST /v1/images/edits` (JSON body, 1–14 input images; `mask` unsupported). `editImage` in the
  parity table; `ImageEditRequest` type.
- `ImagesResult.mimeTypes` and `ImagesResult.dataRegion` (`x-codai-data-region`, `eu` | `global`).
- `generate()` types gain `reference_images`, `aspect_ratio`, `image_size` and the
  `codai-image-fast` / `codai-image-pro` model ids.

### Changed

- `codai-image` is now `gemini-3.1-flash-image` on the Vertex EU endpoint (2.5 is shut down on
  2026-10-02 and served as `codai-image`). `costMicroUsd` is usage-based (≈ $0.074 per default
  1K image) instead of a flat $0.04. The image request floor timeout is 150 s.

## [0.9.0] - 2026-09-29

### Added

- `client.images.generate({ prompt, n?, size?, negative_prompt?, model? })` →
  `POST /v1/images/generations` (OpenAI shape, base64 only). Backed by
  `gemini-2.5-flash-image`; `model` defaults to `codai-image` (`imagen-4` / `imagen-4-fast`
  are legacy aliases). Returns `{ data, routedTo, costMicroUsd }`; flat $0.04 per returned image.
- EXPERIMENTAL, unaudited (HIDE protocol) agent-output signatures — provenance only, never
  authentication:
  - `EnvironmentTask.output_signature` (`EnvironmentTaskOutputSignature | null`:
    `alg`, `context`, `key_id`, `sig`, `signed_at`) on `environments.tasks.list/get`.
  - `client.verify.agentOutputKey()` → `GET /v1/verify/agent-output/key` and
    `client.verify.agentOutput({ payload, signature })` → `POST /v1/verify/agent-output`
    (public; never retried, 503 `signing_disabled` when signing is off).

## [0.8.1] - 2026-09-28

### Changed

- Docs: `EnvironmentProvider` `gce` now documents the on-demand CPU sizes
  (`small`/`medium`/`large`) next to `gpu-l4`, and that it is restricted to
  `super_admin` accounts. Types unchanged.

## [0.8.0] - 2026-09-27

### Added

- Resolve pricing experiment (regenerated `src/generated/resolve.ts`):
  - `ResolveQuote.intro_price_micro_eur` / `list_price_micro_eur` — present while the €1 intro
    price applies to your first paid accept.
  - `ResolveAccepted.paid_with` (`ResolvePaidWith`: `intro` | `credit` | `wallet` | `free`) and
    `held_micro_eur`; `ResolveJob.paid_with` once accepted.
  - `ResolveInsufficientFundsError.bundleUrl` — fix-bundle checkout (10 t7 fixes for €49),
    present only for `t7` jobs; also appended to the error message.
  - `client.resolve.balance()` — `GET /v1/resolve/balance` (operation `getResolveBalance`) →
    `ResolveBalance { fix_credits, intro_available, wallet_micro_eur }`.

## [0.7.0] - 2026-09-27

### Added

- Signed Resolve attestations: `ResolveAttestation.signature` (DSSE envelope, `null` for
  pre-signing attestations) and `ResolveAttestationEnvelope` / `ResolveKeys` / `ResolveKey`
  types (regenerated `src/generated/resolve.ts`).
- `client.resolve.keys()` — `GET /v1/resolve/keys` (operation `getResolveKeys`).
- `client.resolve.verifyAttestation(att, { keys })` and offline
  `verifyAttestationWithKeys(att, keys)` → `{ ok: true, keyid }` or
  `{ ok: false, reason: 'UNSIGNED' | 'BAD_SIGNATURE' | 'STATEMENT_MISMATCH' | 'BAD_PAYLOAD_TYPE' }`;
  checks the ECDSA P-256 signature over the DSSE PAE and that the signed statement matches
  the attestation fields. `resolveAttestationStatement(att)` exposes the recomputed statement.

## [0.6.0] - 2026-09-27

### Added

- Resolve job webhooks: `ResolveIntake.callback_url`, one-time `callback_secret` on
  `ResolveQuote` / `ResolveDeclined`, and `ResolveWebhookEvent` / `ResolveWebhookEventName` /
  `ResolveWebhookJob` types (regenerated `src/generated/resolve.ts`).
- `verifyResolveWebhook(secret, rawBody, signatureHeader, { toleranceSeconds = 300, nowSeconds })`
  — constant-time HMAC-SHA256 check of `x-codai-signature: t=<unix>,v1=<hex>` with a
  timestamp window. Server-side (lazy `node:crypto`); the rest of the SDK stays edge-safe.

## [0.5.0] - 2026-09-27

### Added

- `client.resolve` — codai Resolve (execution-verified bug fixes) on its own host
  (`resolveBaseUrl`, default `https://resolve.codai.ro`): `submit`, `get`, `accept`,
  `attestation`, `health` and a `waitFor(id, { intervalMs, timeoutMs, until, signal, onPoll })`
  poll helper. Typed `ResolveError` / `ResolveInsufficientFundsError` (402, `topupUrl`,
  `balance`, `required`). Types generated from `apps/docs/openapi/en/resolve.yaml`
  (`src/generated/resolve.ts`, exported as `ResolvePaths` / `ResolveComponents` /
  `ResolveOperations`); `RESOLVE_OPERATION_METHODS` + parity test.

## [0.4.2] - 2026-09-26

### Changed

- Regenerated gateway types: project `prebuild_pool_size` / `prebuild_provider` /
  `prebuild_size`, environment `prebuild` + create response `prebuild_claimed`
  (CE-0072 prebuild pools).

## [0.4.1] - 2026-09-26

### Changed

- Tests pin `environments.members.sshCert`, `environments.sshCa` and the environment task methods (no runtime change).

## [0.4.0] - 2026-09-26

### Added

- `systemOne.create({ state, questions })` — typed decisions from codai-s1 (`POST /v1/systemone`):
  Choice / Score / Noul answers with calibrated probabilities and `confidence`. Throws on 503
  `s1_unavailable` (the gateway never substitutes a generative model) — keep a local fallback.
- `triggers.{list,create,update,delete,rotateSecret,setSecret,test,events}` and
  `notifications.{list,markRead}`; `fireHook()` signs `x-codai-signature: t=…,v1=HMAC-SHA256` with
  WebCrypto. `environments.members.sshCert()` and `environments.sshCa()`.
- Projects + environments resources (26 operations), restoring full parity with the gateway
  OpenAPI (88 operations): `projects.{list,create,get,update,delete}`,
  `environments.{list,create,enroll,get,update,start,stop,archive,destroy,enrollToken}`,
  `environments.members.{list,add,setSshKey,setRole,remove}`,
  `environments.ports.{list,set,remove}` and `environments.secrets.{list,set,remove}`.
  `enroll`, `create` and `enrollToken` are never retried (the enrolment token is single-use).
- `src/generated/gateway.ts` regenerated; `Project*` / `Environment*` type aliases exported.

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
