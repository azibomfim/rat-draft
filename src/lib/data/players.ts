/** Neutral entry point for player data (pages/routes use this, not opgg.ts). */
import { cache, TTL } from "./cache";
import { getChampionIndex } from "./champion-index";
import { DataSourceError } from "./errors";
import { fetchOpggPlayerProfile } from "./opgg";
import type { PlayerResult, Region, RiotId } from "./types";

export function getDefaultRegion(): Region {
  return (process.env.DEFAULT_REGION?.trim() || "br").toLowerCase();
}

export async function getPlayer(riotId: RiotId, region: Region, opts: { refresh?: boolean } = {}): Promise<PlayerResult> {
  const key = `player:${region}:${riotId.gameName}#${riotId.tagLine}`.toLocaleLowerCase();
  if (opts.refresh) cache.delete(key);
  try {
    const profile = await cache.getOrLoad(key, TTL.player, async () =>
      fetchOpggPlayerProfile(riotId, region, await getChampionIndex()),
    );
    return { riotId, ok: true, profile };
  } catch (err) {
    const e =
      err instanceof DataSourceError
        ? err
        : new DataSourceError("opgg", "bad_response", err instanceof Error ? err.message : String(err));
    return { riotId, ok: false, error: e.toJSON() };
  }
}

/** Fetches several players in parallel; one failure never affects the others. */
export function getPlayers(riotIds: RiotId[], region: Region, opts: { refresh?: boolean } = {}): Promise<PlayerResult[]> {
  return Promise.all(riotIds.map((id) => getPlayer(id, region, opts)));
}
