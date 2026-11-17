/**
 * Normalizes champion names from external sources to Data Dragon ids
 * ("Wukong" → "MonkeyKing", "Nunu & Willump" → "Nunu", "Kai'Sa" → "Kaisa").
 */

/** Names whose Data Dragon id is not derivable by stripping punctuation. */
const ALIASES: Record<string, string> = {
  wukong: "MonkeyKing",
  monkeyking: "MonkeyKing",
  nunuwillump: "Nunu",
  nunu: "Nunu",
  renataglasc: "Renata",
  // Data Dragon keeps lowercase letters after the apostrophe for these:
  belveth: "Belveth",
  chogath: "Chogath",
  kaisa: "Kaisa",
  khazix: "Khazix",
  kogmaw: "KogMaw",
  reksai: "RekSai",
  velkoz: "Velkoz",
  ksante: "KSante",
  drmundo: "DrMundo",
  jarvaniv: "JarvanIV",
  leblanc: "Leblanc",
  fiddlesticks: "Fiddlesticks",
};

/** Lowercase, no accents, letters/digits only: "Kai'Sa" → "kaisa". */
export function normalizeChampionKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
}

export interface ChampionIndexEntry {
  id: string;
  key?: string;
  name?: string;
}

/**
 * Lookup built from the Data Dragon list (any locale). Matches by numeric key,
 * id or localized name, so "Wukong", "MonkeyKing" and "62" all resolve.
 */
export class ChampionIndex {
  private byNormalized = new Map<string, string>();
  private byKey = new Map<string, string>();

  constructor(champions: ChampionIndexEntry[]) {
    for (const c of champions) {
      this.byNormalized.set(normalizeChampionKey(c.id), c.id);
      if (c.name) this.byNormalized.set(normalizeChampionKey(c.name), c.id);
      if (c.key) this.byKey.set(String(c.key), c.id);
    }
  }

  resolve(nameOrKey: string | number | undefined | null): string | undefined {
    if (nameOrKey === undefined || nameOrKey === null || nameOrKey === "") return undefined;
    const asString = String(nameOrKey).trim();
    if (/^\d+$/.test(asString)) return this.byKey.get(asString);
    const n = normalizeChampionKey(asString);
    return this.byNormalized.get(n) ?? (ALIASES[n] && this.has(ALIASES[n]) ? ALIASES[n] : undefined);
  }

  has(id: string): boolean {
    return this.byNormalized.get(normalizeChampionKey(id)) === id;
  }
}

/**
 * Converts a champion display name to its Data Dragon id. With an index the
 * result is validated against the real list; without one it falls back to the
 * alias table and to stripping punctuation/spaces in PascalCase.
 */
export function toDDragonId(name: string, index?: ChampionIndex): string | undefined {
  if (index) return index.resolve(name);
  const n = normalizeChampionKey(name);
  if (!n) return undefined;
  if (ALIASES[n]) return ALIASES[n];
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}
