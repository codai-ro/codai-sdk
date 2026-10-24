# Changelog

All notable changes to `codai-sdk` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.72.0] - 2026-10-24

- `vault.resolveChallenge()` (`POST /v1/vault/resolve/challenge`) and a required `proof` on `vault.resolve`: local
  brokers prove an enrolled device key (`codai-vault/resolve/v1|<challenge>|<device_id>|<digest>`); helpers
  `resolveDigest` / `resolveMessage`. Device keys gain kind `cli_ed25519`, surface `cli`, attestation `software`.

## [0.71.0] - 2026-10-23

- `MusicRoom.listening`: what the Music Room critic heard (listening features, Audiobox Aesthetics, Gemini listener
  verdict) — new `MusicRoomListening` schema type; `null` before the critic ran. The `critic_text_only` warning is now
  documented (the critic could not listen to the master and judged from the score).

## [0.70.0] - 2026-10-22

- Music Room (MR-09..MR-17): new `client.studio` namespace with `studio.musicRoom` — a team of role agents writes,
  plays, sings and mixes a song with three approval gates. `create(body, { idempotencyKey })`
  (`POST /v1/studio/music-room`, 202), `get(id)`, `list({ limit, before })`, `quota()`
  (`GET /v1/studio/music-room/quota`), `choose(id, { gate: 'plan', variant } | { gate: 'demo' | 'final', approve: true })`,
  `direct(id, { role, section_id?, direction }, { idempotencyKey })` and `wait(id, { untilGate, intervalMs, timeoutMs,
signal })` (polls until `succeeded` / `failed`, or a gate with `untilGate: true`); helper `isMusicRoomFinished(r)`.
- Regenerated types: `MusicRoomCreate`, `MusicRoom`, `MusicRoomPlanVariant`, `MusicRole`, `MusicRoomChoose`,
  `MusicRoomDirect`, `MusicRoomQuota`, `MusicRoomList`; SDK aliases `MusicRoomDto`, `MusicRoomListQuery`, `Studio`.
- Voice passport (D37, beta): new `client.voices` with `addSingingConsent(id, { session_id })`
  (`POST /v1/studio/voices/{id}/singing-consent`, never retried) and `revokeSingingConsent(id)`
  (`DELETE /v1/studio/voices/{id}/singing-consent`, 204): your own custom voice singing in Music Room songs, a separate
  revocable consent; the result approximates your timbre. Types `StudioVoice`, `StudioVoiceSinging`,
  `StudioVoiceSingingConsentRequest`; `MusicRoom.warnings` documents the `voice_passport_*` values.

## [0.69.0] - 2026-10-20

- Creatives (CX-07/08/09): `creatives.build` now also builds carousel (`format: 'png' | 'pdf'`, `format_id`) and
  print (`format: 'pdf'`, PDF/X-4, `crop_marks`) creatives; those answer HTTP 202 with a queued export job. The result
  is typed `CreativeBuildResult = StudioCreativeBuild | StudioCreativePagedBuild`; new helper `isPagedBuild(r)` and
  `creatives.buildAndWait(id, body, { intervalMs, timeoutMs })` (build, then `exports.wait` the export). Types
  `CreativePagedBuildRequest`, `StudioCreativePagedBuild`, `CreativePrintLintIssue`; `StudioExport.kind` gains
  `carousel_png` / `carousel_pdf` / `print_pdf` with `pages`, `boxes`, `lint`.
- `creatives.postCopy(id, { platforms?, language?, brief?, tone?, seq? }, { idempotencyKey })`
  (`POST /v1/studio/creatives/{id}/post-copy`): caption + hashtags per platform and alt text per slide, repaired to
  each platform's limits; token-metered. Types `StudioPostCopyRequest`, `StudioPostCopy`.
- `creatives.transcriptCut(id, { node_id, remove: [{ from_word, to_word }], base_seq?, force? })`
  (`POST /v1/studio/creatives/{id}/transcript-cut`): delete transcript word ranges from a video clip as one new
  version; free. Types `CreativeTranscriptCutRequest`, `CreativeTranscriptCutResult`.
- `creatives.regenerateNode(id, nodeId, { prompt, model?, aspect_ratio?, base_seq?, force? }, { idempotencyKey })`
  (`POST /v1/studio/creatives/{id}/nodes/{nodeId}/regenerate`): new picture for an image node, cast-consistent;
  billed like an image generation. Types `CreativeRegenerateNodeRequest`, `CreativeRegenerateNodeResult`.
- Cast: `CreativeDoc.cast` (`CreativeCast` entries with `refAssetIds` / `description`) and the ops `addCast`,
  `updateCast`, `removeCast`, plus video ops `trimVideo`, `splitVideo`, `setVideoRate` (regenerated types).
- `VideoRequest.reference_asset_ids` (up to 3 Studio image assets of one subject, `POST /v1/videos`);
  `images.generate` accepts `reference_asset_ids` (generated `ImagesRequest`).
- `mediaOps.quote` / `run` / `runAndWait` accept `maskPngB64` (sent as `mask_png_b64`) for `image.inpaint` /
  `image.erase` with a single image asset.

## [0.68.0] - 2026-10-20

- New `mediaOps` resource for codai Studio media operations (AR-02): `mediaOps.list()` (`GET /v1/studio/media-ops`,
  catalogue + list quotes + `available`), `mediaOps.quote(op, { assetIds, params })`, `mediaOps.run(op, { assetIds,
params }, { idempotencyKey })` (200 `media_op.result` for sync ops, 202 `media_op.job` for async ops),
  `mediaOps.job(id)`, `mediaOps.wait(id, { intervalMs, timeoutMs })` and `mediaOps.runAndWait(...)`. Types `MediaOpId`,
  `MediaOp`, `MediaOpList`, `MediaOpRequest`, `MediaOpQuote`, `MediaOpResult`, `MediaOpJob`; helpers `isMediaOpJob`,
  `isMediaOpJobFinished`.
