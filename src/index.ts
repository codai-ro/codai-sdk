/**
 * codai-sdk — official TypeScript client for the codai AI gateway.
 *
 * Full parity with the public gateway OpenAPI (every `operationId` has one
 * method — see `OPERATION_METHODS`). Resources hang off the `Codai` client:
 *
 *   client.chat.completions.create / .stream   client.messages / client.responses
 *   client.embeddings / client.images / client.audio / client.tokens / client.models / client.health
 *   client.music.generate / client.videos.create / .retrieve / .generate (codai Studio, US-only)
 *   client.renders.create / .retrieve / .render (codai Studio HyperFrames → MP4, codai-render)
 *   client.assets.list / .retrieve / .contentUrl / .delete (stored codai Studio assets)
 *   client.sfx.search / .import (codai Studio CC0 sound-effects library, codai-sfx)
 *   client.documents.create / .retrieve / .preview / .retrievePreview / .video / .createPreviewAndWait / .videoAndWait
 *     (codai Studio decks / docs / sheets → PPTX / DOCX / XLSX, codai-docs; previews codai-docs-preview)
 *   client.creatives.create / .retrieve / .outline / .find / .subtree / .edit / .versions / .revert / .fork / .lint
 *     / .compiled / .render / .frame / .frameJob / .comment / .variants / .listVariants / .pickVariant
 *     / .saveTemplate / .exportFcpxml / .exportLottie / .downloadLottie / .fromDocument / .build / .restyle / .captions / .captionsSrt / .captionsVtt
 *     / .adapt / .lintFix / .controls / .locales / .localize / .forkLocale / .createShare / .listShares
 *     / .revokeShare / .review / .requestReview / .resetReview / .reviewThreads / .createReviewThread
 *     / .replyReviewThread / .resolveReviewThread / .reopenReviewThread / .deleteReviewComment / .delete
 *     (codai Studio editable creative documents, ops + version history + A/B variants; free but render, comment,
 *     variants and frames beyond the daily quota)
 *   client.brandKits.create / .update / .exportDtcg / .extract / .list / .retrieve / .delete (codai Studio brand
 *     kits as DTCG tokens, from a web page or a logo; extract is
 *     token-metered, the rest free; apply with creatives.create({ kind, brand_kit_id }))
 *   client.templates.list / .retrieve / .delete (codai Studio templates saved with creatives.saveTemplate plus the 40
 *     built-in starters; free; use with creatives.create({ kind, template, vars }))
 *   client.productions.create / .retrieve / .wait / .run (codai Studio brief → promo video: storyboard, images,
 *     voice-over, editable creative, draft render, one review + repair; billed as the parts are produced)
 *   client.studio.musicRoom.create / .get / .list / .choose / .direct / .quota / .wait (codai Studio Music Room: a team
 *     of role agents writes, plays, sings and mixes a song with three approval gates; free within the plan quota)
 *   client.mediaOps.list / .quote / .run / .job / .wait / .runAndWait (codai Studio media operations on your assets:
 *     background removal, upscale, inpaint / outpaint / erase, stems, denoise, MIDI, mastering, analysis, ACE-Step
 *     music and sound effects; quote held, measured cost billed; async ops return a job)
 *   client.lyrics.write / .align (codai Studio lyrics writer with syllable + rhyme checks; karaoke alignment to a clip
 *     of an audio creative with LRC; token-metered / transcription billed)
 *   client.creatives.renderAudio (mixdown + mastering of an audio creative: WAV / MP3 / FLAC, stems, LRC)
 *   client.jam.connect (WebSocket live jam on Lyria RealTime; not an OpenAPI operation)
 *   client.exports.retrieve / .wait (codai Studio FCPXML exports queued with creatives.exportFcpxml; only newly
 *     rendered seconds are billed; Lottie exports from creatives.exportLottie are free and ready at once)
 *   client.batches.create / .dryRun / .list / .get / .cancel / .retry / .exportCsv / .zip / .wait (codai Studio
 *     batches: one creative per CSV / sheet row; free, row translations and renders billed as usual)
 *   client.shares.get / .remix / .comment / .reply / .resolve / .reopen / .decide (codai Studio share links from the
 *     outside: read a shared creative, remix a view link, comment and decide through a review link; free)
 *   client.voiceRevocations.create (public takedown ticket for a voice cloned in codai Studio; no key needed)
 *   client.voices.addSingingConsent / .revokeSingingConsent (voice passport, beta: your own custom voice singing in
 *     Music Room songs; a separate, revocable consent; free)
 *   client.vault.account / .items / .putItem / .rules / .approvals / .decide / .catalog / .use / .httpCall / .resolve
 *   client.vault.devices.challenge / .enroll / .list / .rename / .revoke (device approval keys, V-27)
 *   client.vault.updateSettings / .lock / .unlockChallenge / .unlock / .limits / .setLimits / .revokeTaskGrants (guards, v4)
 *   client.vault.addRequests.* / .emergency.* / .hibpRange / .rotation / .setRotation / .markRotated / .reportBreaches
 *   client.vault.derivers / .setDeriver / .deleteDeriver / .derive (wave 2: add requests, emergency access, rotation, JIT)
 *   client.vault.members.list / .candidates / .add / .update / .remove / .rotateKey / .setQuorum / .vote
 *     / .simulatePolicy / .receiptKeys (wave 3: org vaults + quorum, policy simulator, signed receipts)
 *     (zero-knowledge credentials vault: ciphertext only; the broker calls never return secret values)
 *   client.abuseReports.create (public DSA notice about a codai Studio share / review link; no key needed)
 *   client.provenance.check (public: which codai AI-provenance marks a file carries; no key needed)
 *   client.systemOne.create / .batch (typed decisions, codai-s1)
 *   client.realtime.connect (WebSocket live STT / voice; not an OpenAPI operation)
 *   client.agents.run + client.agents.runs.*    client.tools.search / .fetch (metered web tools)
 *   client.research.create / .retrieve / .wait / .run (async deep research, cited report)
 *   client.cards.weather / .places / .geocode / .staticMap / .fx / .unfurl (typed card data, `{ block, provenance }`)
 *   client.visualQa.findings / .finding / .claim / .resolve / .comment / .recapture (Visual QA, super_admin keys only)
 *   client.tasks.*                              client.sessions.* (events, controls, lease, shares, stream)
 *   client.devices.* / client.hosts.*           client.orgs.* / client.account / client.receipt
 *   client.settings.get / .update (account-level settings shared by every device)
 *   client.osGate.policy / .recordEvent (OS protection gate: org override policy + override audit events)
 *   client.billing.get / .invoices / .watchBalance (READ-ONLY billing overview; never starts a payment)
 *   client.referrals.get / .redeem / .setConsent (referral stats + invitees; mutations via PATCH /v1/account)
 *   client.anon.challenge / .createSession / .status / .importChat / .startGuestSession (guest chat, no account)
 *   client.usage.get / client.keys.list / .setTags (own usage breakdown + API keys)
 *   client.projects.*                           client.environments.* (members, ports, secrets)
 *   client.sandboxes.create / .list / .retrieve / .exec / .execStream / .files.put / .files.get / .files.list
 *     / .artifacts / .snapshot / .delete / .run (agent sandboxes: isolated gVisor workspaces, no network by default)
 *     / .runCode / .resetKernel / .pause / .resume / .fork / .preview (backend v2, the default; .snapshot is v1 only)
 *   client.verify.agentOutputKey / .agentOutput (EXPERIMENTAL HIDE-signed agent outputs)
 *   client.feedback / client.phoneModels
 *   client.resolve.* (verified bug fixes on https://resolve.codai.ro — resolve.yaml; .list / .iterate page your jobs)
 *
 * Top-level `chat()`, `chatStream()`, `embeddings()`, `models()`, `feedback()`,
 * `mintToken()` from 0.2.x are kept as thin aliases.
 *
 * Zero runtime dependencies; Node 18+ (global fetch) and modern edge runtimes.
 */

