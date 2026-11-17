/** Converts team data (Team page / enemy input) into the compact pools the scorer uses. */
import type { PlayerProfile, Role } from "../data/types";
import type { TeamPool } from "./scoring";

/** Champions per player sent to the API (best comfort first). */
export const POOL_MAX_CHAMPIONS = 40;

export function profileToPoolChampions(profile: PlayerProfile): Record<string, number> {
  return Object.fromEntries(
    [...profile.champions]
      .sort((a, b) => b.comfort - a.comfort)
      .slice(0, POOL_MAX_CHAMPIONS)
      .map((c) => [c.championId, c.comfort]),
  );
}

/** Players with a role and a fetched profile → TeamPool. Duplicate roles keep the first player. */
export function toTeamPool(players: { role: Role | null; profile: PlayerProfile | null }[]): TeamPool | undefined {
  const pool: TeamPool = {};
  for (const p of players) {
    if (!p.role || !p.profile || pool[p.role]) continue;
    pool[p.role] = { player: p.profile.riotId.gameName, champions: profileToPoolChampions(p.profile) };
  }
  return Object.keys(pool).length ? pool : undefined;
}