- Creatives: `CreativeKind` gains `audio` (songs and podcasts); `CreativeDoc.audio` is typed as `CreativeAudio`
  (tracks with roles / kinds / FX / sends / automation / MIDI clips, sections, meta, master, timed lyrics, human log);
  `CreativeOp` names the 16 audio ops (`addSection` … `setLyrics`).
- New `lyrics` resource (MU-06): `lyrics.write({ brief, language, genre?, mood?, structure?, syllables_per_line?,
rhyme_scheme?, lines_per_section?, title? }, { idempotencyKey })` (`POST /v1/studio/lyrics`, lyrics with per-line
  syllables / rhyme letters and a `report`) and `lyrics.align({ creative_id, clip_id, lyrics_text, apply?, … })`
  (`POST /v1/studio/lyrics/align`, timed lines + LRC, applied as one `setLyrics` edit). Types `Lyrics`, `LyricsRequest`,
  `LyricsLine`, `LyricsSectionKind`, `LyricsAlignRequest`, `LyricsAlignment`.
- `creatives.renderAudio(id, { formats, stems, lrc, loudness, title }, { idempotencyKey })` (MU-05): mixdown +
  mastering + WAV / MP3 / FLAC / stems / LRC exports of an `audio` creative (202 `CreativeAudioRenderAccepted`;
  `renders.retrieve` answers one `data[]` asset per output, type `StudioAudioRender`). `renderCreative` body and 202 are
  now a video | audio union in the generated types; `CreativeRenderRequest` / `CreativeRenderAccepted` keep the video
  shape.
- New `jam` resource (MU-09): `jam.connect({ token | apiKey, sessionId?, WebSocket? })` opens the
  `wss://…/v1/studio/jam` live jam (Lyria RealTime, PCM16 48 kHz stereo `audio` events; `prompts`, `config`, `play`,
  `pause`, `stop`, `reset`; `status` / `filtered` / `error` / `close` events). Exports `JamSession`, `jamUrl`,
  `JAM_CLOSE_CODES`, `JAM_SCALES`, `JAM_SUBPROTOCOL`.

- AL-240: `apps.keys.mint({ adultConfirmed? })` and `apps.subscriptions.sync({ adultConfirmed? })` let a host app
  attest that its end user confirmed being 18 or older; codai stores it on the user it creates
  (`users.adult_confirmed_at`, version `host:<app slug>`). Optional for host apps; required for codai's own app.

## [0.67.0] - 2026-10-20

- Vault guards v4 (V-18, V-19, V-21, V-32, V-35): `vault.updateSettings({ default_tier?, guards? })` changes the
  anomaly guards (new host in 30 days, burst, allowed hours; an anomaly forces t4 with reason
  `anomaly:new_host|burst|hour`); `vault.lock({ via? })` is the panic lock (revokes grants, denies pending approvals,
  agent uses then answer `vault_locked`); `vault.unlockChallenge()` + `vault.unlock({ challenge, proof })` end a lock
  with a device-key or passkey proof over `vaultUnlockMessage(challenge, deviceIdOrPasskey)`; `vault.limits()` /
  `vault.setLimits(id, { per_minute, per_day, units_per_day })` manage per-handle caps (over a cap the broker calls
  throw a 429 `CodaiError` with `code: 'vault_rate_limited'` and `retryAfter`); `vault.revokeTaskGrants(task)` ends
  the grants of a finished task. `vault.account()` now carries `locked_at`, `lock_reason` and `guards`. Types
  `VaultGuards`, `VaultSettings`, `VaultLockResult`, `VaultUnlockChallenge`, `VaultUnlockRequest`, `VaultItemLimits`.

## [0.66.0] - 2026-10-20

- Prompt organisation (PR-04/05/07): prompt rows carry `tags`, `priority` (0–3), `recurrence`
  (`{ every: 'day' | 'week' | 'month', at? }` or `{ on: 'session_end' }`), `next_prompt_id`, `launch`
  (`{ agent?, model?, folder? }`) and `is_template`, also accepted by `prompts.create` / `prompts.update`.
  `prompts.list` takes `tag` (string or array, AND), `priority_min`, `q`, `templates: 'only' | 'exclude'`, `sort` and
  `order`.
- New prompt methods: `prompts.exportPrompts({ format: 'csv' | 'md', ...filters })` (`GET /v1/prompts/export`,
  returns the document text), `prompts.bulk({ ids, action, not_before?, tags?, priority? })` (`POST /v1/prompts/bulk`
  → `{ updated }`), `prompts.events(id)` (`GET /v1/prompts/{id}/events`, history newest first) and
  `prompts.instantiate(id)` (`POST /v1/prompts/{id}/instantiate`, open copy of a template).
- Prompt types now come from the generated OpenAPI types (`PromptRecurrence`, `PromptLaunchConfig`,
  `PromptBulkRequest`, `PromptHistoryEvent`, `PromptExportQuery`, ...); the organise fields are required on `Prompt`.
- Stub sessions (SS-02): `sessions.create` accepts `stub: true` (title-only mirror, no events yet), session rows carry
  `stub`, and `SessionControlKind` gains `hydrate` (session owner only) to ask the executor for the transcript.

## [0.65.0] - 2026-10-19

- Sandboxes v2 are generally available and the default backend: `sandboxes.create()` without `backend` starts a
  v2 pod (the gateway falls back to v1 when v2 is unavailable for the key; read `backend` on the reply).
  `SandboxCreateInput.backend` now defaults to `'v2'` in the generated types; pass `'v1'` for Cloud Run.
