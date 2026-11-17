/** Neutral entry point for champion meta and lane matchups (routes use this, not opgg.ts). */
import { cache, TTL } from "./cache";
import type { ChampionIndex } from "./champion-id";
import { getChampionIndex } from "./champion-index";
import { DataSourceError } from "./errors";
import { fetchOpggChampionAnalysis, fetchOpggLaneMeta, fetchOpggMatchupGuide } from "./opgg";
import {
  championMetaFromOpgg,
  laneMatchupFromGuides,
  laneMetaFromOpgg,
  parseMatchupGuide,
  type MatchupGuide,
} from "./opgg-champion";
import type { ChampionMeta, LaneMatchup, LaneMeta, MatchupTable, Role } from "./types";

function englishName(index: ChampionIndex, id: string): string {
  const name = index.nameOf(id);
  if (!name) throw new DataSourceError("opgg", "not_found", `Unknown champion: ${id}`);
  return name;
}

const tableKey = (role: Role, id: string) => `opgg:table:${role}:${id}`;

/**
 * Guide of A vs B in a role, cached 6 h. Every guide also carries A's full
 * matchup table, which is cached on its own so champion meta can reuse it.
 */
async function getGuide(index: ChampionIndex, role: Role, a: string, b: string): Promise<MatchupGuide> {
  const guide = await cache.getOrLoad(`opgg:guide:${role}:${a}:${b}`, TTL.champion, async () =>
    parseMatchupGuide(await fetchOpggMatchupGuide(role, englishName(index, a), englishName(index, b)), index),
  );
  if (guide.table.size > 0 && cache.get(tableKey(role, a)) === undefined) {
    cache.set(tableKey(role, a), guide.table, TTL.champion);
  }
  return guide;
}

async function getMatchupTable(index: ChampionIndex, role: Role, id: string): Promise<MatchupGuide["table"] | null> {
  const cached = cache.get<MatchupGuide["table"]>(tableKey(role, id));
  if (cached) return cached;
  try {
    // Any opponent returns the same table; the mirror is always valid.
    return (await getGuide(index, role, id, id)).table;
  } catch {
    return null; // counters fall back to the analysis' top 3
  }
}

/** Resolves any champion name/id/key to a Data Dragon id, or null. */
export async function resolveChampionId(input: string): Promise<string | null> {
  return (await getChampionIndex()).resolve(input) ?? null;
}

export async function getChampionMeta(championId: string, role: Role): Promise<ChampionMeta> {
  const index = await getChampionIndex();
  return cache.getOrLoad(`champion:${championId}:${role}`, TTL.champion, async () => {
    const [analysis, table] = await Promise.all([
      fetchOpggChampionAnalysis(englishName(index, championId), role),
      getMatchupTable(index, role, championId),
    ]);
    try {
      return championMetaFromOpgg(analysis, { championId, role, index, table });
    } catch (err) {
      throw new DataSourceError("opgg", "bad_response", `Could not read champion data: ${String(err)}`, { cause: err });
    }
  });
}

export async function getLaneMatchup(role: Role, a: string, b: string): Promise<LaneMatchup> {
  const index = await getChampionIndex();
  return cache.getOrLoad(`matchup:${role}:${a}:${b}`, TTL.champion, async () => {
    const [ab, ba] = await Promise.all([
      getGuide(index, role, a, b),
      getGuide(index, role, b, a).catch(() => null),
    ]);
    return laneMatchupFromGuides(ab, ba, { role, a, b, index });
  });
}

/** Tier list of every role (current patch), cached 6 h. */
export async function getLaneMeta(): Promise<LaneMeta> {
  const index = await getChampionIndex();
  return cache.getOrLoad("opgg:lane-meta", TTL.champion, async () => laneMetaFromOpgg(await fetchOpggLaneMeta(), index));
}

/** Full matchup table of a champion in a role (opponent → games/wins), or null if unavailable. */
export async function getMatchupTableFor(role: Role, championId: string): Promise<MatchupTable | null> {
  const index = await getChampionIndex();
  const table = await getMatchupTable(index, role, championId);
  return table ? Object.fromEntries(table) : null;
}
