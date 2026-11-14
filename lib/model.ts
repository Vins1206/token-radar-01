// Token Launch Radar model (radar-2): one sealed DefiLlama snapshot in, one ranked board out.
//
// Who gets ranked
// ---------------
// A protocol is pre-token when the snapshot records no token for it: market cap, CoinGecko id and
// symbol are all null. The board always carries every slug on the snapshot's watchlist (the floor,
// never a ceiling), then adds the early radar: pre-token protocols below the watchlist floor that
// also pass the wrapped/staked screen below. Protocols whose token already trades are never ranked;
// they are carried separately as the live set, valued by the market itself, and they are the peer
// group the implied values are priced from.
//
// The wrapped / staked screen (applied to early rows; watchlist rows are the house's own list and
// are always carried): category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
// Restaked BTC or CEX; the name carries no whole word wrapped, staked or staking, does not end in a
// version marker (V2, 2.0 and the like) and does not begin with an exchange's name. A wrapped or
// staked product of a token that already trades is not a launch still to come.
//
// What a launch would be worth (implied value)
// --------------------------------------------
// Tokened peers price the base: for each category, take the median market-cap / TVL ratio of the
// snapshot's own tokened protocols in it, shrink it toward the global median by the peer count
// (weight n / (n + 4)), and clamp it to [0.03, 2.50]. A category with no tokened peers prices at
// the global median. Then, per protocol:
//
//   base         = tvl_usd x peer_multiple(category)
//   growthMult   = 1 + 0.30 x clamp(change_7d, -50, +100) / 100   (no reading: 1.00, flagged)
//   maturityMult = 0.72 + 0.28 x min(age_days, 1460) / 1460       (no listing day: 365 days used)
//   breadthMult  = 1 + 0.015 x min(chains - 1, 6)
//   implied      = max(1, round(base x growthMult x maturityMult x breadthMult))
//
// Every figure comes from the snapshot; no protocol name is ever special-cased. Alongside the value
// the board states a readiness score (0-100) so a reader can see why a row sits where it does:
// 40 points for TVL scale (log), 25 for years tracked, 20 for seven-day momentum, 15 for chain
// breadth. Rank is by implied value alone.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it beside the formula. */
export const MODEL_VERSION = 'radar-2';

/** How many early (below-floor) protocols the board adds at most, on top of the watchlist. */
export const EARLY_ROWS = 170;

/** How many live-token protocols the dashboard's live view carries, by market cap. */
export const LIVE_ROWS = 24;

const MULT_FLOOR = 0.03;
const MULT_CAP = 2.5;
const SHRINK_PEERS = 4;
const GROWTH_WEIGHT = 0.3;
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const MATURITY_BASE = 0.72;
const MATURITY_RANGE = 0.28;
const MATURITY_DAYS = 1460;
const UNKNOWN_AGE_DAYS = 365;
const BREADTH_PER_CHAIN = 0.015;
const BREADTH_MAX_CHAINS = 6;
const DAY_MS = 86_400_000;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  readiness: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    growth_pct: number | null;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row (board fields plus its farm plan). */
export interface RadarRow extends BoardRow {}

/** A live-token protocol: already trading, shown at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's peer pricing: how the base multiple for that category was reached. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  category_median: number | null;
  multiple: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  global_median: number;
  scanned_size: number;
  pretoken_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  categories: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from the day DefiLlama began tracking a protocol to the snapshot day; null if unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a pre-token protocol may join the board as an early row (not a wrapped/staked product). */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** Peer pricing for every category, from the snapshot's tokened protocols. */
export function categoryMultiples(snapshot: Snapshot): { globalMedian: number; byCategory: Map<string, CategoryMultiple> } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
  }
  const globalMedian = all.length > 0 ? median(all) : 0.2;
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    const catMedian = median(ratios);
    const blended = (ratios.length * catMedian + SHRINK_PEERS * globalMedian) / (ratios.length + SHRINK_PEERS);
    byCategory.set(category, {
      category,
      peers: ratios.length,
      category_median: round4(catMedian),
      multiple: round4(Math.min(MULT_CAP, Math.max(MULT_FLOOR, blended))),
    });
  }
  return { globalMedian, byCategory };
}

interface Scored {
  implied: number;
  readiness: number;
  peerMultiple: number;
  peerCount: number;
  growthPct: number | null;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
}