- v2 now accepts `egress` (`pypi` / `npm` preset or an allowlist, through the codai egress proxy), `inputs` on
  exec and `artifacts()`; the image ships Node 24 + npm. `snapshot()` stays v1 only (409 `not_supported_on_v2`).
- Error `code` gains `sandbox_paused_limit` (429 on `pause()`, 10 paused v2 sandboxes per user) and
  `sandbox_capacity` (503 on create / resume / fork, retry); 429 `sandbox_concurrency_limit` also covers
  5 running v2 sandboxes per user. Regenerated `src/generated/gateway.ts`.

## [0.64.0] - 2026-10-20

- New `osGate` resource for the OS protection gate: `osGate.policy()` (`GET /v1/policy`, `{ os_gate: { allow_override } }`
  folded over every org of the caller, strictest wins; 503 `policy_unavailable` = keep your cached value) and
  `osGate.recordEvent(event)` (`POST /v1/os-gate/events`, 202 `{ ok: true }`; audit an override granted/revoked with
  check ids, surface, app version and time only). Types `PolicyResponse`, `OsGateEvent`, `OsGateCheckId`,
  `OsGateSurface`, `OsGateEventAccepted`.

## [0.63.0] - 2026-10-20

- `memory.deleteAll()` (`DELETE /v1/memory?confirm=all`, AL-234): erase every memory of your account in one call;
  returns `{ deleted: { semantic, episodic, procedural, graph }, total }`. Type `MemoryDeletedAll`.

## [0.62.0] - 2026-10-19

- Vault approvals bind the request preview and use number matching (V-30/V-31): `vault.use` / `vault.http` /
  `vault.resolve` answers carry `match_number` (show it to the user next to "waiting for approval"), and
  `vault.decide` accepts `match_number` (the number the user tapped) with a device or passkey proof over the
  approve/v3 message. A t4 approve on a request with a preview needs it (403 `match_required`; a wrong number
  answers 403 `match_mismatch` and denies the request).

## [0.61.0] - 2026-10-19

- New `productions` resource for codai Studio brief → promo video (RC-20): `productions.create(body, { idempotencyKey? })`
  (`POST /v1/studio/productions`, 202), `productions.retrieve(id)`, `productions.wait(id, { intervalMs?, timeoutMs? })`
  and `productions.run(body)`. Types `StudioProductionCreate`, `StudioProduction`, helper `isProductionFinished`.

## [0.60.0] - 2026-10-19

- Studio templates (RC-29): `templates.list` accepts `source` (`own` | `starter` | `all`), `locale` (`en` | `ro`) and
  `month` (1–12); lists now include the 40 built-in starter templates (`source: "starter"`, ids
  `starter:<slug>:<en|ro>`, inline SVG `thumbnail_url`, `description`, `category`, `months`, `scene_count`) after your
  own. A starter id works in `templates.retrieve`, `creatives.create({ template })` and batch `template_id`.

## [0.59.0] - 2026-10-19

- New `vault.devices` for hardware-backed device approval keys (V-27): `challenge()` (`POST /v1/vault/devices/challenge`),
  `enroll(body)` (`POST /v1/vault/devices`, vault-signed + possession signature + Android key / TPM attestation),
  `list()`, `rename(id, name)` and `revoke(id)`. Types `VaultDeviceKey`, `VaultDeviceChallenge`, `VaultDeviceEnroll`,
  `VaultDeviceAttestation` (`android-strongbox` | `android-tee` | `tpm` | `hello-unattested`).
- `vault.decide` accepts a v2 `proof` (`{ type: 'device', device_id, signature }` or `{ type: 'passkey', response }`,
  type `VaultApprovalProof`) instead of the v1 `signature`; `signature` is now optional (a deny needs no proof) and
  `step_up_acr` is deprecated (ignored by the gateway).
- Regenerated `src/generated/gateway.ts` from the current OpenAPI spec.

## [0.58.0] - 2026-10-19

- New `research` resource for async deep research (`POST /v1/research`, `GET /v1/research/{id}`):
  `research.create(body, { idempotencyKey? })` (200 finished / 202 queued), `research.retrieve(id)`,
  `research.wait(id, { intervalMs?, timeoutMs? })` and `research.run(body)` (create + wait). Types `ResearchRequest`,
  `ResearchJob`, `ResearchSource`, helper `isResearchFinished`.
- `tools.search` types follow the shared web tools contract: `include_domains` / `exclude_domains`,
  `published_after` / `published_before`, `freshness: 'year'`, `content_chars`; results carry `published_at`
  (null when unknown, never the crawl date), `crawled_at` and optional `content`; responses add `notes`.
  `lang` / `country` no longer default to `ro` (inferred from the query). `tools.fetch` `max_chars` is 200–40 000,
  default 8000.
- Regenerated `src/generated/gateway.ts` from the current OpenAPI spec.

## [0.57.0] - 2026-10-19

- `billing.studioQuote({ action, ... })` — `GET /v1/studio/quote`: the price of a codai Studio action (USD and wallet
  EUR micros) and your spendable balance before you run it.
- `ext.idempotencyKey` sends `Idempotency-Key`: a retried billed Studio POST (videos, music, renders, timelines,
  documents, creatives, batches) replays the first answer instead of charging twice (24 h).
- Paid Studio calls can now answer 402 `insufficient_funds` (`quote_micro_eur`, `balance_micro_eur`) as a `CodaiError`.

## [0.56.0] - 2026-10-18

