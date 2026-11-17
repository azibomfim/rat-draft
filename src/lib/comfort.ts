/**
 * Comfort score (0–100) of a player on a champion (seção 8.1).
 *
 *   comfort = 100 × (W_VOLUME·volume + W_WINRATE·winRate + W_RECENCY·recency)
 *
 * - volume:  log(1 + games) / log(1 + FULL_GAMES), capped at 1.
 *            Diminishing returns: 5 games ≈ 0.46, 15 ≈ 0.70, 50+ = 1.
 * - winRate: win rate shrunk towards 50% with PRIOR_GAMES virtual games
 *            ((wins + 0.5·PRIOR) / (games + PRIOR)), then mapped linearly
 *            from WR_FLOOR (→0) to WR_CEIL (→1). A 3/3 record counts as ~69%,
 *            not 100%.
 * - recency: exp(−days / RECENCY_HALF_LIFE_DAYS · ln2) when the champion
 *            appears in the recent match history; UNKNOWN_RECENCY otherwise
 *            (it was played this season, but not lately).
 */
export const COMFORT = {
  W_VOLUME: 0.5,
  W_WINRATE: 0.3,
  W_RECENCY: 0.2,
  FULL_GAMES: 50,
  PRIOR_GAMES: 5,
  WR_FLOOR: 0.4,
  WR_CEIL: 0.65,
  RECENCY_HALF_LIFE_DAYS: 14,
  UNKNOWN_RECENCY: 0.25,
} as const;

export interface ComfortInput {
  games: number;
  wins: number;
  /** Days since the champion was last played; undefined if unknown. */
  lastPlayedDaysAgo?: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function volumeScore(games: number): number {
  if (games <= 0) return 0;
  return clamp01(Math.log(1 + games) / Math.log(1 + COMFORT.FULL_GAMES));
}

export function adjustedWinRate(wins: number, games: number): number {
  return (wins + 0.5 * COMFORT.PRIOR_GAMES) / (Math.max(0, games) + COMFORT.PRIOR_GAMES);
}

export function winRateScore(wins: number, games: number): number {
  return clamp01((adjustedWinRate(wins, games) - COMFORT.WR_FLOOR) / (COMFORT.WR_CEIL - COMFORT.WR_FLOOR));
}

export function recencyScore(lastPlayedDaysAgo?: number): number {
  if (lastPlayedDaysAgo === undefined || !Number.isFinite(lastPlayedDaysAgo)) return COMFORT.UNKNOWN_RECENCY;
  const days = Math.max(0, lastPlayedDaysAgo);
  return Math.exp((-days / COMFORT.RECENCY_HALF_LIFE_DAYS) * Math.LN2);
}

export function comfortScore({ games, wins, lastPlayedDaysAgo }: ComfortInput): number {
  if (games <= 0) return 0;
  const score =
    COMFORT.W_VOLUME * volumeScore(games) +
    COMFORT.W_WINRATE * winRateScore(wins, games) +
    COMFORT.W_RECENCY * recencyScore(lastPlayedDaysAgo);
  return Math.round(100 * clamp01(score));
}