import { type CodaiRequestExtensions, HttpClient } from './http';
import { Account, Feedback, PhoneModels, Receipts } from './resources/account';
import { Agents } from './resources/agents';
import { Audio } from './resources/audio';
import { Billing } from './resources/billing';
import { Cards } from './resources/cards';
import { VisualQa } from './resources/visual-qa';
import {
  Chat,
  type ChatCompletionInput,
  type ChatCompletionRequest,
  type ChatMessage,
  type ChatResult,
  type ChatStream,
} from './resources/chat';
import { Devices } from './resources/devices';
import { Embeddings } from './resources/embeddings';
import { Environments } from './resources/environments';
import { Health } from './resources/health';
import { Hosts } from './resources/hosts';
import { Assets } from './resources/assets';
import { Images } from './resources/images';
import { Music, Renders, Videos } from './resources/media';
import { Documents } from './resources/documents';
import { Creatives } from './resources/creatives';
import { BrandKits } from './resources/brand-kits';
import { Templates } from './resources/templates';
import { Productions } from './resources/productions';
import { MusicRoom, type Studio } from './resources/music-room';
import { MediaOps } from './resources/media-ops';
import { LyricsResource } from './resources/lyrics';
import { Jam } from './resources/jam';
import { Exports } from './resources/exports';
import { Batches } from './resources/batches';
import { Shares } from './resources/shares';
import { VoiceRevocations } from './resources/voice-revocations';
import { Voices } from './resources/voices';
import { Vault } from './resources/vault';
import { AbuseReports } from './resources/abuse-reports';
import { Provenance } from './resources/provenance';
import { Messages } from './resources/messages';
import { Models } from './resources/models';
import { Orgs } from './resources/orgs';
import { Projects } from './resources/projects';
import { Realtime } from './resources/realtime';
import { Referrals } from './resources/referrals';
import { Anon } from './resources/anon';
import { Resolve } from './resources/resolve';
import { Responses } from './resources/responses';
import { Sessions } from './resources/sessions';
import { Settings } from './resources/settings';
import { OsGate } from './resources/os-gate';
import { Sfx } from './resources/sfx';
import { SystemOne } from './resources/system-one';
import { Tasks } from './resources/tasks';
import { Notifications, Triggers } from './resources/triggers';
import { Prompts } from './resources/prompts';
import { Heartbeats, Schedules } from './resources/schedules';
import { Lists } from './resources/lists';
import { Feed } from './resources/feed';
import { Memory } from './resources/memory';
import { Sandboxes } from './resources/sandboxes';
import { Transcripts } from './resources/transcripts';
import { type EphemeralScope, type EphemeralToken, Tokens } from './resources/tokens';
import { Tools } from './resources/tools';
import { Research } from './resources/research';
import { Keys, Usage } from './resources/usage-keys';
import { Verify } from './resources/verify';