/** Score one pre-token protocol: its implied value, its readiness, and every multiplier used. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, peers: CategoryMultiple, globalMedian: number): Scored {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = p.change_7d === null ? null : Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, p.change_7d));
  const growthMult = growthPct === null ? 1 : 1 + GROWTH_WEIGHT * (growthPct / 100);
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_BASE + (Math.min(ageForModel, MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const breadthMult = 1 + BREADTH_PER_CHAIN * Math.min(Math.max(p.chains.length - 1, 0), BREADTH_MAX_CHAINS);
  const implied = Math.max(1, Math.round(p.tvl_usd * peers.multiple * growthMult * maturityMult * breadthMult));
  const scalePts = Math.min(40, Math.max(0, ((Math.log10(Math.max(p.tvl_usd, 1)) - 6.7) / (9.6 - 6.7)) * 40));
  const agePts = (Math.min(ageForModel, MATURITY_DAYS) / MATURITY_DAYS) * 25;
  const momentumPts = growthPct === null ? 10 : 10 + (growthPct / 100) * 10;
  const breadthPts = Math.min(15, Math.max(0, (p.chains.length - 1) * 3));
  const readiness = Math.round(Math.min(100, Math.max(0, scalePts + agePts + Math.min(20, Math.max(0, momentumPts)) + breadthPts)));
  return { implied, readiness, peerMultiple: peers.multiple, peerCount: peers.peers, growthPct, growthMult, maturityMult, breadthMult, age };
}

const GAS_USD: Record<string, number> = {
  Ethereum: 7.5, Arbitrum: 0.35, 'Arbitrum Nova': 0.2, Base: 0.3, Optimism: 0.35, BSC: 0.25, Binance: 0.25,
  Solana: 0.04, Avalanche: 0.45, Polygon: 0.06, zkSync: 0.25, Linea: 0.3, Scroll: 0.3, Mantle: 0.2,
  Sui: 0.05, Aptos: 0.05, Cosmos: 0.1, Bitcoin: 1.2,
};

function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 1;
}

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 300;
  if (tvl >= 1_000_000_000) return 200;
  if (tvl >= 250_000_000) return 120;
  if (tvl >= 50_000_000) return 75;
  return 40;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 540) return 45;
  return 30;
}

/** The category's core farming action, in words a reader can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain}; if you borrow, stay under 40% of the borrow limit so a price swing cannot liquidate you`;
  if (c.includes('dex') || c.includes('aggregator')) return `Trade and provide $${capital} of two-sided liquidity in ${n}'s main pool on ${chain}, and read the impermanent-loss note before you deposit`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${n} and run one small hedged position (long spot, short perp of the same size)`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and keep the receipt token in the same wallet`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then use the bridged funds once inside its app`;
  if (c.includes('rwa')) return `Mint $${capital} of ${n}'s yield-bearing asset on ${chain} and hold it in the farming wallet`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy active for the full term`;
  if (c.includes('payment')) return `Route $${capital} of real payments or transfers through ${n} over the season instead of one large artificial transfer`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Deposit $${capital} into a ${n} vault on ${chain} and keep the vault shares untouched in the farming wallet`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold the balance`;
  if (c.includes('prediction')) return `Fund $${capital} on ${n} and take one researched position in a liquid market, then let it settle`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and keep the position open`;
}

/** A protocol's farm plan: six concrete steps, each with its cost and its time, from its own record. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(chain);
  const gasText = gas < 1 ? `$${gas.toFixed(2)}` : `$${gas.toFixed(2)}`;
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const steps = [
    `Set up one fresh wallet for ${p.name} only, fund it on ${chain}, and reach the app from the protocol's verified profile, never from a search ad. Cost: about ${gasText} of gas for the first transaction. Time: 10 minutes.`,
    `${actionFor(p, capital, chain)}. Cost: $${capital} of capital plus about ${gasText} of gas. Time: 15 minutes to set up.`,
    `Repeat one qualifying action every week (a deposit, a swap, a vote or a claim check) so the wallet shows a season of use, not a single day. Cost: about ${gasText} of gas a week, roughly $${(gas * Math.ceil(hold / 7)).toFixed(2)} across the ${hold}-day hold. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity counts in more than one weekly snapshot, and do not split it across wallets. Cost: the $${capital} stays in the position for ${hold} days. Time: ${hold} days.`,
    `Each Friday, open the protocol's own points or rewards page and claim only from the link that page publishes; never pay anyone to claim for you. Cost: nothing to check, about ${gasText} if a claim is live. Time: 5 minutes a week.`,
    `Keep a farm log with the wallet, dates, amounts and transaction hashes, and set the exit rule now: unwind within a week of any token announcement unless the rules reward holding. Cost: nothing but the log. Time: 5 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

/** The ranked board: every watchlist slug, then the early radar below the floor, by implied value. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { globalMedian, byCategory } = categoryMultiples(snapshot);
  const fallback: CategoryMultiple = { category: 'Uncategorized', peers: 0, category_median: null, multiple: round4(Math.min(MULT_CAP, Math.max(MULT_FLOOR, globalMedian))) };
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);
  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const peers = byCategory.get(p.category ?? 'Uncategorized') ?? fallback;
    return { p, s: scoreProtocol(p, snapshot.as_of, peers, globalMedian) };
  });
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    readiness: s.readiness,
    model: {
      peer_multiple: s.peerMultiple,
      peer_count: s.peerCount,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age),
  }));
}

/** The live-token protocols, by market cap: already launched, so never ranked. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const { globalMedian, byCategory } = categoryMultiples(snapshot);
  const categories = [...byCategory.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    global_median: round4(globalMedian),
    scanned_size: snapshot.protocols.length,
    pretoken_size: snapshot.protocols.filter(isPreToken).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: liveRows(snapshot).length,
    categories,
    rows: board,
    live: liveRows(snapshot),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share one implied value';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
