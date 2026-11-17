/**
 * Pure conversion of OP.GG champion responses into ChampionMeta / LaneMatchup.
 * Network calls live in ./opgg.ts; this file is unit-tested with fixtures.
 *
 * Differences found against the spec (seção 5.2), see docs/opgg-tools.json:
 * - Champion names must be the English display name in UPPER_SNAKE_CASE with
 *   apostrophes removed (WUKONG, KSANTE, NUNU_WILLUMP, DR_MUNDO, KAISA).
 *   lol_get_lane_matchup_guide rejects Data Dragon ids like MONKEY_KING.
 * - lol_get_champion_analysis returns only 3 strong/weak counters, but
 *   lol_get_lane_matchup_guide returns the full matchup table of the
 *   champion in the lane (data.counters, ~50 entries), plus an English tip,
 *   lane advantage and win rate by game length. We use the guide for both.
 * - The guide ignores `lang`: tips are always English.
 * - lol_get_lane_matchup_guide has no desired_output_fields and answers JSON.
 */
import type { ChampionIndex } from "./champion-id";
import { asArray, asNumber, asObject, asString, getPath, parseOpggText, type OpggValue } from "./opgg-format";
import type { ChampionMeta, LaneMatchup, LaneSide, MatchupStat, PlayStyle, PowerPoint, Role } from "./types";
import { ROLES } from "./types";

