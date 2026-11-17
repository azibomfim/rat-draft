import { connection } from "next/server";
import type { ReactNode } from "react";
import { getChampions, getLatestVersion } from "@/lib/data/ddragon";
import { ChampionDataProvider, type ChampionDataValue } from "./ChampionData";

/** Loads champion names/version on the server and provides them to client components. */
export async function ChampionDataLoader({ locale, children }: { locale: string; children: ReactNode }) {
  // Request-time data (in-memory TTL cache uses the clock); render inside <Suspense>.
  await connection();
  let value: ChampionDataValue = { version: null, names: {} };
  try {
    const [version, champions] = await Promise.all([getLatestVersion(), getChampions(locale)]);
    value = { version, names: Object.fromEntries(champions.map((c) => [c.id, c.name])) };
  } catch {
    // Data Dragon unavailable: components fall back to ids and placeholders.
  }
  return <ChampionDataProvider value={value}>{children}</ChampionDataProvider>;
}
