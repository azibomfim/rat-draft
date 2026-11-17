/** Server-side: gathers meta and matchup tables for the scorer (cached in the data layer). */
import { getLaneMeta, getMatchupTableFor } from "../data/champions";
import type { DraftSide } from "./types";
import { neededTables, tableKey, type ScoringData, type SimpleBoard, type TeamPool } from "./scoring";

export async function gatherScoringData(
  board: SimpleBoard,
  sides: { side: DraftSide; pool?: TeamPool }[],
): Promise<ScoringData> {
  const wanted = new Map<string, { role: Parameters<typeof getMatchupTableFor>[0]; championId: string }>();
  for (const { side, pool } of sides) {
    for (const t of neededTables(board, side, pool)) wanted.set(tableKey(t.role, t.championId), t);
  }
  const [meta, ...tables] = await Promise.all([
    getLaneMeta(),
    ...[...wanted.values()].map((t) => getMatchupTableFor(t.role, t.championId).catch(() => null)),
  ]);
  const byKey: ScoringData["tables"] = {};
  [...wanted.keys()].forEach((key, i) => {
    const table = tables[i];
    if (table) byKey[key] = table;
  });
  return { meta, tables: byKey };
}