- Vault: `client.vault` covers every `/v1/vault/*` route (account, settings, vaults, items, cloud copy, rules,
  grants, events, approvals + `decide`, and the agent broker `catalog` / `use` / `httpCall` / `resolve`). The server
  only stores ciphertext built client-side; the broker calls never return secret values. Generated types for the
  `Vault*` schemas.
- Studio share links: `expires_in_days` also accepts `'never'`; omitted now means 30 days (was: never expires).
- `StudioPublicReview.decided_by_kind` (`'self_declared'`): the approver name is typed by the link holder, not verified.

## [0.55.0] - 2026-10-17

- Sandboxes v2 (closed canary): `sandboxes.create({ backend: 'v2', template })` with templates `codai-base`,
  `brivio-acte` and `desktop`; `Sandbox.backend` (`v1` | `v2`), optional `restored`, status `paused`.
- New methods: `sandboxes.runCode(id, { code, timeoutSeconds? })` (persistent Python kernel),
  `sandboxes.resetKernel(id)`, `sandboxes.pause(id)`, `sandboxes.resume(id)` (`restored`, `ready_ms`),
  `sandboxes.fork(id, { count, ttlSeconds? })` (1–5 children, per-child `restored` / `error`) and
  `sandboxes.preview(id, { port, ttlSeconds? })` (signed `*.sbx.codai.ro` URL, ≤ 1 h).

## [0.54.2] - 2026-10-17

- `SandboxExecResult.exit_code` and the exec stream `exit` event document the real exit status: the command's own
  status, `128 + n` when ended by signal `n`, `null` only on timeout (`timed_out: true`) or when the process could not
  be started. Docs-only type change.

## [0.54.1] - 2026-10-16

- `WalletLedgerEntry.source` gains `sandbox_charge`: the agent sandbox exec-time debit (€0.10 per exec-hour after
  10 free exec-hours a month), written every 5 minutes once sandbox billing is switched on. Free while billing is off.

## [0.54.0] - 2026-10-16

- `provenance.check(file, { contentType? })` — public AI-provenance checker (`POST /v1/public/provenance/check`,
  no key needed, ≤ 25 MB): reports C2PA manifest presence and claimed issuer, the WAV RIFF INFO, MP3 ID3 and MP4
  `udta/meta` AI marks and image XMP. `signature_verified` and `synthid_checked` are always `false`.

## [0.53.0] - 2026-10-16

- `client.sandboxes` (beta) — agent sandboxes over REST (`/v1/sandboxes`): `create` / `list` / `retrieve`, `exec`
  (blocking, returns `SandboxExecResult` with stdout, stderr, exit code and a reproducibility `receipt`),
  `execStream` (async iterator of `SandboxExecEvent`: `start`, `stdout`, `stderr`, `truncated`, `exit`, `error`),
  `files.put` / `files.get` / `files.list`, `artifacts` (scanned files from `/workspace/out` with signed 1 h links),
  `snapshot`, `delete` and one-shot `run`. `exec` and `run` accept `{ idempotencyKey }`.
- Chat `tools` items may now be `{ type: 'codai_sandbox', egress?, template? }` (`ChatSandboxTool`): the gateway runs
  bash / Python server-side in a sandbox per session and returns the artifacts with the final message.
- REST exec over Environments: `environments.exec(envId, { op?, command?, args?, timeout_ms? })` (blocking relay op,
  shell results flattened to `exit_code` / `stdout` / `stderr`), `environments.files.list` / `get` / `put` (UTF-8
  text, ≤ 2 MB) and `environments.jobs.start` / `get` (status + output). No WebSocket client needed; 409
  `environment_offline`, 504 `host_timeout`.

## [0.52.0] - 2026-10-16

- `abuseReports.create({ share_token, surface, category, explanation, reporter_name, reporter_email, good_faith: true })`
  — `POST /v1/studio/abuse-reports` (public, no key needed): DSA art. 16 notice about illegal or abusive content on a
  codai Studio share (`surface: 'share'`) or review (`'review'`) link — categories `voice_without_consent`,
  `impersonation`, `fraud`, `election`, `illegal_other`, `other`. Answers 202
  `{ id, object: 'studio.abuse_report', status: 'open' }`, also for an unknown link (no enumeration). Never retried.
  Types `StudioAbuseReportRequest`, `StudioAbuseReport`.

## [0.51.0] - 2026-10-16

- `resolve.list({ status?, limit?, cursor? })` — `GET /v1/resolve/jobs`, your Resolve jobs newest first
  (`{ jobs, next_cursor }`, `status` = one status or an array sent as a comma list), and
  `resolve.iterate(query)`, an async iterator that follows `next_cursor`. `ResolveJob` gains `issue_url` and
  `issue_title` (first line of the issue, max 120 chars). Types `ResolveJobList`, `ResolveListQuery`.
- `billing` (READ-ONLY, never starts a payment): `billing.get()` — `GET /v1/billing` (plan, wallet, auto top-up,
  compute reserve, saved cards without Stripe ids, pay links); `billing.invoices({ limit })` —
  `GET /v1/billing/invoices` (brivio invoices and credit notes with a hub `pdf_url`);
  `billing.watchBalance({ thresholdEur, intervalMs?, signal?, onLow, onError? })` polls `get()` and calls `onLow`
  once per crossing below the threshold; returns a stop function.
- `referrals`: `referrals.get()` — `GET /v1/referrals` (stats, `redeem_until`, invitees with a masked id only);
  `referrals.redeem(code)` and `referrals.setConsent(bool)` call `PATCH /v1/account` with `referral_code` /
  `referral_consent`.

## [0.50.0] - 2026-10-16

