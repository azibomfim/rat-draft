/**
 * Pure conversion of OP.GG summoner responses into neutral PlayerProfile.
 * Network calls live in ./opgg.ts; this file is unit-tested with fixtures.
 */
import { comfortScore } from "../comfort";
import type { ChampionIndex } from "./champion-id";
import {
  asArray,
  asNumber,
  asObject,
  asString,
  getPath,
  parseOpggText,
  type OpggValue,
} from "./opgg-format";
import type { PlayerChampion, PlayerProfile, Region, RiotId, Role } from "./types";

/** Fields requested from lol_get_summoner_profile (only what we use). */
export const PROFILE_FIELDS = [
  "data.summoner.{game_name,tagline,updated_at}",
  "data.summoner.league_stats[].{game_type,win,lose}",
  "data.summoner.league_stats[].tier_info.{tier,division,lp}",
  "data.summoner.ranked_most_champions.my_champion_stats[].{champion_name,id,play,win,lose}",
  "data.summoner.ranked_most_champions.my_champion_stats[].basic.{kill,death,assist}",
];

/** Fields requested from lol_list_summoner_matches. */
export const MATCH_FIELDS = [
  "data.game_history[].{created_at,game_type}",
  "data.game_history[].participants[].{champion_id,champion_name,position}",
  "data.game_history[].participants[].stats.{kill,death,assist,result}",
];

export const MATCH_LIMIT = 20;

/** Queues on Summoner's Rift that count for form/roles. */
const SR_QUEUES = new Set(["SOLORANKED", "FLEXRANKED", "NORMAL", "NORMAL_DRAFT", "NORMAL_BLIND", "QUICKPLAY", "SWIFTPLAY", "CLASH"]);

const POSITION_TO_ROLE: Record<string, Role> = {
  TOP: "top",
  JUNGLE: "jungle",
  MID: "mid",
  MIDDLE: "mid",
  ADC: "adc",
  BOTTOM: "adc",
  SUPPORT: "support",
  UTILITY: "support",
};

/** A role counts as "main" if it has at least this share of recent games. */
const MAIN_ROLE_MIN_SHARE = 0.25;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecentGame {
  championId?: string;
  role?: Role;
  win: boolean | null;
  kills: number;
  deaths: number;
  assists: number;
  playedAt?: number;
}

const kdaOf = (k: number, d: number, a: number) => Math.round(((k + a) / Math.max(1, d)) * 100) / 100;

const TIER_NAMES_WITHOUT_DIVISION = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const DIVISION_ROMAN = ["", "I", "II", "III", "IV"];

export function parseRecentGames(text: string, index: ChampionIndex): RecentGame[] {
  const root = parseOpggText(text);
  const games: RecentGame[] = [];
  for (const g of asArray(getPath(root, "data.game_history"))) {
    const game = asObject(g);
    if (!game) continue;
    const queue = asString(game.game_type);
    if (queue && !SR_QUEUES.has(queue)) continue;
    // participants is filtered to the target summoner by the tool
    const p = asObject(asArray(game.participants)[0]);
    if (!p) continue;
    const stats = asObject(p.stats);
    const result = asString(stats?.result);
    const created = asString(game.created_at);
    games.push({
      championId: index.resolve(asNumber(p.champion_id) ?? asString(p.champion_name)),
      role: POSITION_TO_ROLE[asString(p.position)?.toUpperCase() ?? ""],
      win: result === "WIN" ? true : result === "LOSE" ? false : null,
      kills: asNumber(stats?.kill) ?? 0,
      deaths: asNumber(stats?.death) ?? 0,
      assists: asNumber(stats?.assist) ?? 0,
      playedAt: created ? Date.parse(created) : undefined,
    });
  }
  return games;
}

interface ProfileOptions {
  riotId: RiotId;
  region: Region;
  index: ChampionIndex;
  /** Raw text of lol_list_summoner_matches; null if that call failed. */
  matchesText: string | null;
  now?: number;
}