/** "Kai'Sa" → "KAISA", "Dr. Mundo" → "DR_MUNDO", "Nunu & Willump" → "NUNU_WILLUMP". */
export function toOpggChampionName(englishName: string): string {
  return englishName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/** Fields for lol_get_champion_analysis (synergies only exist for the other roles). */
export function analysisFields(role: Role): string[] {
  return [
    "data.summary.average_stats.{win_rate,pick_rate,ban_rate,tier}",
    "data.summary.positions[].name",
    "data.summary.positions[].stats.{win_rate,pick_rate,ban_rate,role_rate}",
    "data.summary.positions[].stats.tier_data.{tier}",
    "data.strong_counters[].{champion_id,champion_name,win_rate,play}",
    "data.weak_counters[].{champion_id,champion_name,win_rate,play}",
    ...ROLES.filter((r) => r !== role).map(
      (r) => `data.synergies.${r}[].{synergy_champion_id,synergy_champion_name,win_rate,play}`,
    ),
  ];
}

/** Matchups with fewer games than this are ignored for counters. */
export const MIN_MATCHUP_GAMES = 150;
export const MAX_COUNTERS = 8;
export const MAX_SYNERGIES_PER_ROLE = 3;
/** Below this share of games in the role, the champion is "off role". */
export const OFF_ROLE_RATE = 0.03;

const round4 = (x: number) => Math.round(x * 10000) / 10000;

export interface MatchupGuide {
  /** Matchup table of "my" champion in the lane: opponent → games/wins (my wins). */
  table: Map<string, { games: number; wins: number }>;
  opponentTip?: string;
  laneAdvantage?: string;
  soloKillAdvantage?: string;
  playStyle?: PlayStyle;
  powerCurve: PowerPoint[];
}

function toPlayStyle(v: string | undefined): PlayStyle | undefined {
  const s = v?.toLowerCase();
  return s === "aggressive" || s === "even" || s === "passive" ? s : undefined;
}

export function parseMatchupGuide(text: string, index: ChampionIndex): MatchupGuide {
  const root = parseOpggText(text);
  const data = asObject(getPath(root, "data"));
  const table = new Map<string, { games: number; wins: number }>();
  for (const raw of asArray(data?.counters)) {
    const c = asObject(raw);
    const id = index.resolve(asNumber(c?.champion_id) ?? asString(c?.champion_name));
    const games = asNumber(c?.play) ?? 0;
    if (id && games > 0) table.set(id, { games, wins: asNumber(c?.win) ?? 0 });
  }
  const powerCurve: PowerPoint[] = asArray(data?.game_lengths)
    .map(asObject)
    .filter((g): g is Record<string, OpggValue> => !!g)
    .map((g) => ({ fromMinute: asNumber(g.game_length) ?? 0, winRate: round4(asNumber(g.rate) ?? 0) }))
    .filter((p) => p.winRate > 0)
    .sort((a, b) => a.fromMinute - b.fromMinute);
  return {
    table,
    opponentTip: asString(data?.opponent_champion_tip)?.trim() || undefined,
    laneAdvantage: asString(data?.lane_advantage_champion),
    soloKillAdvantage: asString(data?.lane_solo_kill_advantage_champion),
    playStyle: toPlayStyle(asString(data?.recommended_play_style)),
    powerCurve,
  };
}

function countersFromTable(table: MatchupGuide["table"]): { counters: MatchupStat[]; goodAgainst: MatchupStat[] } {
  const rows = [...table.entries()]
    .filter(([, r]) => r.games >= MIN_MATCHUP_GAMES)
    .map(([championId, r]) => ({ championId, myWinRate: r.wins / r.games, games: r.games }));
  const counters = [...rows]
    .sort((a, b) => a.myWinRate - b.myWinRate)
    .slice(0, MAX_COUNTERS)
    .filter((r) => r.myWinRate < 0.5)
    .map((r) => ({ championId: r.championId, winRate: round4(1 - r.myWinRate), games: r.games }));
  const goodAgainst = [...rows]
    .sort((a, b) => b.myWinRate - a.myWinRate)
    .slice(0, MAX_COUNTERS)
    .filter((r) => r.myWinRate > 0.5)
    .map((r) => ({ championId: r.championId, winRate: round4(r.myWinRate), games: r.games }));
  return { counters, goodAgainst };
}

function statsList(v: OpggValue | undefined, index: ChampionIndex): MatchupStat[] {
  return asArray(v)
    .map(asObject)
    .map((c) => {
      const championId = index.resolve(asNumber(c?.champion_id) ?? asString(c?.champion_name));
      const winRate = asNumber(c?.win_rate);
      return championId && winRate !== undefined
        ? { championId, winRate: round4(winRate), ...(asNumber(c?.play) ? { games: asNumber(c?.play) } : {}) }
        : null;
    })
    .filter((x): x is MatchupStat => !!x);
}

interface MetaOptions {
  championId: string;
  role: Role;
  index: ChampionIndex;
  /** Matchup table of the champion in this role (from the guide), if available. */
  table?: MatchupGuide["table"] | null;
  now?: number;
}

export function championMetaFromOpgg(analysisText: string, opts: MetaOptions): ChampionMeta {
  const root = parseOpggText(analysisText);
  const data = asObject(getPath(root, "data"));
  const avg = asObject(getPath(data, "summary.average_stats"));
  const position = asArray(getPath(data, "summary.positions"))
    .map(asObject)
    .find((p) => asString(p?.name)?.toLowerCase() === opts.role);
  const stats = asObject(position?.stats);
  const roleRate = asNumber(stats?.role_rate);
  const offRole = !stats || (roleRate !== undefined && roleRate < OFF_ROLE_RATE);
  const source = stats ?? avg;
  const tier = asNumber(asObject(stats?.tier_data)?.tier) ?? (stats ? undefined : asNumber(avg?.tier));

  // Counters: full lane table when we have it; otherwise OP.GG's top 3.
  // weak_counters.win_rate is the counter's win rate; strong_counters.win_rate is ours.
  const fromTable = opts.table && opts.table.size > 0 ? countersFromTable(opts.table) : null;
  const counters = fromTable?.counters.length ? fromTable.counters : statsList(data?.weak_counters, opts.index);
  const goodAgainst = fromTable?.goodAgainst.length ? fromTable.goodAgainst : statsList(data?.strong_counters, opts.index);

  const synergies: ChampionMeta["synergies"] = [];
  const synergyRoot = asObject(data?.synergies);
  for (const role of ROLES) {
    if (role === opts.role) continue;
    for (const raw of asArray(synergyRoot?.[role]).slice(0, MAX_SYNERGIES_PER_ROLE)) {
      const s = asObject(raw);
      const championId = opts.index.resolve(asNumber(s?.synergy_champion_id) ?? asString(s?.synergy_champion_name));
      const winRate = asNumber(s?.win_rate);
      if (!championId || winRate === undefined) continue;
      synergies.push({ championId, winRate: round4(winRate), role, ...(asNumber(s?.play) ? { games: asNumber(s?.play) } : {}) });
    }
  }
  synergies.sort((a, b) => b.winRate - a.winRate);

  return {
    championId: opts.championId,
    role: opts.role,
    winRate: round4(asNumber(source?.win_rate) ?? 0),
    pickRate: round4(asNumber(source?.pick_rate) ?? 0),
    banRate: round4(asNumber(source?.ban_rate) ?? 0),
    ...(roleRate !== undefined ? { roleRate: round4(roleRate) } : {}),
    ...(tier !== undefined ? { tier: String(tier) } : {}),
    ...(offRole ? { offRole: true } : {}),
    counters,
    goodAgainst,
    synergies,
    fetchedAt: new Date(opts.now ?? Date.now()).toISOString(),
  };
}

function toSide(value: string | undefined, a: string, b: string, index: ChampionIndex): LaneSide | undefined {
  if (!value) return undefined;
  if (/^even$/i.test(value)) return "even";
  const id = index.resolve(value);
  if (id === a) return "a";
  if (id === b) return "b";
  return undefined;
}

interface MatchupOptions {
  role: Role;
  a: string;
  b: string;
  index: ChampionIndex;
  now?: number;
}

/** Builds a LaneMatchup from the guide of A vs B and (optionally) of B vs A. */
export function laneMatchupFromGuides(ab: MatchupGuide, ba: MatchupGuide | null, opts: MatchupOptions): LaneMatchup {
  const rowAB = ab.table.get(opts.b);
  const rowBA = ba?.table.get(opts.a);
  // Prefer A's table; fall back to B's table inverted.
  let winRateA: number | undefined;
  let games: number | undefined;
  if (rowAB && rowAB.games > 0) {
    winRateA = round4(rowAB.wins / rowAB.games);
    games = rowAB.games;
  } else if (rowBA && rowBA.games > 0) {
    winRateA = round4(1 - rowBA.wins / rowBA.games);
    games = rowBA.games;
  }

  return {
    role: opts.role,
    championA: opts.a,
    championB: opts.b,
    ...(winRateA !== undefined ? { winRateA, games } : {}),
    laneAdvantage: toSide(ab.laneAdvantage, opts.a, opts.b, opts.index) ?? toSide(ba?.laneAdvantage, opts.a, opts.b, opts.index),
    soloKillAdvantage:
      toSide(ab.soloKillAdvantage, opts.a, opts.b, opts.index) ?? toSide(ba?.soloKillAdvantage, opts.a, opts.b, opts.index),
    ...(ab.playStyle ? { playStyleA: ab.playStyle } : {}),
    ...(ba?.playStyle ? { playStyleB: ba.playStyle } : {}),
    tips: ab.opponentTip ? [ab.opponentTip] : [],
    tipsB: ba?.opponentTip ? [ba.opponentTip] : [],
    tipsLang: "en",
    powerCurve: { a: ab.powerCurve, b: ba?.powerCurve ?? [] },
    fetchedAt: new Date(opts.now ?? Date.now()).toISOString(),
  };
}
