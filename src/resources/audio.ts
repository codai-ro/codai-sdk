/** `POST /v1/audio/transcriptions`, `POST /v1/audio/speech` and `POST /v1/audio/speech/stream`. */
import { type CodaiRequestExtensions, type HttpClient, frameJson } from '../http';
import { type Body, type Mutable, type Reply, type Schema } from './_shared';

export type TranscriptionResponse = Reply<'createTranscription'>;
export type SpeechRequest = Mutable<Body<'createSpeech'>>;
export type SpeechStreamRequest = Mutable<Body<'createSpeechStream'>>;
/** One word timing of a `speechJson()` result (seconds from the start of the audio). */
export type SpeechWord = Schema<'SpeechWord'>;
/** JSON shape of `POST /v1/audio/speech` when `timestamps` or `store` is true. */
export type SpeechJson = Schema<'SpeechJson'>;

/** One event of `audio.speechStream()` (Azure neural TTS with lip-sync timing). */
export type SpeechStreamEvent =
  | {
      type: 'start';
      model: string;
      voice: string;
      format: 'pcm' | 'mp3';
      content_type: string;
      sample_rate: number;
    }
  /** `delta` is base64; `audio` is the decoded bytes (PCM16 LE mono 24 kHz for `pcm`). */
  | { type: 'audio'; delta: string; audio: Uint8Array }
  /** Azure viseme id (0-21) at `offsetMs` on the audio timeline. */
  | { type: 'viseme'; id: number; offsetMs: number }
  | { type: 'word'; text: string; offsetMs: number; durationMs: number }
  | {
      type: 'done';
      audio_ms: number | null;
      audioBytes: number;
      visemes: number;
      words: number;
    }
  | { type: 'error'; error: { code: string; message: string } };
/** Raw generated event schema (all fields optional). */
export type SpeechStreamEventSchema = Schema<'SpeechStreamEvent'>;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface TranscriptionOptions {
  /** Audio file contents (max 25 MB). */
  file: Blob | Uint8Array | ArrayBuffer;
  /** Filename hint (extension drives format detection). Default `audio.webm`. */
  filename?: string;
  /** Default `codai-transcribe`. */
  model?: string;
  /** ISO-639-1 language hint. */
  language?: string;
  /** Text to guide style or spelling. */
  prompt?: string;
  /** `json` (default) or `verbose_json`. */
  responseFormat?: 'json' | 'verbose_json';
  /** Sampling temperature 0–1. */
  temperature?: number;
  ext?: CodaiRequestExtensions;
  signal?: AbortSignal;
}

export interface TranscriptionResult {
  text: string;
  raw: TranscriptionResponse;
  routedTo: string | null;
  headers: Headers;
}

export interface SpeechResult {
  /** Raw audio bytes in the requested format (mp3 by default). */
  audio: ArrayBuffer;
  /** Upstream `content-type` (`audio/mpeg` when the upstream sent none). */
  contentType: string;
  routedTo: string | null;
  headers: Headers;
}

export interface SpeechJsonResult {
  /** Decoded audio bytes (empty when `store: true` — use `asset.url`). */
  audio: Uint8Array;
  /** Word timings (`timestamps: true`); `null` when not requested or the timing pass failed. */
  words: SpeechWord[] | null;
  /** The stored studio asset (`store: true`), referenceable as `asset:<asset_id>` in renders. */
  asset: SpeechJson['asset'] | null;
  durationSeconds: number;
  /** Upstream cost of the request in micro-USD. */
  costMicroUsd: number | null;
  /** True when `timestamps` was requested but the gateway answered `x-codai-timestamps: unavailable`. */
  timestampsUnavailable: boolean;
  raw: SpeechJson;
  routedTo: string | null;
  headers: Headers;
}

export class Audio {
  constructor(private readonly http: HttpClient) {}

  /** Speech-to-text (multipart upload; never retried). Returns the transcript (0.2.x shape). */
  async transcribe(opts: TranscriptionOptions): Promise<string> {
    return (await this.transcribeDetailed(opts)).text;
  }

