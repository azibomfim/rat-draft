"use client";

import Image from "next/image";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ChampionIndex } from "@/lib/data/champion-id";

export interface ChampionDataValue {
  /** Data Dragon patch version; null if Data Dragon was unreachable. */
  version: string | null;
  /** Data Dragon id → localized name. */
  names: Record<string, string>;
  /** Data Dragon id → names in every supported language (search and pasted text). */
  searchNames: Record<string, string[]>;
}

const ChampionDataContext = createContext<ChampionDataValue>({ version: null, names: {}, searchNames: {} });

export function ChampionDataProvider({ value, children }: { value: ChampionDataValue; children: ReactNode }) {
  return <ChampionDataContext.Provider value={value}>{children}</ChampionDataContext.Provider>;
}

export function useChampionData(): ChampionDataValue {
  return useContext(ChampionDataContext);
}

export function useChampionName(): (id: string) => string {
  const { names } = useChampionData();
  return (id) => names[id] ?? id;
}

export function ChampionIcon({ id, size = 32 }: { id: string; size?: number }) {
  const { version, names } = useChampionData();
  const name = names[id] ?? id;
  if (!version) {
    return (
      <span
        title={name}
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded bg-black/10 text-[10px] font-bold dark:bg-white/10"
      >
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    <Image
      src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`}
      alt={name}
      title={name}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded"
    />
  );
}

/** Lookup by id, key or any localized name (PT and EN), built once per data set. */
export function useChampionIndex(): ChampionIndex {
  const { searchNames } = useChampionData();
  return useMemo(
    () =>
      new ChampionIndex(
        Object.entries(searchNames).flatMap(([id, names]) => [{ id }, ...names.map((name) => ({ id, name }))]),
      ),
    [searchNames],
  );
}
