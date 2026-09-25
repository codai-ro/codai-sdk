/** `POST /v1/audio/transcriptions` and `POST /v1/audio/speech`. */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply } from './_shared';

export type TranscriptionResponse = Reply<'createTranscription'>;
export type SpeechRequest = Mutable<Body<'createSpeech'>>;

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
    const res = await this.http.request('/v1/audio/speech', {
      body: { ...body, model: body.model ?? 'codai-tts', voice: body.voice ?? 'alloy' },
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
}