  /** Speech-to-text with the raw upstream JSON and routing headers. */
  async transcribeDetailed(opts: TranscriptionOptions): Promise<TranscriptionResult> {
    const form = new FormData();
    const blob = opts.file instanceof Blob ? opts.file : new Blob([opts.file as BlobPart]);
    form.append('file', blob, opts.filename ?? 'audio.webm');
    form.append('model', opts.model ?? 'codai-transcribe');
    if (opts.language) form.append('language', opts.language);
    if (opts.prompt) form.append('prompt', opts.prompt);
    if (opts.responseFormat) form.append('response_format', opts.responseFormat);
    if (opts.temperature !== undefined) form.append('temperature', String(opts.temperature));
    const res = await this.http.request('/v1/audio/transcriptions', {
      method: 'POST',
      rawBody: form,
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as TranscriptionResponse;
    return {
      text: typeof raw.text === 'string' ? raw.text : '',
      raw,
      routedTo: res.headers.get('x-codai-routed-to'),
      headers: res.headers,
    };
  }

  /** Text-to-speech. Returns the raw audio bytes (0.2.x shape); see `speechDetailed()` for headers. */
  async speech(
    body: Omit<SpeechRequest, 'model'> & { model?: string },
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<ArrayBuffer> {
    return (await this.speechDetailed(body, opts)).audio;
  }

  /** Text-to-speech with the upstream `content-type` and routing headers. */
  async speechDetailed(
    body: Omit<SpeechRequest, 'model'> & { model?: string },
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<SpeechResult> {
    const model = body.model ?? 'codai-tts';
    // codai-speech* pick their own default (Aoede / Kore); `alloy` is an Azure voice name.
    const voice = body.voice ?? (model.startsWith('codai-speech') ? undefined : 'alloy');
    const res = await this.http.request('/v1/audio/speech', {
      body: { ...body, model, ...(voice === undefined ? {} : { voice }) },
      ext: opts.ext,
      signal: opts.signal,
    });
    return {
      audio: await res.arrayBuffer(),
      contentType: res.headers.get('content-type') ?? 'audio/mpeg',
      routedTo: res.headers.get('x-codai-routed-to'),
      headers: res.headers,
    };
  }

  /**
   * Text-to-speech with JSON output: per-word timings (`timestamps`, default true here) and/or a stored studio
   * asset (`store`). Works for every speech model; `codai-speech` (Chirp 3 HD) and `codai-speech-expressive`
   * (Gemini TTS, honours `instructions`) speak Romanian natively (`language`, default `ro-RO`).
   */
  async speechJson(
    body: Omit<SpeechRequest, 'model'> & { model?: string },
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): Promise<SpeechJsonResult> {
    const timestamps = body.timestamps ?? (body.store ? undefined : true);
    const res = await this.http.request('/v1/audio/speech', {
      body: {
        ...body,
        model: body.model ?? 'codai-speech',
        ...(timestamps === undefined ? {} : { timestamps }),
      },
      ext: opts.ext,
      signal: opts.signal,
    });
    const raw = (await res.json()) as SpeechJson;
    const cost = raw.cost_micro_usd ?? res.headers.get('x-codai-cost-micro-usd');
    return {
      audio: raw.b64_json ? base64ToBytes(raw.b64_json) : new Uint8Array(0),
      words: raw.words ? [...raw.words] : null,
      asset: raw.asset ?? null,
      durationSeconds: raw.duration_seconds,
      costMicroUsd: cost === null || cost === undefined ? null : Number(cost),
      timestampsUnavailable: res.headers.get('x-codai-timestamps') === 'unavailable',
      raw,
      routedTo: res.headers.get('x-codai-routed-to'),
      headers: res.headers,
    };
  }

  /**
   * Streaming neural TTS with visemes + word boundaries (`codai-tts-ro`, Azure AI Speech).
   * Yields `start`, then `audio` / `viseme` / `word` in synthesis order, then `done` (or `error`).
   * Voices: `alina` (default), `emil`, or any Azure neural voice name. Default format `pcm`
   * (PCM16 mono 24 kHz). Works with an ephemeral token of scope `audio` or `live`.
   */
  async *speechStream(
    body: SpeechStreamRequest,
    opts: { ext?: CodaiRequestExtensions; signal?: AbortSignal } = {},
  ): AsyncGenerator<SpeechStreamEvent, void, undefined> {
    const frames = this.http.sse('/v1/audio/speech/stream', {
      body: { ...body, model: body.model ?? 'codai-tts-ro' },
      ext: opts.ext,
      signal: opts.signal,
    });
    for await (const frame of frames) {
      const data = frameJson<Record<string, unknown>>(frame);
      if (!data || typeof data.type !== 'string') continue;
      if (data.type === 'audio' && typeof data.delta === 'string') {
        yield { type: 'audio', delta: data.delta, audio: base64ToBytes(data.delta) };
        continue;
      }
      yield data as SpeechStreamEvent;
      if (data.type === 'done' || data.type === 'error') return;
    }
  }
}
