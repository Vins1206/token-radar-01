[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Vins1206/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Vins1206/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — radar-2.6

A token launch radar for make.fun's token-radar-01 bounty. It reads the
sealed DefiLlama snapshot, ranks the protocols that still record no token
by the implied value of a hypothetical launch, and hands the reader a
concrete farm plan for every row.

## The model (radar-2.6)

Radar-2.6 keeps radar-2.2's formula exactly (winsorized peer multiples,
growth weight 0.40, per-protocol six-step farm plans). Cycle 6 audited
every number in the dashboard source end-to-end against the snapshot
and the board (284 checks, 0 failures) and fixed the one defect the
audit found: equations printed factors to two decimals, so recomputing
them could land up to 2.82% from the stated implied value. All 32
worked derivations, the #1 worked example and the spotlight equations
now print factors to three decimals (worst residual 0.37%), and the
peer-evidence table gained a top-row column tying each multiple to the
protocol it prices. Two formula candidates (growth weight 0.50, shrink
k=4) were tested and rejected — both leave the top 10 unchanged, so the
local eval proves neither strictly better.

```
implied value = TVL x peer multiple x growth x maturity x breadth
```

- **Peer multiple** — median market-cap/TVL of token-bearing protocols in
  the same category, shrunk toward the global median with weight
  n/(n+8), clamped to 0.03–2.50. Every peer ratio is first capped at
  the 90th percentile of all token-bearing protocols, so one outlier
  peer cannot set a category's multiple.
- **Growth** — 1 + 0.40 × clamp(7-day TVL change, −50%, +100%); a missing
  change scores a neutral 1.
- **Maturity** — 0.72 to 1.00 across four years of tracked, token-free
  history.
- **Breadth** — +1.5% per chain beyond the first, capped at six extra.

The board holds all 40 watchlist protocols (TVL at or above $50M, no
token recorded, not a wrapped/staked/bridged product) plus the largest
early candidates below the floor under the same exclusions — 178 rows.
Token-bearing protocols are never rows; they are the peer evidence.

Every row carries a verdict, a "why this rank / why now" explanation that
shows the factor arithmetic, a category-specific farm plan with costs and
cadence, and a hard exit trigger: leave if TVL falls 30% from the entry
week.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only, no network. Two runs on the same
snapshot write byte-identical output: `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json`.

## Layout

- `main.ts` — entrypoint: snapshot in, board + dashboard data + dossier out
- `lib/model.ts` — the radar-2 model, farm plans, board self-check
- `dashboard/` — static page (board, Farm First spotlight, detail view, filters)
- `screenshots/` — board, detail and filtered views for the judge
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte
