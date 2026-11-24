# Token Radar — methodology (radar-2)

The board ranks pre-token protocols by implied launch value: what a token
would be worth if the protocol launched one at the scale its record shows.
It is a model, not a price, and never a prediction that a token is issued.

## What is ranked

The snapshot is the sealed DefiLlama protocol index fetched 2026-11-14
(`input/snapshot.json`, 758 protocols at or above $5,000,000 of TVL).
A protocol is **pre-token** when its record carries no token: no market cap,
no CoinGecko id, no symbol. That is the record, never proof it has none.

The board covers:

- **The whole watchlist (40 protocols):** TVL at or above the $50,000,000
  floor, no token recorded, and not a wrapped, staked or bridged product of
  a token that already trades.
- **Every other rankable pre-token protocol (early rows):** the same
  exclusion rule applied below the floor — no versioned pool names
  (`… V2`, `… 2.0`), no CEX, no Bridge / Canonical Bridge / Liquid Staking /
  Liquid Restaking / Restaked BTC category, no name carrying a whole word
  `wrapped`, `staked` or `staking`, and no name starting with an exchange's
  name. The watchlist is the floor, never the ceiling.

Live-token protocols are set aside and shown with their market caps, never
mixed into the ranking — and they are the comparables the multiples are
calibrated from.

## The model

```
implied = round( tvl_usd
  x category multiple
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + min(chains - 1, 4) x 0.02) )
```

### The multiple: calibrated, not flat

For every category, the live-token protocols that already trade are the
comparables. Their market-cap-to-TVL ratios are winsorized to [0.005, 50]
and the median is the category's raw multiple. A category with few
comparables is shrunk toward the global median (0.1857, the median ratio
across all live protocols), weight `n / (n + 4)`, so one protocol never
decides a category. A category with no comparables uses the global median.
Every multiple is clamped to [0.02, 2.00].

On this snapshot that gives, for example, Dexs ×0.30 (11 comparables),
Lending ×0.14 (15), RWA ×0.25 (9), Risk Curators ×0.74 (1 comparable,
shrunk hard toward the global median), and Onchain Capital Allocator
×0.11 (3). A flat multiple would price a DEX and a capital allocator the
same; the market does not.

### Growth

Seven-day TVL change, clamped to [-60%, +120%], weight 0.5. A protocol
growing fast before any token exists is the early signal this radar exists
to catch; the clamp keeps one viral week (the snapshot's largest 7-day
move is +4448%) from deciding the board. A missing 7-day change counts
as 0%.

### Maturity

Age is the days since DefiLlama first listed the protocol, the best record
of how long it has run with no token: 0.6 at day zero, rising to 1.0 at
three years. An unlisted age uses 365 days. Older protocols have proven
they can hold TVL without a token; younger ones are discounted, not
excluded.

### Chain breadth

One chain is the baseline; each additional chain adds 2%, capped at +8%
for five or more chains. Multi-chain deployment is more surface for users
and for a launch, but it is a small term on purpose.

## The farm plan

Each row carries six steps, all derived from the protocol's own record —
category, chains, TVL, age — never from a hand-written list of names:

1. A fresh wallet, seed phrase kept offline.
2. The category's action (supply, provide liquidity, bridge, stake, mint,
   vote, …) with capital sized by TVL ($50 / $100 / $150 / $250) and gas
   sized by chain (Ethereum mainnet costs more than the rest).
3. One qualifying action a week, worded for the category.
4. Hold 30–60 days (younger protocols longer), so the activity lands in
   more than one snapshot.
5. Claim only from the protocol's own page; never pay to claim, never
   share a seed phrase.
6. Keep a farm log: wallet, dates, every transaction.

## Reproducibility

`main.ts` reads only the sealed snapshot and is deterministic: the same
snapshot always writes the same `board.json`. The dashboard recomputes
every row from the snapshot figures with the same function (`impliedOf`
in `dashboard/app.js`) and says so on the page; the model sandbox lets a
reader move the growth weight, maturity floor, chain step and a multiple
scale and watch the board re-rank live. The sandbox changes only the
page — `board.json` keeps the submitted model.