- `voiceRevocations.create({ email, voice_owner_name, details, evidence_url? })` — `POST /v1/studio/voice-revocations`
  (public, no key needed): asks for a voice cloned in codai Studio to be taken down; answers 202
  `{ id, object: 'studio.voice_revocation', status: 'open' }` and never echoes the input (only the sha256 of the e-mail
  is stored). Never retried. Types `StudioVoiceRevocationRequest`, `StudioVoiceRevocation`. Custom (cloned) voices
  themselves are not in the SDK while the feature flag is off.

## [0.49.0] - 2026-10-16

- Lottie export: `creatives.exportLottie(id, { format?, formats?: 'all', seq?, container?: 'json' | 'dotlottie' })` —
  `GET /v1/studio/creatives/{id}/export.lottie` exports a video creative as a Lottie animation (Bodymovin JSON with
  embedded images, or a dotLottie `.lottie` archive), free and synchronous: the `StudioExport` comes back already
  `succeeded` with a signed `url` and the fidelity report in `warnings` (video, chart, HTML block, table, cell grid
  and audio nodes are not exported). `creatives.downloadLottie(id, opts)` returns the file itself
  (`{ bytes, filename, contentType }`, `download=1`). `StudioExport` gains `kind` (`'fcpxml' | 'lottie'`) and
  `container` (Lottie only). Types `ExportLottieQuery`, `LottieDownload`.

## [0.48.0] - 2026-10-16

- `ai_label` (`'none' | 'corner' | 'end_card'`, EU AI Act art. 50(4)) on `renders.create` / `renders.render`,
  `creatives.render` and `batches.create`: burns a visible "AI-generated" label (corner for the whole video, or a ~2 s
  end card) into the MP4. Omitted = `corner` when the render uses TTS narration or AI-generated images, else `none`;
  `none` with TTS narration is a 400 `ai_label_required`. Render responses report the resolved `ai_label`
  (`RenderAiLabel` type), and so do `renders.list` items (`none` for renders from before the label existed).

## [0.47.2] - 2026-10-16

- `client.memory.list/search/create/delete` — your persistent memory over REST (`/v1/memory`), the same store
  the MCP memory tools use. Search and create are metered as `memory:search` / `memory:create`.

## [0.47.1] - 2026-10-15

- `allow_remix` on view share links now defaults to `false` server-side (E-13 legal review): pass
  `allow_remix: true` to let link holders remix the creative into their own account.

## [0.47.0] - 2026-10-15

- Share links: `creatives.createShare(id, { kind: 'view' | 'review', label?, expires_in_days?, seq?, allow_remix?,
can_approve? })` — `POST /v1/studio/creatives/{id}/shares` returns the public `url` (`https://hub.codai.ro/s/…` or
  `/r/…`) and its `token` once; `creatives.listShares(id)` and `creatives.revokeShare(id, shareId)`.
- Review: `creatives.review(id)`, `requestReview(id)`, `resetReview(id)` (`draft` → `in_review` → `approved` |
  `changes_requested`, approval pins `approved_seq` + `approved_doc_hash`); threads anchored to `node_id` /
  `scene_id` / `t_ms`: `reviewThreads(id, { status? })`, `createReviewThread`, `replyReviewThread`,
  `resolveReviewThread`, `reopenReviewThread`, `deleteReviewComment`.
- New `client.shares` for share links seen from the outside (token or whole link): `get(link, { format?, locale? })`
  (`GET /v1/public/studio/shares/{token}`, no key needed), `remix(link, { title? })` (copies a view link into your
  account, assets included), and through review links `comment`, `reply`, `resolve`, `reopen`, `decide` (approve /
  request changes; approver links only). `shareTokenFrom(input)` extracts the token. All free.
- Types `StudioShare`, `StudioShareCreated`, `StudioShareCreateRequest`, `StudioReview`, `StudioReviewThread`,
  `StudioReviewComment`, `StudioPublicShare`, `StudioPublicReview`, `StudioRemixResult`.

## [0.46.0] - 2026-10-15

- Localisation: `creatives.locales(id, { locale?, units?, offset?, limit? })` — `GET /v1/studio/creatives/{id}/locales`
  (source locale, glossary, per-locale translated / missing / stale / voice counts, and the units of a locale);
  `creatives.localize(id, { locales, tone?, glossary?, only_missing?, voice?, base_seq?, force? })` —
  `POST /v1/studio/creatives/{id}/localize` translates every text into up to 10 BCP-47 locales as per-locale
  overrides in one new version (token-metered `codai` turns; `voice: true` narrates voice clips again, billed);
  `creatives.forkLocale(id, locale, { title?, seq? })` — `POST /v1/studio/creatives/{id}/locales/{locale}/fork` saves a
  locale as a new creative. Types `CreativeLocaleStatus`, `CreativeLocaleUnit`, `CreativeLocalizeRequest`,
  `CreativeLocalizeResult`, `CreativeLocaleForkRequest`, `CreativeLocaleForkResult`.
- `locale` on `creatives.compiled`, `render`, `frame`, `captionsSrt`, `captionsVtt` and `lint(id, { locale? })`
  (lint gains an optional body; existing `lint(id)` calls are unchanged in behaviour but `opts` moved to the third
  argument). Lint codes `missing_translation`, `stale_translation`, `text_overflow_locale` and `LintIssue.locale`;
  `CreativeOp` gains `setLocaleText`, `setLocale`, `setLocalization`.
- Batches: new `client.batches` — `create(body)` / `dryRun(body)` (`POST /v1/studio/batches`, one creative per CSV or
  sheet row from a template or a creative), `list(query?)`, `get(id, { rows?, status?, offset?, limit? })`,
  `cancel(id)`, `retry(id)`, `exportCsv(id)` (status CSV text), `zip(id)` (ZIP of finished renders) and
  `wait(id, { intervalMs?, timeoutMs?, signal? })`. Types `StudioBatch`, `StudioBatchRow`, `StudioBatchDetail`,
  `StudioBatchList`, `StudioBatchDryRun`, `StudioBatchCreateRequest`, `StudioBatchStatus`, `StudioBatchRowStatus`.

