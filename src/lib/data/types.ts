/**
 * Source-neutral data types. Nothing outside src/lib/data should know the
 * data comes from OP.GG; pages and logic only use these types.
 */

export const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Platform region code (lowercase), e.g. "br". */
export type Region = string;

export interface RiotId {
  gameName: string;
  tagLine: string;
}

export interface PlayerChampion {
  /** Data Dragon id, e.g. "Ahri". */
  championId: string;
  games: number;
  /** 0–1 */
  winRate: number;
  kda: number;
  role?: Role;
  /** 0–100, see lib/comfort.ts */
  comfort: number;
  /** Days since last played in the recent history; undefined if not seen there. */
  lastPlayedDaysAgo?: number;
}

export interface PlayerProfile {
  riotId: RiotId;
  region: Region;
  tier?: string;
  division?: string;
  lp?: number;
  /** Ranked queue the tier above refers to. */
  queue?: "solo" | "flex";
  wins?: number;
  losses?: number;
  mainRoles: Role[];
  /** Pool, sorted by comfort (desc). */
  champions: PlayerChampion[];
  recentForm: { games: number; wins: number; kda: number };
  /** When the data source last refreshed this profile (may be stale). */
  sourceUpdatedAt?: string;
  fetchedAt: string;
}

export interface ChampionMeta {
  championId: string;
  role: Role;
  winRate: number;
  pickRate: number;
  banRate: number;
  /** Share of this champion's games played in `role` (0–1). */
  roleRate?: number;
  /** Meta tier, "1" (strongest) to "5". */
  tier?: string;
  /** True when the champion is (almost) never played in `role`; rates are then overall. */
  offRole?: boolean;
  /**
   * Champions that do well AGAINST this one in the lane.
   * winRate = the counter's win rate in that matchup.
   */
  counters: MatchupStat[];
  /** Champions this one beats. winRate = this champion's win rate. */
  goodAgainst: MatchupStat[];
  /** Allies that pair well. winRate = win rate of the duo. */
  synergies: { championId: string; winRate: number; role?: Role; games?: number }[];
  fetchedAt: string;
}

export interface MatchupStat {
  championId: string;
  winRate: number;
  games?: number;
}

/** Win rate by game length, e.g. { fromMinute: 25, winRate: 0.52 } = 25–30 min. */
export interface PowerPoint {
  fromMinute: number;
  winRate: number;
}

export type LaneSide = "a" | "b" | "even";
export type PlayStyle = "aggressive" | "even" | "passive";

export interface LaneMatchup {
  role: Role;
  championA: string;
  championB: string;
  /** A's win rate against B in this lane. */
  winRateA?: number;
  /** Sample size behind winRateA. */
  games?: number;
  laneAdvantage?: LaneSide;
  soloKillAdvantage?: LaneSide;
  /** Recommended lane style for A, and for B. */
  playStyleA?: PlayStyle;
  playStyleB?: PlayStyle;
  /** Tips for playing A against B. */
  tips: string[];
  /** Tips for playing B against A. */
  tipsB: string[];
  /** Language of the tips (the source only provides English). */
  tipsLang?: string;
  /** Each champion's win rate by game length (power curve). */
  powerCurve: { a: PowerPoint[]; b: PowerPoint[] };
  fetchedAt: string;
}

/** Serializable error the UI can translate ("Não foi possível buscar X agora"). */
export interface DataErrorInfo {
  source: "opgg" | "ddragon" | "ai";
  code: "timeout" | "network" | "not_found" | "bad_response" | "unavailable";
  message: string;
}

export type PlayerResult =
  | { riotId: RiotId; ok: true; profile: PlayerProfile }
  | { riotId: RiotId; ok: false; error: DataErrorInfo };

/** One champion in a role's meta tier list. */
export interface LaneMetaEntry {
  championId: string;
  role: Role;
  /** 1 (strongest) to 5. */
  tier: number;
  winRate: number;
  pickRate: number;
  banRate: number;
  roleRate: number;
}

export type LaneMeta = Record<Role, LaneMetaEntry[]>;

/** Matchup table of a champion in a role: opponent → games and wins (of the champion). */
export type MatchupTable = Record<string, { games: number; wins: number }>;
