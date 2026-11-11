/**
 * `/v1/anon/*` — guest chat without an account (contract: docs/design/anon-chat-contract.md).
 *
 * `challenge()` and `createSession()` need no key: the gateway ignores the
 * bearer on them, so a client built with any placeholder `apiKey` works
 * (e.g. `new Codai({ apiKey: 'guest' })`). The returned `token` (`anon_v1.*`)
 * is then used AS the `apiKey` of a second client for
 * `chat.completions.create(...)` and `anon.status()`. `importChat()` runs on
 * a client built with the NEW account's API key right after sign-up.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, stripUndefined } from './_shared';

export type AnonSurface = 'web' | 'android' | 'ios' | 'desktop' | 'vscode' | 'wear' | 'tv';
export type AnonChallenge = Reply<'anonChallenge'>;
export type AnonSessionRequest = Mutable<Body<'anonCreateSession'>>;
export type AnonSession = Reply<'anonCreateSession'>;
export type AnonStatus = Reply<'anonStatus'>;
export type AnonImportRequest = Mutable<Body<'anonImport'>>;
export type AnonImportResponse = Reply<'anonImport'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

/** Leading zero bits of a lowercase/uppercase hex string. */
function leadingZeroBitsHex(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const n = Number.parseInt(ch, 16);
    if (Number.isNaN(n)) return bits;
    if (n === 0) {
      bits += 4;
      continue;
    }
    return bits + (n >= 8 ? 0 : n >= 4 ? 1 : n >= 2 ? 2 : 3);
  }
  return bits;
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new Error('codai: solvePow needs globalThis.crypto.subtle (Node >= 18 or a browser)');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  let hex = '';
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Solve the guest-session proof-of-work: the smallest decimal counter for which
 * `sha256_hex(`${nonce}:${deviceId}:${counter}`)` has at least `bits` leading
 * zero bits. Returns the counter as a string (`proof.pow.counter`).
 */
export async function solvePow(
  nonce: string,
  deviceId: string,
  bits: number,
  maxTries = 50_000_000,
): Promise<string> {
  for (let i = 0; i < maxTries; i++) {
    const counter = String(i);
    if (leadingZeroBitsHex(await sha256Hex(`${nonce}:${deviceId}:${counter}`)) >= bits)
      return counter;
  }
  throw new Error('codai: proof-of-work not solved within maxTries');
}

export class Anon {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/anon/challenge` — single-use nonce (5 min) + proof-of-work difficulty. No key needed. */
  challenge(surface: AnonSurface, opts: CallOpts = {}): Promise<AnonChallenge> {
    return this.http.json<AnonChallenge>('/v1/anon/challenge', {
      query: { surface },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/anon/session` — exchange the nonce + one proof for a 2-hour
   * guest token. `accept_terms` / `confirm_adult` must be `true` (the user
   * accepted the click-wrap). No key needed.
   */
  createSession(body: AnonSessionRequest, opts: CallOpts = {}): Promise<AnonSession> {
    return this.http.json<AnonSession>('/v1/anon/session', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `GET /v1/anon/status` — sessions/messages left today and whether the
   * daily guest budget is open. Authenticates with the client's `apiKey`,
   * which must be the guest token (`new Codai({ apiKey: session.token })`).
   */
  status(opts: CallOpts = {}): Promise<AnonStatus> {
    return this.http.json<AnonStatus>('/v1/anon/status', { ext: opts.ext, signal: opts.signal });
  }

  /**
   * `POST /v1/anon/import` — store the locally kept guest history as a cloud
   * session of the account. Call on a client built with the NEW account's
   * API key; each guest token imports once (409 `anon_already_imported`).
   */
  importChat(body: AnonImportRequest, opts: CallOpts = {}): Promise<AnonImportResponse> {
    return this.http.json<AnonImportResponse>('/v1/anon/import', {
      method: 'POST',
      body: stripUndefined({
        anon_token: body.anon_token,
        title: body.title,
        messages: body.messages,
      }),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Convenience: challenge → proof-of-work → session (with `accept_terms` and
   * `confirm_adult` set — only call after the user accepted the click-wrap).
   * `deviceId` is a UUID v4 generated once per install and persisted.
   */
  async startGuestSession(
    args: { surface: AnonSurface; deviceId: string },
    opts: CallOpts = {},
  ): Promise<AnonSession> {
    const ch = await this.challenge(args.surface, opts);
    const counter = await solvePow(ch.nonce, args.deviceId, ch.pow_bits);
    return this.createSession(
      {
        surface: args.surface,
        device_id: args.deviceId,
        nonce: ch.nonce,
        accept_terms: true,
        confirm_adult: true,
        proof: { pow: { counter } },
      },
      opts,
    );
  }
}
