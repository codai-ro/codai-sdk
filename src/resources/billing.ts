/**
 * `/v1/billing`, `/v1/billing/invoices`, `/v1/studio/quote` — READ-ONLY billing overview and Studio price quotes.
 *
 * Nothing here starts a payment: plan, top-up and portal actions are browser
 * links in `Billing.links` (open them; the SDK never creates checkout sessions).
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply, type Schema } from './_shared';

export type BillingOverview = Reply<'getBilling'>;
export type BillingPlan = Schema<'BillingPlan'>;
export type BillingWallet = Schema<'BillingWallet'>;
export type BillingAutoTopup = Schema<'BillingAutoTopup'>;
export type BillingPaymentMethod = Schema<'BillingPaymentMethod'>;
export type BillingLinks = Schema<'BillingLinks'>;
export type BillingInvoice = Schema<'BillingInvoice'>;
export type BillingInvoiceList = Reply<'listBillingInvoices'>;
export type StudioQuote = Reply<'getStudioQuote'>;

/** `GET /v1/studio/quote` parameters: `action` picks the price function, the rest are its inputs. */
export interface StudioQuoteQuery {
  action: 'video' | 'music' | 'render' | 'preview' | 'frames' | 'captions' | 'speech' | 'image';
  seconds?: number;
  resolution?: '720p' | '1080p';
  audio?: boolean;
  quality?: 'draft' | 'final';
  pages?: number;
  chars?: number;
  model?: string;
  n?: number;
}

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export interface WatchBalanceOptions {
  /** Call `onLow` when `wallet.balance_eur` drops below this (EUR). */
  thresholdEur: number;
  /** Poll interval (ms). Default 60_000, minimum 1_000. */
  intervalMs?: number;
  /** Stops the watcher (same as calling the returned function). */
  signal?: AbortSignal;
  /**
   * Called once per crossing below the threshold (again only after the
   * balance went back to >= threshold). Read `billing.links.topup` to offer a
   * top-up link; the watcher itself never pays.
   */
  onLow: (balanceEur: number, billing: BillingOverview) => void | Promise<void>;
  /** Called when a poll fails; polling continues. Default: ignore. */
  onError?: (err: unknown) => void;
}

export class Billing {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/billing` — plan, wallet, auto top-up, cards and pay links (read-only). */
  get(opts: CallOpts = {}): Promise<BillingOverview> {
    return this.http.json<BillingOverview>('/v1/billing', { ext: opts.ext, signal: opts.signal });
  }

  /** `GET /v1/billing/invoices` — fiscal invoices and credit notes, newest first. */
  async invoices(query: { limit?: number } = {}, opts: CallOpts = {}): Promise<BillingInvoice[]> {
    const raw = await this.http.json<BillingInvoiceList>('/v1/billing/invoices', {
      query: { limit: query.limit },
      ext: opts.ext,
      signal: opts.signal,
    });
    return [...raw.invoices];
  }

  /**
   * `GET /v1/studio/quote` — what a Studio action costs (USD and wallet EUR micros) and your spendable balance,
   * before you run it. Paid Studio calls answer 402 `insufficient_funds` when `sufficient` is false. Free.
   */
  studioQuote(query: StudioQuoteQuery, opts: CallOpts = {}): Promise<StudioQuote> {
    return this.http.json<StudioQuote>('/v1/studio/quote', {
      // The gateway reads `audio` as the literal `true` / `false` (the client would send 1 / 0 for a boolean).
      query: { ...query, audio: query.audio === undefined ? undefined : String(query.audio) },
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * Poll `get()` every `intervalMs` and call `onLow` once each time the wallet
   * balance crosses below `thresholdEur`. Read-only: never creates a checkout.
   * Returns a function that stops the watcher.
   */
  watchBalance(opts: WatchBalanceOptions): () => void {
    const intervalMs = Math.max(1_000, opts.intervalMs ?? 60_000);
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) stop();
      else opts.signal.addEventListener('abort', stop, { once: true });
    }
    let low = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      if (ctrl.signal.aborted) return;
      try {
        const billing = await this.get({ signal: ctrl.signal });
        const balance = billing.wallet.balance_eur;
        if (balance < opts.thresholdEur) {
          if (!low) {
            low = true;
            await opts.onLow(balance, billing);
          }
        } else low = false;
      } catch (err) {
        if (!ctrl.signal.aborted) opts.onError?.(err);
      }
      if (!ctrl.signal.aborted) timer = setTimeout(() => void tick(), intervalMs);
    };
    ctrl.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    void tick();
    return stop;
  }
}
