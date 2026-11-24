# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/kerwineaston970-alt/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/kerwineaston970-alt/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol
DefiLlama tracks, finds the ones that still record no token and are not a
wrapped or staked product of one that trades, ranks them by implied launch
value, and shows a reader how to farm each one.

Built for the make.fun bounty **"Build the best token launch radar"**
(token-radar-01). The winning dashboard is featured on make.fun's site.

## How it works

- `main.ts` (Node 22, standard library only) reads the sealed snapshot,
  scores every rankable pre-token protocol with the model in `lib/model.ts`,
  and writes `board.json`, the dashboard's `data.js`, and `dossier.json`.
- The implied value is a comparable-based estimate: each category's
  multiple is calibrated from the live-token protocols that already trade
  in that category (median market-cap-to-TVL ratio, winsorized, shrunk
  toward the global median), then adjusted by seven-day growth, age with
  no token, and chain breadth. See `METHODOLOGY.md` for the full model.
- `dashboard/` is a static page that renders with no network: the board
  (sortable, filterable), a detail view for every protocol with its model
  breakdown, comparables and farm plan, the live-token set, and a model
  sandbox that re-ranks the board live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`
beside it) and take the three screenshots: the board, a protocol's detail
view, and a filtered view.

## Layout

- `main.ts` — the entrypoint
- `lib/model.ts` — the model, the board builder, the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, as shipped in the kit
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — the three screenshots
- `METHODOLOGY.md` — the model, in full