export interface CodaiClientOptions {
  apiKey: string;
  /** Defaults to https://ai.codai.ro */
  baseUrl?: string;
  /** codai Resolve service host (`client.resolve`). Defaults to https://resolve.codai.ro */
  resolveBaseUrl?: string;
  /** Stable conversation/session id — sent as `x-codai-session-id` on every request. */
  sessionId?: string;
  /** Device UUID for shared-sessions / hosts — sent as `x-codai-device` on every request. */
  device?: string;
  /** Device name / platform recorded on first registration. */
  deviceName?: string;
  devicePlatform?: CodaiRequestExtensions['devicePlatform'];
  /** Client surface tag (`x-codai-client`). */
  client?: string;
  /** Any other default `X-Codai-*` extensions (per-call bags override). */
  defaults?: CodaiRequestExtensions;
  /** Default request timeout (ms). Default 120_000. Streams are not time-capped. */
  timeoutMs?: number;
  /** Retries on 429/5xx with exponential backoff. Default 2. */
  maxRetries?: number;
  /** Injectable fetch (tests / custom agents). */
  fetch?: typeof fetch;
}

/** 0.2.x-compatible chat options (thin alias over `chat.completions`). */
export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ChatCompletionRequest['tools'];
  /** codai extension: plan-and-execute agent mode (Pro+). */
  agentMode?: boolean;
  /** codai extension: server-side context compaction ('auto'). */
  compact?: 'auto';
  /** codai extension: best-of-N override (0 disables, 3 forces). */
  bestOf?: 0 | 3;
  /** Attribution id recorded on tool calls (agent fleets). */
  agentId?: string;
  /** Per-call session override. */
  sessionId?: string;
  /** Any other `X-Codai-*` extension. */
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
}

export interface EmbeddingsOptions {
  input: string | string[];
  model?: string;
  dimensions?: number;
  signal?: AbortSignal;
}

export class Codai {
  readonly http: HttpClient;

