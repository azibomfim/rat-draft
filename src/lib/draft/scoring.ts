/**
 * Deterministic draft suggestions (seção 8.2). Pure: all data (meta, matchup
 * tables, player pools) comes in, scored suggestions come out. The AI only
 * writes optional explanations on top of this.
 *
 * Pick score  = comfort·W_COMFORT + meta·W_META (or just meta without a team)
 *             + counter (lane matchup vs the enemy laner, ±20) + fit (−10…+20)
 * Ban score   = meta·W + enemy comfort·W + threat to your picks/pool + enemy fit
 *             + ban-rate bonus
 */
import { fitScore, type FitReason } from "../comp/fit";
import { getAttributes } from "../comp/attributes";
import type { CompPick } from "../comp/analyze";
import { ROLES, type LaneMeta, type LaneMetaEntry, type MatchupTable, type Role } from "../data/types";
import { otherSide, type DraftSide } from "./types";

export type CoachStyle = "meta" | "counter" | "balanced";

export interface PoolPlayer {
  /** Display name (Riot ID game name). */
  player: string;
  /** Data Dragon id → comfort 0–100. */
  champions: Record<string, number>;
}

/** Players of a team by role (from the Team page or the enemy team input). */
export type TeamPool = Partial<Record<Role, PoolPlayer>>;

export interface BoardSide {
  bans: string[];
  picks: { championId: string; role: Role }[];
}

export type SimpleBoard = Record<DraftSide, BoardSide>;

export interface ScoringData {
  meta: LaneMeta;
  /** `${role}:${championId}` → that champion's matchup table in that role. */
  tables: Record<string, MatchupTable>;
}

export const tableKey = (role: Role, championId: string) => `${role}:${championId}`;

/* ------------------------------------------------------------------ */

export const WEIGHTS: Record<CoachStyle, { comfort: number; meta: number; counter: number; fit: number; banThreat: number; banComfort: number; banMeta: number }> = {
  balanced: { comfort: 0.5, meta: 0.5, counter: 1, fit: 1, banThreat: 1, banComfort: 0.45, banMeta: 0.35 },
  meta: { comfort: 0.3, meta: 0.7, counter: 0.5, fit: 0.8, banThreat: 0.6, banComfort: 0.35, banMeta: 0.55 },
  counter: { comfort: 0.4, meta: 0.6, counter: 2, fit: 1, banThreat: 1.5, banComfort: 0.6, banMeta: 0.25 },
};

export const SCORING = {
  /** Meta score by tier (1–5); champions not in the role's list get NOT_IN_META. */
  TIER_SCORE: { 1: 90, 2: 75, 3: 60, 4: 45, 5: 30 } as Record<number, number>,
  NOT_IN_META: 20,
  /** Win-rate adjustment to the meta score: (wr − 0.5) × this, capped at ±10. */
  META_WR_FACTOR: 200,
  /** Counter points: (lane wr − 0.5) × this, capped at ±COUNTER_CAP. */
  COUNTER_FACTOR: 300,
  COUNTER_CAP: 20,
  /** Virtual games at 50% to shrink small matchup samples. */
  MATCHUP_PRIOR_GAMES: 50,
  MIN_MATCHUP_GAMES: 30,
  PICKS_PER_ROLE: 5,
  BANS: 5,
  /** Ban candidates: top N meta champions per open enemy role. */
  BAN_META_PER_ROLE: 8,
  /** Enemy pool champions considered from this comfort on. */
  BAN_MIN_COMFORT: 50,
  /** Your champions whose counters count as threats, from this comfort on. */
  THREAT_MIN_COMFORT: 60,
  THREAT_CAP: 25,
  BAN_RATE_FACTOR: 40,
  HIGH_BAN_RATE: 0.1,
};

export type PickReason =
  | { code: "comfort"; player: string; comfort: number }
  | { code: "meta"; tier: number }
  | { code: "counters"; championId: string; winRate: number }
  | { code: "countered"; championId: string; winRate: number }
  | FitReason;

export interface PickSuggestion {
  championId: string;
  role: Role;
  total: number;
  parts: { comfort: number | null; meta: number; counter: number; fit: number };
  reasons: PickReason[];
}

export type BanReason =
  | { code: "meta"; tier: number; role: Role }
  | { code: "enemy_comfort"; player: string; comfort: number }
  | { code: "counters_yours"; championId: string; winRate: number }
  | { code: "fits_enemy" }
  | { code: "high_ban_rate"; banRate: number };

export interface BanSuggestion {
  championId: string;
  /** Role the threat is for. */
  role: Role;
  total: number;
  reasons: BanReason[];
}

/* ------------------------------------------------------------------ */

export function usedChampions(board: SimpleBoard): Set<string> {
  const used = new Set<string>();
  for (const side of ["blue", "red"] as const) {
    board[side].bans.forEach((b) => used.add(b));
    board[side].picks.forEach((p) => used.add(p.championId));
  }
  return used;
}

export function openRolesOf(board: SimpleBoard, side: DraftSide): Role[] {
  const taken = new Set(board[side].picks.map((p) => p.role));
  return ROLES.filter((r) => !taken.has(r));
}

