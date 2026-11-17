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
  tier?: string;
  /** Champions that do well AGAINST this one. */
  counters: { championId: string; winRate: number }[];
  goodAgainst: { championId: string; winRate: number }[];
  synergies: { championId: string; winRate: number }[];
}

export interface LaneMatchup {
  role: Role;
  championA: string;
  championB: string;
  winRateA?: number;
  tips: string[];
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