  /** Resource group (`chat.completions.create/stream`) that is also callable with the 0.2.x `chat({ messages })` shape. */
  readonly chat: Chat & ((opts: ChatOptions) => Promise<ChatResult>);
  readonly messages: Messages;
  readonly responses: Responses;
  readonly embeddings: Embeddings &
    ((opts: EmbeddingsOptions) => Promise<{ embeddings: number[][]; raw: unknown }>);
  /** Image generation and editing (`images.generate({ prompt })`, `images.edit({ prompt, image })`; codai-image = gemini-3.1-flash-image, EU). */
  readonly images: Images;
  readonly audio: Audio;
  /** codai Studio music (`music.generate({ prompt, lyrics?, model? })`; Lyria 3 clip / pro with vocals, Lyria 2 legacy; US-only). */
  readonly music: Music;
  /** codai Studio video jobs (`videos.generate({ prompt })`; Veo 3.1 Fast, US-only, English prompts). */
  readonly videos: Videos;
  /** codai Studio renders (`renders.render({ html })`; HyperFrames HTML → MP4, codai-render, up to 180 s 1080p). */
  readonly renders: Renders;
  /** Stored codai Studio assets (`assets.list()`, `.retrieve(id)`, `.contentUrl(id)`, `.delete(id)`; 1 h signed URLs, kept 90 days). */
  readonly assets: Assets;
  /** codai Studio CC0 sound effects (`sfx.search({ q })`, `sfx.import(sfxId)` → asset `kind: 'sfx'`; free). */
  readonly sfx: Sfx;
  /** codai Studio documents (`documents.create({ type: 'deck', spec })` → PPTX / DOCX / XLSX, codai-docs, free; previews + deck → MP4). */
  readonly documents: Documents;
  /** codai Studio creatives (`creatives.create({ kind: 'video' })`, `.edit(id, { baseSeq, ops })`, `.render(id)`; editable documents with versions, free except renders). */
  readonly creatives: Creatives;
  /** codai Studio brand kits (`brandKits.extract({ url })` → palette + fonts + logo; apply with `creatives.create({ kind, brand_kit_id })`). */
  readonly brandKits: BrandKits;
  /** codai Studio templates (`creatives.saveTemplate(id, { vars })` saves one; `templates.list()`; create with `creatives.create({ kind, template, vars })`). */
  readonly templates: Templates;
  /** codai Studio productions (`productions.run({ brief, language: 'ro' })` → a finished promo video + editable creative). */
  readonly productions: Productions;
  /**
   * codai Studio namespace. `studio.musicRoom.create({ brief, language: 'ro' })` → a team of role agents makes a song;
   * answer its gates with `studio.musicRoom.choose(id, …)`, poll with `studio.musicRoom.wait(id, { untilGate: true })`.
   */
  readonly studio: Studio;
  /** codai Studio media operations (`mediaOps.run('audio.separate_stems', { assetIds })` → job; `mediaOps.wait(id)`). */
  readonly mediaOps: MediaOps;
  /** codai Studio lyrics (`lyrics.write({ brief, language: 'ro' })`, `lyrics.align({ creative_id, clip_id, lyrics_text })`). */
  readonly lyrics: LyricsResource;
  /** codai Studio live jam over WebSocket (`jam.connect({ token })` → PCM16 48 kHz stereo; `prompts`, `config`, `play`). */
  readonly jam: Jam;
  /** codai Studio FCPXML exports (`creatives.exportFcpxml(id)` queues one; `exports.wait(id)` polls until the zip is ready). */
  readonly exports: Exports;
  /** codai Studio batches (`batches.create({ source: { template_id }, csv })` → one creative per row; `batches.wait(id)`). */
  readonly batches: Batches;
  /** codai Studio share links from the outside (`shares.get(url)`, `shares.remix(url)`, `shares.comment(url, …)`). */
  readonly shares: Shares;
  /** Public takedown tickets for voices cloned in codai Studio (`voiceRevocations.create({ email, … })`; no key needed). */
  readonly voiceRevocations: VoiceRevocations;
  /** codai Studio custom voices: the voice passport singing consent (`voices.addSingingConsent(id, { session_id })`). */
  readonly voices: Voices;
  /** Zero-knowledge credentials vault (`vault.items()`, `vault.use({ handle, mode, action })`, `vault.decide(id, …)`). */
  readonly vault: Vault;
  /** Public abuse reports about codai Studio share / review links (`abuseReports.create({ share_token, … })`; no key needed). */
  readonly abuseReports: AbuseReports;
  /** Public AI-provenance checker (`provenance.check(file)` → C2PA / RIFF INFO / ID3 / MP4 / XMP marks; no key needed). */
  readonly provenance: Provenance;
  /** Typed decisions from codai-s1 (`systemOne.create({ state, questions })`). */
  readonly systemOne: SystemOne;
  readonly tokens: Tokens;
  /** WebSocket realtime sessions (`realtime.connect({ model, language, token })`) — live STT and voice. */
  readonly realtime: Realtime;
  readonly models: Models & (() => Promise<Array<{ id: string }>>);
  readonly health: Health;
  readonly agents: Agents;
  readonly tools: Tools;
  /** Async deep research (`research.run({ question })` → cited report + sources). */
  readonly research: Research;
  /** Typed card data (`cards.weather({ lat, lng })`, `.places({ q })`, `.fx()`, `.unfurl(url)` → `{ block, provenance }`). */
  readonly cards: Cards;
  /** Visual QA findings (`UI-<n>`) and re-captures (`SCR-...`); super_admin keys only. */
  readonly visualQa: VisualQa;
  readonly tasks: Tasks;
  /** Event triggers — webhooks that notify you or start agent sessions. */
  readonly triggers: Triggers;
  /** Inbox of trigger / cloud-task notifications. */
  readonly notifications: Notifications;
  /** Pending prompts — ready-to-paste prompts left for a future chat (handoffs, dated follow-ups). */
  readonly prompts: Prompts;
  /** codai Scheduler — cron / natural-language schedules run on any of your hosts or in the cloud (`schedules.create`, `.executor.claim`). */
  readonly schedules: Schedules;
  /** Lists and the share sheet — save links, text and media to Inbox / Wishlist / Notes or your own lists (`lists.share`). */
  readonly lists: Lists;
  /** Public feed — posts (project / seeking / idea), likes, reports and blocked authors (`feed.create`). */
  readonly feed: Feed;
  /** Heartbeat monitors — dead-man switches for crons codai does not run (`heartbeats.create({ name, period_s })` → `ping_url`). */
  readonly heartbeats: Heartbeats;
  /** Transcripts — voice recordings → diarized transcripts + insights (feature-flagged per account). */
  readonly transcripts: Transcripts;
  /** Your own usage split by day / key / device / app / platform / model / client / tag. */
  readonly usage: Usage;
  /** Your API keys (device attribution, tags). */
  readonly keys: Keys;
  /** Your persistent memory — the same store as the MCP memory tools (`memory.list/search/create/delete`). */
  readonly memory: Memory;
  readonly sessions: Sessions;
  readonly devices: Devices;
  readonly hosts: Hosts;
  readonly orgs: Orgs;
  readonly projects: Projects;
  readonly environments: Environments;
  /** Agent sandboxes (backend v2 by default) — isolated gVisor workspaces: `sandboxes.create/exec/execStream/files/artifacts/run`. */
  readonly sandboxes: Sandboxes;
  /** EXPERIMENTAL (HIDE, unaudited): verify signed agent outputs. Provenance only. */
  readonly verify: Verify;
  readonly account: Account;
  /** Account-level settings shared by every device (`settings.get()`, `settings.update(partial, { version })`). */
  readonly settings: Settings;
  /** OS protection gate: `osGate.policy()` (org override policy) and `osGate.recordEvent(event)` (audit). */
  readonly osGate: OsGate;
  /** READ-ONLY billing: plan, wallet, invoices, `watchBalance` (pay via the returned links, never via the SDK). */
  readonly billing: Billing;
  /** Referral stats and invitees; `redeem(code)` / `setConsent(bool)` go through `PATCH /v1/account`. */
  readonly referrals: Referrals;
  /** Guest chat without an account: challenge → proof → `anon_v1.*` token; `importChat` after sign-up. */
  readonly anon: Anon;
  readonly receipt: Receipts;
  readonly feedback: Feedback &
    ((requestId: string, rating: 1 | -1, comment?: string) => Promise<void>);
  readonly phoneModels: PhoneModels;
  /** codai Resolve — execution-verified bug fixes (separate host, `resolveBaseUrl`). */
  readonly resolve: Resolve;