export function profileFromOpgg(profileText: string, opts: ProfileOptions): PlayerProfile {
  const now = opts.now ?? Date.now();
  const root = parseOpggText(profileText);
  const summoner = asObject(getPath(root, "data.summoner"));

  // Rank: solo queue, falling back to flex.
  const leagues = asArray(summoner?.league_stats).map(asObject).filter((l): l is Record<string, OpggValue> => !!l);
  const pickLeague = (type: string) =>
    leagues.find((l) => asString(l.game_type) === type && asString(asObject(l.tier_info)?.tier));
  const solo = pickLeague("SOLORANKED");
  const league = solo ?? pickLeague("FLEXRANKED");
  const tierInfo = asObject(league?.tier_info);
  const tier = asString(tierInfo?.tier);
  const divisionNum = asNumber(tierInfo?.division);

  const recent = opts.matchesText ? parseRecentGames(opts.matchesText, opts.index) : [];

  // Per-champion recent info (role and last played).
  interface RecentChamp {
    roles: Map<Role, number>;
    lastPlayedAt?: number;
    games: number;
    wins: number;
    k: number;
    d: number;
    a: number;
  }
  const recentByChamp = new Map<string, RecentChamp>();
  for (const g of recent) {
    if (!g.championId) continue;
    const entry: RecentChamp = recentByChamp.get(g.championId) ?? { roles: new Map(), games: 0, wins: 0, k: 0, d: 0, a: 0 };
    if (g.role) entry.roles.set(g.role, (entry.roles.get(g.role) ?? 0) + 1);
    if (g.playedAt && (!entry.lastPlayedAt || g.playedAt > entry.lastPlayedAt)) entry.lastPlayedAt = g.playedAt;
    entry.games++;
    if (g.win) entry.wins++;
    entry.k += g.kills;
    entry.d += g.deaths;
    entry.a += g.assists;
    recentByChamp.set(g.championId, entry);
  }
  const topRole = (roles: Map<Role, number>) => [...roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const daysAgo = (t?: number) => (t ? Math.max(0, Math.floor((now - t) / DAY_MS)) : undefined);

  // Season pool from ranked stats.
  const champions = new Map<string, PlayerChampion>();
  for (const raw of asArray(getPath(summoner, "ranked_most_champions.my_champion_stats"))) {
    const c = asObject(raw);
    if (!c) continue;
    const championId = opts.index.resolve(asNumber(c.id) ?? asString(c.champion_name));
    const games = asNumber(c.play) ?? 0;
    if (!championId || games <= 0) continue;
    const wins = asNumber(c.win) ?? 0;
    const basic = asObject(c.basic);
    const recentInfo = recentByChamp.get(championId);
    const lastPlayedDaysAgo = daysAgo(recentInfo?.lastPlayedAt);
    champions.set(championId, {
      championId,
      games,
      winRate: wins / games,
      kda: kdaOf(asNumber(basic?.kill) ?? 0, asNumber(basic?.death) ?? 0, asNumber(basic?.assist) ?? 0),
      ...(recentInfo ? { role: topRole(recentInfo.roles) } : {}),
      comfort: comfortScore({ games, wins, lastPlayedDaysAgo }),
      ...(lastPlayedDaysAgo !== undefined ? { lastPlayedDaysAgo } : {}),
    });
  }
  // Champions only seen in recent games (normals, or outside the ranked top list).
  for (const [championId, r] of recentByChamp) {
    if (champions.has(championId)) continue;
    const lastPlayedDaysAgo = daysAgo(r.lastPlayedAt);
    champions.set(championId, {
      championId,
      games: r.games,
      winRate: r.wins / r.games,
      kda: kdaOf(r.k, r.d, r.a),
      role: topRole(r.roles),
      comfort: comfortScore({ games: r.games, wins: r.wins, lastPlayedDaysAgo }),
      ...(lastPlayedDaysAgo !== undefined ? { lastPlayedDaysAgo } : {}),
    });
  }

  // Main roles from recent games.
  const roleCounts = new Map<Role, number>();
  for (const g of recent) if (g.role) roleCounts.set(g.role, (roleCounts.get(g.role) ?? 0) + 1);
  const totalWithRole = [...roleCounts.values()].reduce((s, n) => s + n, 0);
  const mainRoles = [...roleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, n], i) => i === 0 || n / totalWithRole >= MAIN_ROLE_MIN_SHARE)
    .map(([role]) => role);

  const decided = recent.filter((g) => g.win !== null);
  const sum = (f: (g: RecentGame) => number) => decided.reduce((s, g) => s + f(g), 0);

  return {
    riotId: {
      gameName: asString(summoner?.game_name) ?? opts.riotId.gameName,
      tagLine: asString(summoner?.tagline) ?? opts.riotId.tagLine,
    },
    region: opts.region,
    ...(tier
      ? {
          tier,
          ...(divisionNum && !TIER_NAMES_WITHOUT_DIVISION.has(tier) ? { division: DIVISION_ROMAN[divisionNum] } : {}),
          lp: asNumber(tierInfo?.lp),
          queue: league === solo ? ("solo" as const) : ("flex" as const),
          wins: asNumber(league?.win),
          losses: asNumber(league?.lose),
        }
      : {}),
    mainRoles,
    champions: [...champions.values()].sort((a, b) => b.comfort - a.comfort || b.games - a.games),
    recentForm: {
      games: decided.length,
      wins: decided.filter((g) => g.win).length,
      kda: kdaOf(sum((g) => g.kills), sum((g) => g.deaths), sum((g) => g.assists)),
    },
    ...(asString(summoner?.updated_at) ? { sourceUpdatedAt: new Date(asString(summoner?.updated_at)!).toISOString() } : {}),
    fetchedAt: new Date(now).toISOString(),
  };
}