## [0.45.0] - 2026-10-15

- Auto-captions: `creatives.captions(id, { clip_id?, preset?, node_id?, script?, language?, retranscribe?, base_seq?,
force? })` — `POST /v1/studio/creatives/{id}/captions` transcribes a voice clip word by word (words cached on the
  asset, free next time), corrects the spelling with the script and adds or updates a captions node as one new
  version; resolves to the `edit` answer plus `node_id`, `words`, `cached`, `corrected`, `cost_micro_usd` (a fresh
  transcription is billed at the speech-to-text rate). `creatives.captionsSrt(id, { node_id?, seq? })` /
  `captionsVtt(...)` return the captions as SRT / WebVTT text. Types `CreativeCaptionsRequest`,
  `CreativeCaptionsResult`, `CaptionPresetId`.
- Platforms: `creatives.adapt(id, { platforms, focal?, base_seq?, force? })` — `POST /v1/studio/creatives/{id}/adapt`
  adds one format per platform (`tiktok`, `reels`, `shorts`, `feed-square`, `feed-portrait`, `youtube`) with text
  kept inside the platform safe zone; `focal: 'vision'` (token-metered) finds image focal points. Types
  `CreativeAdaptRequest`, `CreativeAdaptResult`, `PlatformId`; `CreativeOp` gains `adaptFormat` and `setControl`.
- Lint: `LintIssue` gains `format` and `fixable` and the codes `empty_list`, `off_brand_color`,
  `outside_platform_safe_zone`, `text_too_small`, `missing_alt`, `missing_captions`, `reading_speed`, `flashing`
  (`CreativeLintCode`); the lint result adds `fixable`. `creatives.lintFix(id, { codes?, agent?, base_seq?, force? })`
  — `POST /v1/studio/creatives/{id}/lint/fix`: deterministic fixes are free, `agent: true` adds one billed `codai` turn.
  Types `CreativeLintFixRequest`, `CreativeLintFixResult`.
- Tweak panel: `creatives.controls(id)` — `GET /v1/studio/creatives/{id}/controls` (`PanelControl[]`); types
  `CreativeControl`, `PanelControl`.
- `RenderAspectRatio` gains `'4:5'` (1080×1350).

## [0.44.0] - 2026-10-14

- Brand kits as Design Tokens (DTCG 2025.10): `BrandKit` gains `dtcg` (the canonical document), `contrast`
  (`BrandKitContrastPair[]`: WCAG ratio + `aa` for text/background, primary/background, background/primary,
  accent/background, secondary/background) and `updated_at`; `tokens` also carries the document aliases
  (`color.bg`, `color.fg`, `color.accent`, `font.heading`, `font.body`), extra colours and `radius`.
- `brandKits.create({ name, tokens } | { name, dtcg })` — `POST /v1/studio/brand-kits` (import a DTCG file or define the
  5 colours + fonts; 400 `invalid_tokens` with `details.issues`), `brandKits.update(id, { name?, tokens?, dtcg?,
logo_asset_id? })` — `PATCH /v1/studio/brand-kits/{id}` (tokens merged, dtcg replaced, `logo_asset_id: null`
  removes the logo), `brandKits.exportDtcg(id)` — `GET /v1/studio/brand-kits/{id}/dtcg` (the DTCG JSON object). Free.
- `brandKits.extract({ logo_asset_id, name? })` — extract a kit from one of your logo images (one vision turn; 400
  `unsupported_media`); `{ url }` unchanged. Types `BrandKitCreateRequest`, `BrandKitUpdateRequest`, `BrandKitDtcg`.
- `creatives.restyle(id, { brand_kit_id } | { tokens }, …)` — `POST /v1/studio/creatives/{id}/restyle`: re-applies a kit
  as one new version (literal brand colours become token refs, `snap` maps the rest to the nearest kit colour,
  `fonts` by role, locked nodes skipped unless `force`). Resolves to the `edit` answer. Free. Type
  `CreativeRestyleRequest`; `CreativeOp` gains `restyle`.

## [0.43.0] - 2026-10-14

- Documents as creatives: `creatives.fromDocument(documentId)` — `POST /v1/studio/documents/{id}/creative` turns a
  Studio deck / doc / sheet into an editable creative (slides = scenes with `layout` + `notes`, doc pages = a `flow`
  group, sheets = a `cell_grid` + chart nodes; nodes carry semantic `role`s). Idempotent: resolves to
  `StudioCreativeFromDocument` (`Creative` + `document_id`, `existing`; HTTP 201 new / 200 already linked). Free.
- `creatives.build(id, { seq?, preview?, filename? })` — `POST /v1/studio/creatives/{id}/build` builds the creative back
  into PPTX / DOCX / XLSX as a new version of its document. Resolves to `StudioCreativeBuild`
  `{ object: 'studio.creative_build', creative_id, seq, warnings, document }`; 400 `not_supported_for_kind` /
  `invalid_spec`. Files are free; `preview: true` queues the billed document preview.
- `StudioDocument.creative_id` (`string | null`); `CreativeCompiled.kind` (`compiled` now previews deck / doc / sheet
  creatives). Creative node schema: `list`, `table`, `cell_grid` nodes, `role`, span `code` / `link` / `footnote`,
  image `alt` / `caption`, chart `anchor`, scene `notes` / `layout`, text `align: 'justify'`. Types
  `StudioCreativeFromDocument`, `CreativeBuildRequest`, `StudioCreativeBuild`; generated types regenerated.