  constructor(opts: CodaiClientOptions) {
    if (!opts.apiKey) throw new Error('Codai: apiKey is required');
    this.http = new HttpClient({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? 'https://ai.codai.ro',
      timeoutMs: opts.timeoutMs ?? 120_000,
      maxRetries: opts.maxRetries ?? 2,
      fetch: opts.fetch,
      defaults: {
        ...opts.defaults,
        ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
        ...(opts.device ? { device: opts.device } : {}),
        ...(opts.deviceName ? { deviceName: opts.deviceName } : {}),
        ...(opts.devicePlatform ? { devicePlatform: opts.devicePlatform } : {}),
        ...(opts.client ? { client: opts.client } : {}),
      },
    });
    const http = this.http;

    this.messages = new Messages(http);
    this.responses = new Responses(http);
    this.images = new Images(http);
    this.audio = new Audio(http);
    this.music = new Music(http);
    this.videos = new Videos(http);
    this.renders = new Renders(http);
    this.assets = new Assets(http);
    this.sfx = new Sfx(http);
    this.documents = new Documents(http);
    this.creatives = new Creatives(http);
    this.brandKits = new BrandKits(http);
    this.templates = new Templates(http);
    this.productions = new Productions(http);
    this.studio = { musicRoom: new MusicRoom(http) };
    this.mediaOps = new MediaOps(http);
    this.lyrics = new LyricsResource(http);
    this.jam = new Jam({ baseUrl: http.baseUrl, apiKey: opts.apiKey });
    this.exports = new Exports(http);
    this.batches = new Batches(http);
    this.shares = new Shares(http);
    this.voiceRevocations = new VoiceRevocations(http);
    this.voices = new Voices(http);
    this.vault = new Vault(http);
    this.abuseReports = new AbuseReports(http);
    this.provenance = new Provenance(http);
    this.systemOne = new SystemOne(http);
    this.tokens = new Tokens(http);
    this.realtime = new Realtime({ baseUrl: http.baseUrl, apiKey: opts.apiKey });
    this.health = new Health(http);
    this.agents = new Agents(http);
    this.tools = new Tools(http);
    this.research = new Research(http);
    this.cards = new Cards(http);
    this.visualQa = new VisualQa(http);
    this.tasks = new Tasks(http);
    this.triggers = new Triggers(http);
    this.notifications = new Notifications(http);
    this.prompts = new Prompts(http);
    this.schedules = new Schedules(http);
    this.lists = new Lists(http);
    this.feed = new Feed(http);
    this.heartbeats = new Heartbeats(http);
    this.transcripts = new Transcripts(http);
    this.usage = new Usage(http);
    this.keys = new Keys(http);
    this.memory = new Memory(http);
    this.sessions = new Sessions(http);
    this.devices = new Devices(http);
    this.hosts = new Hosts(http);
    this.orgs = new Orgs(http);
    this.projects = new Projects(http);
    this.environments = new Environments(http);
    this.sandboxes = new Sandboxes(http);
    this.verify = new Verify(http);
    this.account = new Account(http);
    this.settings = new Settings(http);
    this.osGate = new OsGate(http);
    this.billing = new Billing(http);
    this.referrals = new Referrals(http);
    this.anon = new Anon(http);
    this.receipt = new Receipts(http);
    this.phoneModels = new PhoneModels(http);
    this.resolve = new Resolve(
      new HttpClient({
        apiKey: opts.apiKey,
        baseUrl: opts.resolveBaseUrl ?? 'https://resolve.codai.ro',
        timeoutMs: opts.timeoutMs ?? 120_000,
        maxRetries: opts.maxRetries ?? 2,
        fetch: opts.fetch,
        defaults: opts.client ? { client: opts.client } : {},
      }),
    );

    // Callable resources keep the 0.2.x top-level signatures working
    // (`client.embeddings({...})`, `client.models()`, `client.feedback(id, 1)`)
    // while also exposing `.create()` / `.list()` / `.submit()`.
    this.chat = callable(new Chat(http), (o: ChatOptions) =>
      this.chat.completions.create(this.legacyBody(o), {
        ext: this.legacyExt(o),
        signal: o.signal,
      }),
    );
    this.embeddings = callable(new Embeddings(http), async (o: EmbeddingsOptions) => {
      const r = await this.embeddings.create(
        { input: o.input, model: o.model, dimensions: o.dimensions },
        { signal: o.signal },
      );
      return { embeddings: r.embeddings, raw: r.raw };
    });
    this.models = callable(new Models(http), async () =>
      (await this.models.list()).map((m) => ({ id: m.id })),
    );
    this.feedback = callable(
      new Feedback(http),
      async (requestId: string, rating: 1 | -1, comment?: string) => {
        await this.feedback.submit({
          event_id: requestId,
          rating,
          ...(comment ? { comment } : {}),
        });
      },
    );
  }