function metaEntry(meta: LaneMeta, role: Role, id: string): LaneMetaEntry | undefined {
  return meta[role]?.find((m) => m.championId === id);
}

export function metaScore(entry: LaneMetaEntry | undefined): number {
  if (!entry) return SCORING.NOT_IN_META;
  const base = SCORING.TIER_SCORE[entry.tier] ?? SCORING.NOT_IN_META;
  const adj = Math.max(-10, Math.min(10, (entry.winRate - 0.5) * SCORING.META_WR_FACTOR));
  return Math.round(Math.max(0, Math.min(100, base + adj)));
}

/** Win rate of `champion` against `opponent` in a role, from the opponent's table (shrunk to 50%). */
export function laneWinRate(data: ScoringData, role: Role, champion: string, opponent: string): number | null {
  const fromOpponent = data.tables[tableKey(role, opponent)]?.[champion];
  if (fromOpponent && fromOpponent.games >= SCORING.MIN_MATCHUP_GAMES) {
    const champWins = fromOpponent.games - fromOpponent.wins;
    return (champWins + SCORING.MATCHUP_PRIOR_GAMES * 0.5) / (fromOpponent.games + SCORING.MATCHUP_PRIOR_GAMES);
  }
  const fromChampion = data.tables[tableKey(role, champion)]?.[opponent];
  if (fromChampion && fromChampion.games >= SCORING.MIN_MATCHUP_GAMES) {
    return (fromChampion.wins + SCORING.MATCHUP_PRIOR_GAMES * 0.5) / (fromChampion.games + SCORING.MATCHUP_PRIOR_GAMES);
  }
  return null;
}

const counterPoints = (wr: number) =>
  Math.round(Math.max(-SCORING.COUNTER_CAP, Math.min(SCORING.COUNTER_CAP, (wr - 0.5) * SCORING.COUNTER_FACTOR)));

/** Champions worth considering for a role: meta list + the player's pool, minus used/off-role. */
function pickCandidates(data: ScoringData, role: Role, pool: PoolPlayer | undefined, used: Set<string>): string[] {
  const ids = new Set<string>(data.meta[role]?.map((m) => m.championId) ?? []);
  for (const id of Object.keys(pool?.champions ?? {})) {
    if (getAttributes(id)?.roles.includes(role) || metaEntry(data.meta, role, id)) ids.add(id);
  }
  return [...ids].filter((id) => !used.has(id));
}

/** Pick suggestions for `side`, per open role. */
export function suggestPicks(
  data: ScoringData,
  board: SimpleBoard,
  side: DraftSide,
  ownPool?: TeamPool,
  style: CoachStyle = "balanced",
): Partial<Record<Role, PickSuggestion[]>> {
  const w = WEIGHTS[style];
  const used = usedChampions(board);
  const team: CompPick[] = board[side].picks.map((p) => ({ championId: p.championId, role: p.role }));
  const enemy = board[otherSide(side)];
  const result: Partial<Record<Role, PickSuggestion[]>> = {};

  for (const role of openRolesOf(board, side)) {
    const pool = ownPool?.[role];
    const laner = enemy.picks.find((p) => p.role === role)?.championId;
    const scored = pickCandidates(data, role, pool, used).map((id): PickSuggestion => {
      const reasons: PickReason[] = [];
      const entry = metaEntry(data.meta, role, id);
      const meta = metaScore(entry);
      if (entry && entry.tier <= 2) reasons.push({ code: "meta", tier: entry.tier });

      const comfort = pool ? (pool.champions[id] ?? 0) : null;
      if (pool && comfort !== null && comfort >= 45) reasons.push({ code: "comfort", player: pool.player, comfort });

      let counter = 0;
      if (laner) {
        const wr = laneWinRate(data, role, id, laner);
        if (wr !== null) {
          counter = Math.round(counterPoints(wr) * w.counter);
          if (counter >= 5) reasons.push({ code: "counters", championId: laner, winRate: wr });
          if (counter <= -5) reasons.push({ code: "countered", championId: laner, winRate: wr });
        }
      }

      const fit = fitScore(team, id, role);
      reasons.push(...fit.reasons);
      const fitPts = Math.round(fit.points * w.fit);

      const base = comfort !== null ? w.comfort * comfort + w.meta * meta : meta;
      return {
        championId: id,
        role,
        total: Math.round(base + counter + fitPts),
        parts: { comfort, meta, counter, fit: fitPts },
        reasons,
      };
    });
    result[role] = scored.sort((a, b) => b.total - a.total || a.championId.localeCompare(b.championId)).slice(0, SCORING.PICKS_PER_ROLE);
  }
  return result;
}

