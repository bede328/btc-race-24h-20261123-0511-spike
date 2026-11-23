[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/bede328/btc-race-24h-20261123-0511-spike/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/bede328/btc-race-24h-20261123-0511-spike/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# BTC Race 24h — Spike-Catcher Dip-Buy Bot

Entry for [make.fun](https://make.fun) competition
`btc-race-24h-20261123-0511`: race a BTC trading bot live for 24 hours.

## Strategy

Long-only, one open position, full-size entries (100% of cash):

- **Early buy** at bar 60 if never bought — the dev window opens higher.
- **Dip-buy rebuys**: bottom 15% of the 60-bar range, on an uptick
  (close > prev close) with a bullish bar (close > open), and only above
  the 240-bar EMA (no falling knives).
- **Exits** (spike rule from the 2nd position on): a fresh 240-bar high
  within the last 60 bars, then a 0.4% reversal off that high while at
  least +1.0% above entry; otherwise take profit +3.5%, trailing stop
  2.0% below the peak, hard stop −0.8%.
- **Cooldown** of 5 bars after a sell fill before the next buy.

Fully deterministic: pure functions of the bars and fixed constants.

## Dev-window result

- Net PnL **+$46.76** (+4.68%), max drawdown 1.58%, 5 trades.
- The entry this replaces (mean-reversion dip-buy) scored +$34.59 on
  the same window.

## Run

```sh
node main.ts   # the harness speaks agent-fun/bars-replay/v1 over stdio
```

`vendor/makefun-bars.ts` is the kit's bot shim, copied byte-for-byte.