  // ------------------------------------------------- 0.2.x compatibility aliases

  /** Alias of `chat.completions.stream()` with the 0.2.x option names. */
  chatStream(opts: ChatOptions): ChatStream {
    return this.chat.completions.stream(this.legacyBody(opts), {
      ext: this.legacyExt(opts),
      signal: opts.signal,
    });
  }

  /** Alias of `tokens.create()`. */
  mintToken(scope: EphemeralScope, ttlSeconds?: number): Promise<EphemeralToken> {
    return this.tokens.create(scope, ttlSeconds);
  }

  private legacyBody(opts: ChatOptions): ChatCompletionInput {
    return {
      model: opts.model ?? 'codai',
      messages: opts.messages,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.tools ? { tools: opts.tools } : {}),
    };
  }

  private legacyExt(opts: ChatOptions): CodaiRequestExtensions {
    return {
      ...opts.ext,
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts.agentMode ? { mode: 'agent' as const } : {}),
      ...(opts.compact ? { compact: opts.compact } : {}),
      ...(opts.bestOf !== undefined ? { bestOf: opts.bestOf } : {}),
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
    };
  }
}

/**
 * Make an object callable: returns a function that forwards calls to `fn`
 * and carries every own/prototype member of `target` (methods bound).
 */
function callable<T extends object, F extends (...args: never[]) => unknown>(
  target: T,
  fn: F,
): T & F {
  const f = ((...args: Parameters<F>) => fn(...args)) as T & F;
  for (const key of allKeys(target)) {
    const value = (target as Record<string, unknown>)[key];
    Object.defineProperty(f, key, {
      value:
        typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value,
      enumerable: true,
      writable: false,
    });
  }
  return f;
}

