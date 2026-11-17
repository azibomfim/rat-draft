/**
 * Parses team input (seção 8.1) into Riot IDs. Accepts, mixed freely:
 * - multi OP.GG links: any URL with a `summoners` query param
 *   (https://op.gg/multisearch/br?summoners=Nome%23BR1%2CNome2%23BR1);
 * - OP.GG profile links: .../summoners/br/Nome-BR1;
 * - Riot IDs (Nome#BR1), one per line or comma/semicolon separated.
 * Missing tag → defaultTag, flagged with `tagAssumed` so the UI can warn.
 */

export interface ParsedRiotId {
  gameName: string;
  tagLine: string;
  tagAssumed: boolean;
  /** Region found in a link, lowercase (e.g. "br"), if any. */
  region?: string;
}

export interface RiotIdParseResult {
  ids: ParsedRiotId[];
  /** Pieces that could not be understood. */
  invalid: string[];
}

export const DEFAULT_TAG = "BR1";

/** Riot rules: game name 3–16 chars, tag 3–5 alphanumerics. Kept a bit loose. */
const MAX_NAME = 16;
const TAG_RE = /^[\p{L}\p{N}]{2,5}$/u;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function cleanName(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** "Nome#BR1", "Nome #BR1", "Nome" → parsed id; `dashTag` also accepts "Nome-BR1". */
function parseOne(raw: string, defaultTag: string, dashTag: boolean, region?: string): ParsedRiotId | null {
  const text = cleanName(raw.includes("%") ? safeDecode(raw) : raw);
  if (!text) return null;

  let gameName: string;
  let tagLine: string;
  let tagAssumed = false;

  const hash = text.lastIndexOf("#");
  const dash = dashTag ? /^(.*)-([\p{L}\p{N}]{2,5})$/u.exec(text) : null;
  if (hash >= 0) {
    gameName = cleanName(text.slice(0, hash));
    tagLine = text.slice(hash + 1).trim();
  } else if (dash) {
    gameName = cleanName(dash[1]);
    tagLine = dash[2];
  } else {
    gameName = text;
    tagLine = defaultTag;
    tagAssumed = true;
  }

  if (!gameName || gameName.length > MAX_NAME || !TAG_RE.test(tagLine)) return null;
  return { gameName, tagLine: tagLine.toUpperCase(), tagAssumed, ...(region ? { region } : {}) };
}

function tryParseUrl(token: string): URL | null {
  if (!/^(https?:\/\/)?([\w-]+\.)*op\.gg\//i.test(token)) return null;
  try {
    return new URL(/^https?:\/\//i.test(token) ? token : `https://${token}`);
  } catch {
    return null;
  }
}

function parseUrl(url: URL, defaultTag: string): { ids: ParsedRiotId[]; invalid: string[] } | null {
  const ids: ParsedRiotId[] = [];
  const invalid: string[] = [];

  const summoners = url.searchParams.get("summoners");
  if (summoners !== null) {
    const region = /\/multisearch\/([a-z]+)/i.exec(url.pathname)?.[1]?.toLowerCase() ?? url.searchParams.get("region")?.toLowerCase() ?? undefined;
    for (const part of summoners.split(/[,\n]/)) {
      if (!part.trim()) continue;
      const id = parseOne(part, defaultTag, true, region);
      if (id) ids.push(id);
      else invalid.push(part.trim());
    }
    return { ids, invalid };
  }

  const profile = /\/summoners\/([a-z]+)\/([^/?#]+)/i.exec(url.pathname);
  if (profile) {
    const id = parseOne(safeDecode(profile[2]), defaultTag, true, profile[1].toLowerCase());
    if (id) ids.push(id);
    else invalid.push(url.toString());
    return { ids, invalid };
  }
  return null;
}

export function parseRiotIds(input: string, defaultTag: string = DEFAULT_TAG): RiotIdParseResult {
  const ids: ParsedRiotId[] = [];
  const invalid: string[] = [];

  // URLs never contain raw whitespace, so split lines first and pull URLs out.
  for (const line of input.split(/\r?\n/)) {
    let rest = line;
    for (const token of line.split(/\s+/)) {
      const url = tryParseUrl(token);
      if (!url) continue;
      const parsed = parseUrl(url, defaultTag);
      if (parsed) {
        ids.push(...parsed.ids);
        invalid.push(...parsed.invalid);
      } else {
        invalid.push(token);
      }
      rest = rest.replace(token, " ");
    }
    for (const part of rest.split(/[,;]/)) {
      if (!part.trim()) continue;
      const id = parseOne(part, defaultTag, false);
      if (id) ids.push(id);
      else invalid.push(part.trim());
    }
  }

  // De-duplicate case-insensitively, keeping the first occurrence.
  const seen = new Set<string>();
  const unique = ids.filter((id) => {
    const key = riotIdKey(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ids: unique, invalid };
}

export function riotIdKey(id: { gameName: string; tagLine: string }): string {
  return `${id.gameName}#${id.tagLine}`.toLocaleLowerCase();
}

export function formatRiotId(id: { gameName: string; tagLine: string }): string {
  return `${id.gameName}#${id.tagLine}`;
}