## [0.42.0] - 2026-10-14

- FCPXML export: `creatives.exportFcpxml(id, { format?, seq? })` — `GET /v1/studio/creatives/{id}/export.fcpxml`
  queues a zip with an FCPXML 1.10 project (one clip + marker per scene, audio on its own lanes) and its media
  (per-scene MP4 segments, voice / music / sfx files) for Final Cut Pro, DaVinci Resolve or Premiere (FCPXML import).
  Resolves to `StudioExport` `{ id, status: 'queued', creative_id, seq, format, fps, filename, url, expires_at, bytes,
rendered_seconds, cost_micro_usd, warnings, error, created_at }`; 400 `unsupported_kind` / `unsupported_format` /
  `too_long`. Only newly rendered seconds are billed, at the final render price (cached segments are free).
- `exports.retrieve(id)` — `GET /v1/studio/exports/{id}` (free); `exports.wait(id, { intervalMs?, timeoutMs?, signal? })`
  polls every 3 s (up to 15 min) until `succeeded` (signed `url`, valid 1 h) or `failed` and resolves the final export.
  Types `StudioExport`, `ExportFcpxmlQuery`, `ExportWaitOptions`.

## [0.41.0] - 2026-10-14

- Templates from your own creatives: `creatives.saveTemplate(id, { vars, title?, seq? })` —
  `POST /v1/studio/creatives/{id}/template`: each `vars` entry (`{ node_id, prop: 'text' | 'image', key, label? }`)
  turns a text node's text or an image node's asset into a template variable (current value = default). Resolves to
  `CreativeTemplate` `{ id, title, kind, source_creative_id, source_seq, vars_schema, thumbnail_url, created_at, doc }`;
  400 `node_not_found` / `invalid_pick` / `duplicate_key`. Free; templates are private.
- `templates.list({ kind?, limit? })`, `.retrieve(id)` (with `doc`), `.delete(id)` — free.
- `creatives.create({ kind, template, vars })` starts version 1 from a template with the var values applied
  (400 `kind_mismatch` / `unknown_var` / `invalid_var_value`, 404 unknown template); `brand_kit_id` still composes.

## [0.40.0] - 2026-10-14

- Cards: `cards.product(url, lang?)` — `POST /v1/cards/product`: a `products` card block with one item read from a
  public https product page's schema.org `Product` JSON-LD (or OpenGraph product tags): name, image, price + currency
  (lowest offer), old price, rating (0–5), reviews, seller, availability badge (en/ro). Only what the page states,
  never sponsored; SSRF-guarded like `unfurl`, cached 6 h, shares its 500/day limit; 422 `product_not_found`.

## [0.39.0] - 2026-10-14

- Brand kits: `brandKits.extract({ url, name? })` — `POST /v1/studio/brand-kits/extract`: fetches a public https page
  (SSRF-guarded), one bounded `codai` model turn picks the palette (primary, secondary, accent, background, text) and
  the heading / body fonts, the logo is stored as an `image` asset. Resolves to `BrandKit` `{ id, name, source_url,
tokens, logo_asset_id, logo_url, logo_mime_type, created_at }`; 400 `url_blocked`, 422 `fetch_failed` /
  `extract_failed`, 504 `timeout`. Token-metered (`codai::brand-kit-extract`).
- `brandKits.list({ limit? })`, `.retrieve(id)`, `.delete(id)` — free.
- `creatives.create({ kind, brand_kit_id })` applies a kit to version 1 (`brand = { kitId, tokens }` + the logo asset).

## [0.38.0] - 2026-10-14

- A/B variants of a creative: `creatives.variants(id, { base_seq, count?, focus?, brief?, render?, format? })` —
  `POST /v1/studio/creatives/{id}/variants`: one bounded `codai` model turn proposes up to 5 variants (focus hook /
  title / cta / visual / copy), each saved as a fork of the creative with the ops applied plus a queued draft render.
  Resolves to `CreativeVariantsResult` `{ group_id, base_seq, variants: [{ creative_id, label, rationale, applied_ops,
head_seq, render_id }] }`; 422 `no_edit`, 504 `timeout` after 90 s. Token-metered (`codai::creative-variants`),
  draft renders billed on their poll.
- `creatives.listVariants(id)` — `GET …/variants`: the latest group with `status` (`candidate` / `winner` /
  `rejected`) and the stored render state (poster / video URLs once succeeded).
- `creatives.pickVariant(id, variantId, { base_seq })` — `POST …/variants/{variantId}/pick`: the winner's ops onto the
  original (rebased like `edit`, 409 `stale` on overlap), statuses updated. Resolves to `{ head_seq, version, winner,
rebased }`.

## [0.37.0] - 2026-10-14

- `SessionControlKind` gains `pause` and `resume`: `POST /v1/sessions/{id}/control` with `kind: 'pause'`
  parks the running turn at its next step boundary (after the current tool calls), `kind: 'resume'` continues the
  same turn. Editors may send both (same trust as `cancel`). Executors report the state with a `run_state` event
  `{ state: 'paused' | 'running' }`.

## [0.36.0] - 2026-10-12

- `creatives.comment(id, { t_ms, comment, base_seq, node_id?, scene_id?, apply? })` —
  `POST /v1/studio/creatives/{id}/comments`: a comment pinned on a frame becomes an edit (one bounded `codai` model
  turn proposes ops, applied like `edit`). Resolves to `CreativeCommentResult` `{ head_seq, applied_ops, summary,
version }`; 409 `stale` on an overlapping change, 422 `no_edit` when the model made no edit, 504 `timeout` after
  60 s. Token-metered (`codai::creative-comment`).

