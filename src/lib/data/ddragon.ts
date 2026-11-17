/** Riot Data Dragon: versions, champion list and image URLs. */
import { cache, TTL } from "./cache";
import { DataSourceError, withTimeout } from "./errors";

const BASE = "https://ddragon.leagueoflegends.com";

export type DDragonLanguage = "pt_BR" | "en_US";

export interface DDragonChampion {
  /** Data Dragon id, e.g. "MonkeyKing". */
  id: string;
  /** Numeric key as string, e.g. "62". */
  key: string;
  /** Localized display name, e.g. "Wukong". */
  name: string;
  title: string;
  tags: string[];
}

export function toDDragonLanguage(locale: string): DDragonLanguage {
  return locale === "en" ? "en_US" : "pt_BR";
}

export function championIconUrl(version: string, championId: string): string {
  return `${BASE}/cdn/${version}/img/champion/${championId}.png`;
}

export function championSplashUrl(championId: string, skin = 0): string {
  return `${BASE}/cdn/img/champion/splash/${championId}_${skin}.jpg`;
}

export function championLoadingUrl(championId: string, skin = 0): string {
  return `${BASE}/cdn/img/champion/loading/${championId}_${skin}.jpg`;
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await withTimeout(fetch(url, { cache: "no-store" }), "ddragon");
  } catch (err) {
    if (err instanceof DataSourceError) throw err;
    throw new DataSourceError("ddragon", "network", `Data Dragon request failed: ${url}`, { cause: err });
  }
  if (!res.ok) {
    throw new DataSourceError(
      "ddragon",
      res.status === 404 ? "not_found" : "bad_response",
      `Data Dragon ${res.status} for ${url}`,
    );
  }
  return (await res.json()) as T;
}

/** Latest live patch version, e.g. "15.22.1". */
export function getLatestVersion(): Promise<string> {
  return cache.getOrLoad("ddragon:version", TTL.ddragon, async () => {
    const versions = await fetchJson<string[]>(`${BASE}/api/versions.json`);
    if (!versions.length) throw new DataSourceError("ddragon", "bad_response", "Empty versions list");
    return versions[0];
  });
}

interface ChampionListResponse {
  data: Record<string, DDragonChampion>;
}

/** All champions in the given locale, sorted by localized name. */
export function getChampions(locale: string): Promise<DDragonChampion[]> {
  const lang = toDDragonLanguage(locale);
  return cache.getOrLoad(`ddragon:champions:${lang}`, TTL.ddragon, async () => {
    const version = await getLatestVersion();
    const json = await fetchJson<ChampionListResponse>(`${BASE}/cdn/${version}/data/${lang}/champion.json`);
    return Object.values(json.data)
      .map(({ id, key, name, title, tags }) => ({ id, key, name, title, tags }))
      .sort((a, b) => a.name.localeCompare(b.name, lang.replace("_", "-")));
  });
}
