# Token Launch Radar (radar-2)

A token launch radar for the make.fun token-radar-01 bounty. It reads the sealed
DefiLlama snapshot, works out which protocols record no token and are not a
wrapped or staked product of one that already trades, ranks them by what their
launch would be worth, and renders a static dashboard with the board, a detail
view per protocol, filters, and a farm plan for every row.

## Run it

Node.js 22.18 or later, standard library only, nothing to install:

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Outputs in `out/`: `board.json` (the ranked board), `data.js` (the dashboard's
dataset, generated from the same board), `dashboard/` (the static page, no
network), `screenshots/`, and `dossier.json` (built with
`vendor/makefun-board.ts`, the kit's library).

## The model

- **Who is ranked.** Every slug on the snapshot's watchlist, plus the early
  radar: pre-token protocols below the $50M watchlist floor that pass the
  wrapped/staked screen (category is not Bridge, Canonical Bridge, Liquid
  Staking, Liquid Restaking, Restaked BTC or CEX; no whole word wrapped,
  staked or staking in the name; no version marker; no exchange name prefix).
  Protocols whose token already trades are never ranked; they are listed
  separately at the market's own market cap.
- **Implied value.** Tokened peers price the base: each category's multiple is
  the median market-cap / TVL of the snapshot's tokened protocols in it,
  shrunk toward the global median by peer count (weight n / (n + 4)) and
  clamped to 0.03..2.50. Then
  `implied = TVL x multiple x growth x maturity x breadth`, with growth from
  the clamped 7-day TVL change (-50%..+100%, weight 0.30), maturity running
  0.72..1.00 over four tracked years, and breadth adding 1.5% per extra
  chain up to six. All inputs come from the snapshot; no name is special-cased.
- **Farm plans.** Six steps per protocol, generated from its category, first
  chain, TVL tier and age: wallet setup, the category's core action with a
  capital size and a per-chain gas estimate, a weekly qualifying action, a
  hold window, a safe points-page check, and a farm log with an exit rule.

An implied value is this entry's own claim from the snapshot's figures. It is
not a prediction that a token will be issued, or when.