## [0.35.0] - 2026-10-12

- `creatives.frame(id, { t_ms, format?, exact?, version? })` — `POST /v1/studio/creatives/{id}/frame` now returns PNG
  still frames (`CreativeFrames`, `status: 'succeeded'`) or a running `CreativeFrameJob` (`status: 'running'`) when
  they are not ready within ~90 s. `exact: true` cuts frames from a draft render of the covering scenes. Cached frames
  are free; 60 frame jobs per UTC day are free, then billed (`billed_micro_usd`). `body` is now required.
- `creatives.frameJob(id, jobId)` — `GET /v1/studio/creatives/{id}/frames/{jobId}`, polls a frame job.
- `creatives.render` now resolves to `CreativeRenderResult`: the queued render (202, `cached: false`) or the identical
  existing render (200, `cached: true`, `status: 'succeeded'`, no new charge).

## [0.34.0] - 2026-10-12

- `cards.route({ from | origin, to | destination, mode?, depart_at? })` — `GET /v1/cards/route`, travel time from
  Google Routes (`route` summary + `map` block); billed $0.010 traffic-aware driving, $0.005 walk / bike / transit.
- `cards.track({ awb, carrier? })` — `GET /v1/cards/track`, parcel history (Sameday live; FAN Courier, Cargus, DPD
  with a gateway carrier contract only) as a `timeline` block plus `result`.
- `cards.efactura({ limit? })` — `GET /v1/cards/efactura`, your fiscal documents issued through Brivio with their
  ANAF e-Factura status.

## [0.33.0] - 2026-10-12

- `client.creatives` — codai Studio editable creative documents (ECD) with an append-only version history:
  `list`, `create`, `retrieve(id, { seq })`, `outline`, `find(id, query)`, `subtree`, `edit(id, { baseSeq, ops, intent,
author, force })` (`POST /v1/studio/creatives/{id}/ops`; a stale base is rebased, overlapping changes throw
  `CodaiError` 409 `stale`), `versions`, `revert(id, seq)`, `fork`, `delete`, `lint`, `compiled` (preview HTML with
  signed asset URLs) and `render` (queues a `codai-render`, HTTP 202; poll `renders.retrieve`). `frame` is reserved
  (501 `not_implemented`). Everything except `render` is free.
- `createTimeline` replies carry `creative_id`; `renders.retrieve` reports `creative_id` for renders linked to a creative.
- Generated types: `Creative*` schemas and operations `listCreatives`, `createCreative`, `getCreative`, `deleteCreative`,
  `getCreativeOutline`, `findCreativeNodes`, `getCreativeSubtree`, `applyCreativeOps`, `listCreativeVersions`,
  `revertCreative`, `forkCreative`, `lintCreative`, `getCreativeCompiled`, `renderCreative`, `createCreativeFrame`.

## [0.32.0] - 2026-10-12

- `lists` resource — codai Lists + Share to codai: `list`, `create`, `reorder`, `update`, `delete`, `items`, `add`,
  `updateItem`, `deleteItem`, `image` (`{ bytes, contentType }`), `exportMarkdown` (string), `share` (`POST /v1/share`,
  201 created / 200 dedupe) and `stream()` (`event: list` frames).
- `schedules.audit({ schedule_id?, limit? })` — `GET /v1/schedules/audit`, the append-only scheduler audit log.
- Generated types: 14 new operations (lists, share, schedule audit).

## [0.31.0] - 2026-10-12

- `cards.render({ block, format?, width?, height?, theme?, scale? })` — `POST /v1/cards/render`: renders a `chart` or
  `qr` card block to PNG (default) or SVG on the gateway and returns `{ bytes, contentType, width, height }`. Free,
  2000 renders per user per day. Mermaid `diagram` / `math` blocks are not supported yet (422 `render_unsupported`).
- Generated types: operation `cardsRender`.

## [0.30.0] - 2026-10-12

- Studio scene timelines on `client.renders`: `renders.createTimeline(body)` for `POST /v1/studio/timelines` (image/video
  scenes, optional narration billed now and a music bed; HTTP 202, poll with `retrieve`), `renders.regenerateScene(
renderId, sceneId, body)` for `POST /v1/studio/renders/{id}/scenes/{sceneId}/regenerate` (a new render with one
  scene replaced: reuse an asset, regenerate with `codai-image` / `codai-video`, re-narrate or remove the narration) and
  `renders.list({ before, limit, rootRenderId })` for `GET /v1/studio/renders` (no polling, no URLs).
- `renders.retrieve(id, { expandAssets })` sends `?expand=assets`; `RenderJobStatus` gains `stage`, `title`,
  `parent_render_id`, `root_render_id` and `timeline`.
- Generated types: `StudioRenderList`, `StudioTimelineCreate`, `StudioTimelineAccepted`, `StudioSceneRegenerate`,
  `StudioSceneRegenerateAccepted`, `StudioTimeline`; error codes `timeline_too_long`, `not_a_timeline`; operations
  `listRenders`, `createTimeline`, `regenerateRenderScene`.

## [0.29.0] - 2026-10-11

- `CodaiApps` — management client for host apps on the mgmt API (`api.codai.ro`) with an app connection token:
  `keys.mint/list/update/revoke/usage/revokeAllFor`, `users.getOverride/setOverride/clearOverride`,
  `subscriptions.sync` and `validateKey` (`/internal/keys/validate`, separate shared secret). Unwraps `{ ok, data }`,
  throws `CodaiError` with the mgmt error code; 20 s timeout, one retry on 429/5xx, mint never retried.

## [0.28.0] - 2026-10-12

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