function allKeys(obj: object): string[] {
  const keys = new Set<string>();
  let cur: object | null = obj;
  while (cur && cur !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(cur)) if (k !== 'constructor') keys.add(k);
    cur = Object.getPrototypeOf(cur);
  }
  return [...keys];
}

export default Codai;

// ------------------------------------------------------------------ exports
export { CodaiError, HttpClient, extensionHeaders, readSse, frameJson } from './http';
export type { CodaiRequestExtensions, ErrorCode, SseFrame, RequestOptions } from './http';
export { OPERATION_METHODS, STREAMING_OPERATIONS, RESOLVE_OPERATION_METHODS } from './operations';
export type { paths, components, operations } from './generated/gateway';
export type {
  paths as ResolvePaths,
  components as ResolveComponents,
  operations as ResolveOperations,
} from './generated/resolve';

export * from './resources/chat';
export * from './resources/messages';
export * from './resources/responses';
export * from './resources/embeddings';
export * from './resources/images';
export * from './resources/audio';
export * from './resources/media';
export * from './resources/assets';
export * from './resources/sfx';
export * from './resources/documents';
export * from './resources/creatives';
export * from './resources/brand-kits';
export * from './resources/templates';
export * from './resources/productions';
export * from './resources/music-room';
export * from './resources/media-ops';
export * from './resources/lyrics';
export * from './resources/jam';
export * from './resources/exports';
export * from './resources/batches';
export * from './resources/shares';
export * from './resources/voice-revocations';
export * from './resources/voices';
export * from './resources/vault';
export * from './resources/abuse-reports';
export * from './resources/provenance';
export * from './resources/tokens';
export * from './resources/realtime';
export * from './resources/system-one';
export * from './resources/models';
export * from './resources/health';
export * from './resources/agents';
export * from './resources/tools';
export * from './resources/research';
export * from './resources/cards';
export * from './resources/visual-qa';
export * from './resources/tasks';
export * from './resources/triggers';
export * from './resources/prompts';
export * from './resources/schedules';
export * from './resources/lists';
export * from './resources/feed';
export * from './resources/transcripts';
export * from './resources/usage-keys';
export * from './resources/memory';
export * from './resources/sessions';
export * from './resources/devices';
export * from './resources/hosts';
export * from './resources/orgs';
export * from './resources/projects';
export * from './resources/environments';
export * from './resources/sandboxes';
export * from './resources/verify';
export * from './resources/account';
export * from './resources/settings';
export * from './resources/os-gate';
export * from './resources/billing';
export * from './resources/referrals';
export * from './resources/anon';
export * from './resources/resolve';
export * from './resources/apps';
