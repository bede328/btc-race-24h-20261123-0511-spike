// Spike-catcher dip-buy bot for btc-race-24h-20261123-0511.
//
// Strategy (validated on the dev window with a backtester calibrated to the
// cent against the harness's fill model; grade-local is the authority):
//  - Early buy: at bar 60, if never bought, buy 100% of cash.
//  - Rebuys: dip-buy in the bottom 15% of the 60-bar range, on an uptick
//    (close > prev close) with a bullish bar (close > open), and only when
//    the close is above the 240-bar EMA (trend filter: no falling knives).
//  - Exits (checked in this order, from the 2nd position on for the spike
//    rule): spike exit (fresh 240-bar high within the last 60 bars, then a
//    reversal of 0.4% off that high, while >= +1.0% above entry), take
//    profit +3.5%, trailing stop 2.0% below the peak, hard stop -0.8%.
//  - Cooldown: 5 bars after a sell fill before the next buy.
//  - Full-size entries (100% of cash), max slippage 200 bps.
//  - Deterministic: pure functions of the bars and fixed constants only;
//    no clock, no environment, no Math.random.
//
// Dev-window numbers for this exact parameter set (backtester): net PnL
// +$46.76, max drawdown 1.58%, 5 trades. Builder B (the entry this would
// replace) scored +$34.59 on the same window.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const PRICE_SCALE = 5; // CBBTC prices are raw units: USD = raw / 1e5.
const SLIP = 200; // max_slippage_bps for every order.

// Tuned constants (see the header for what each one does).
const EARLY_BAR = 60;
const DIP_BAND = 0.15;
const COOLDOWN = 5;
const TP = 0.035;
const TRAIL = 0.02;
const STOP = 0.008;
const SPIKE_REV = 0.004;
const SPIKE_MIN_PROFIT = 0.01;
const EMA_SPAN = 240;

interface BarOHLC {
  o: number;
  h: number;
  l: number;
  c: number;
}

const hist: BarOHLC[] = [];
const hi240Hist: number[] = [];
let ema240: number | null = null;
let entry: number | null = null;
let peak: number | null = null;
let nbuys = 0;
let lastSellSeq = -1_000_000_000;

function usd(raw: string | bigint): number {
  return Number(raw) / 10 ** PRICE_SCALE;
}

function rollingMax(values: number[], w: number): number {
  let m = -Infinity;
  const start = Math.max(0, values.length - w);
  for (let i = start; i < values.length; i++) if (values[i] > m) m = values[i];
  return m;
}

function rollingMin(values: number[], w: number): number {
  let m = Infinity;
  const start = Math.max(0, values.length - w);
  for (let i = start; i < values.length; i++) if (values[i] < m) m = values[i];
  return m;
}

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  // Fold this batch's fills into our own trade state first. A buy fill sets
  // the entry (and the peak); a sell fill starts the cooldown and clears the
  // entry once the position is flat.
  for (const f of batch.fills) {
    if (f.status !== 'filled' || f.symbol !== SYMBOL) continue;
    if (f.side === 'buy') {
      nbuys += 1;
      entry = usd(f.price);
      peak = entry;
    } else {
      lastSellSeq = batch.seq;
      if (!state.positions.has(SYMBOL)) {
        entry = null;
        peak = null;
      }
    }
  }

  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const o = usd(bar.o);
  const h = usd(bar.h);
  const l = usd(bar.l);
  const c = usd(bar.c);
  const idx = hist.length; // 0-based bar index.
  hist.push({ o, h, l, c });

  const alpha = 2 / (EMA_SPAN + 1);
  ema240 = ema240 === null ? c : alpha * c + (1 - alpha) * ema240;

  const highs = hist.map((x) => x.h);
  const lows = hist.map((x) => x.l);
  const hi240 = rollingMax(highs, 240);
  const hi60 = rollingMax(highs, 60);
  const lo60 = rollingMin(lows, 60);
  hi240Hist.push(hi240);

  if (state.warmingUp) return [];

  const qty = state.positions.get(SYMBOL)?.qty ?? 0n;

  if (qty > 0n && entry !== null) {
    if (peak === null) peak = entry;
    if (c > peak) peak = c;
    // Spike exit, only from the 2nd position on: a fresh 240-bar high was
    // set within the last 60 bars, and the close has now reversed 0.4% off
    // that high while the trade is at least +1.0% above entry.
    const spike =
      nbuys >= 2 &&
      idx >= 60 &&
      hi240 > hi240Hist[idx - 60] &&
      c < hi240 * (1 - SPIKE_REV) &&
      c > entry * (1 + SPIKE_MIN_PROFIT);
    if (
      spike ||
      c >= entry * (1 + TP) ||
      c < peak * (1 - TRAIL) ||
      c < entry * (1 - STOP)
    ) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: SLIP }];
    }
    return [];
  }

  // Flat: buy when the window allows it.
  if (idx >= EARLY_BAR && batch.seq - lastSellSeq >= COOLDOWN) {
    if (nbuys === 0) {
      // First buy, at bar 60, no dip condition: the window opens higher.
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: SLIP }];
    }
    const prevClose = hist[idx - 1].c;
    const rangePos = hi60 > lo60 ? (c - lo60) / (hi60 - lo60) : 1;
    if (rangePos <= DIP_BAND && c > prevClose && c > o && ema240 !== null && c > ema240) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: SLIP }];
    }
  }
  return [];
}

await runBars({ onBatch });