/** Ban suggestions for `side` (banning against the other side). */
export function suggestBans(
  data: ScoringData,
  board: SimpleBoard,
  side: DraftSide,
  ownPool?: TeamPool,
  enemyPool?: TeamPool,
  style: CoachStyle = "balanced",
): BanSuggestion[] {
  const w = WEIGHTS[style];
  const used = usedChampions(board);
  const enemySide = otherSide(side);
  const enemyRoles = openRolesOf(board, enemySide);
  const enemyTeam: CompPick[] = board[enemySide].picks.map((p) => ({ championId: p.championId, role: p.role }));

  // Candidate → best role it threatens.
  const candidates = new Map<string, Role>();
  for (const role of enemyRoles) {
    const top = [...(data.meta[role] ?? [])]
      .sort((a, b) => a.tier - b.tier || b.winRate + b.banRate - (a.winRate + a.banRate))
      .slice(0, SCORING.BAN_META_PER_ROLE);
    for (const m of top) if (!candidates.has(m.championId)) candidates.set(m.championId, role);
    for (const [id, comfort] of Object.entries(enemyPool?.[role]?.champions ?? {})) {
      if (comfort >= SCORING.BAN_MIN_COMFORT && !candidates.has(id)) candidates.set(id, role);
    }
  }

  // Your champions to protect: picks already made + top comfort per open role.
  const protect: { role: Role; championId: string; weight: number }[] = board[side].picks.map((p) => ({
    role: p.role,
    championId: p.championId,
    weight: 1,
  }));
  for (const role of openRolesOf(board, side)) {
    const pool = ownPool?.[role];
    if (!pool) continue;
    const best = Object.entries(pool.champions)
      .filter(([id, c]) => c >= SCORING.THREAT_MIN_COMFORT && !used.has(id))
      .sort((a, b) => b[1] - a[1])[0];
    if (best) protect.push({ role, championId: best[0], weight: best[1] / 100 });
  }
  // Their counters become candidates too.
  for (const p of protect) {
    const table = data.tables[tableKey(p.role, p.championId)];
    if (!table) continue;
    for (const [opp, row] of Object.entries(table)) {
      if (row.games >= 300 && row.wins / row.games < 0.47 && !candidates.has(opp)) candidates.set(opp, p.role);
    }
  }

  const scored: BanSuggestion[] = [];
  for (const [id, role] of candidates) {
    if (used.has(id)) continue;
    const reasons: BanReason[] = [];
    const entry = metaEntry(data.meta, role, id);
    const meta = metaScore(entry);
    if (entry && entry.tier <= 2) reasons.push({ code: "meta", tier: entry.tier, role });

    let enemyComfort = 0;
    for (const r of enemyRoles) {
      const player = enemyPool?.[r];
      const c = player?.champions[id];
      if (player && c !== undefined && c > enemyComfort) {
        enemyComfort = c;
        if (c >= SCORING.BAN_MIN_COMFORT) {
          const existing = reasons.findIndex((x) => x.code === "enemy_comfort");
          if (existing >= 0) reasons.splice(existing, 1);
          reasons.push({ code: "enemy_comfort", player: player.player, comfort: c });
        }
      }
    }

    let threat = 0;
    for (const p of protect) {
      const wr = laneWinRate(data, p.role, id, p.championId);
      if (wr === null || wr <= 0.5) continue;
      const pts = (wr - 0.5) * SCORING.COUNTER_FACTOR * p.weight;
      if (pts > threat) {
        threat = pts;
        const existing = reasons.findIndex((x) => x.code === "counters_yours");
        if (existing >= 0) reasons.splice(existing, 1);
        if (pts >= 4) reasons.push({ code: "counters_yours", championId: p.championId, winRate: wr });
      }
    }
    threat = Math.min(SCORING.THREAT_CAP, threat) * w.banThreat;

    const fit = enemyTeam.length ? fitScore(enemyTeam, id, role).points : 0;
    if (fit >= 8) reasons.push({ code: "fits_enemy" });
    const banRate = entry?.banRate ?? 0;
    if (banRate >= SCORING.HIGH_BAN_RATE) reasons.push({ code: "high_ban_rate", banRate });

    const total = w.banMeta * meta + w.banComfort * enemyComfort + threat + 0.5 * Math.max(0, fit) + banRate * SCORING.BAN_RATE_FACTOR;
    scored.push({ championId: id, role, total: Math.round(total), reasons });
  }
  return scored.sort((a, b) => b.total - a.total || a.championId.localeCompare(b.championId)).slice(0, SCORING.BANS);
}

/** Matchup tables the scorer can use for this board (enemy laners, your picks and pool). */
export function neededTables(board: SimpleBoard, side: DraftSide, ownPool?: TeamPool): { role: Role; championId: string }[] {
  const out = new Map<string, { role: Role; championId: string }>();
  const add = (role: Role, championId: string) => out.set(tableKey(role, championId), { role, championId });
  for (const p of board[otherSide(side)].picks) add(p.role, p.championId);
  for (const p of board[side].picks) add(p.role, p.championId);
  const used = usedChampions(board);
  for (const role of openRolesOf(board, side)) {
    const best = Object.entries(ownPool?.[role]?.champions ?? {})
      .filter(([id, c]) => c >= SCORING.THREAT_MIN_COMFORT && !used.has(id))
      .sort((a, b) => b[1] - a[1])[0];
    if (best) add(role, best[0]);
  }
  return [...out.values()];
}
