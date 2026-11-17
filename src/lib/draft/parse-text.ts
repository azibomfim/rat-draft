/**
 * Parses a pasted draft, one line per team (seção 8.3):
 *
 *   Azul: Aatrox, Lee Sin, Ahri, Jinx, Thresh
 *   Vermelho: Ornn, Vi, Orianna, Kai'Sa, Nautilus
 *   Bans azul: Yone, Rell, Ziggs
 *   Red bans: Skarner, Ashe
 *
 * Picks are in role order (Top, Jungle, Mid, ADC, Support). Side names and
 * champion names are accepted in Portuguese and English.
 */
import type { ChampionIndex } from "../data/champion-id";
import type { DraftSide } from "./types";

export interface ParsedDraftText {
  picks: Partial<Record<DraftSide, string[]>>;
  bans: Partial<Record<DraftSide, string[]>>;
  /** Names that did not match any champion. */
  unknown: string[];
  /** Lines that did not start with a known side. */
  ignoredLines: string[];
}

const SIDE_WORDS: Record<string, DraftSide> = {
  azul: "blue",
  blue: "blue",
  vermelho: "red",
  red: "red",
};
const BAN_WORDS = new Set(["ban", "bans", "banimento", "banimentos", "banido", "banidos"]);
const FILLER_WORDS = new Set(["time", "lado", "team", "side", "do", "da", "de", "of", "the"]);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "Bans azul" / "Azul (bans)" / "Time vermelho" → { side, isBan } */
function parseLabel(label: string): { side: DraftSide; isBan: boolean } | null {
  const words = normalize(label)
    .split(/[^a-z]+/)
    .filter(Boolean);
  let side: DraftSide | undefined;
  let isBan = false;
  for (const w of words) {
    if (SIDE_WORDS[w]) side = SIDE_WORDS[w];
    else if (BAN_WORDS.has(w)) isBan = true;
    else if (!FILLER_WORDS.has(w)) return null;
  }
  return side ? { side, isBan } : null;
}

export function parseDraftText(text: string, index: ChampionIndex): ParsedDraftText {
  const result: ParsedDraftText = { picks: {}, bans: {}, unknown: [], ignoredLines: [] };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.search(/[:\-–=]/);
    const label = colon > 0 ? parseLabel(line.slice(0, colon)) : null;
    if (!label) {
      result.ignoredLines.push(line);
      continue;
    }
    const ids: string[] = [];
    for (const name of line.slice(colon + 1).split(/[,;|/]/)) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const id = index.resolve(trimmed);
      if (id) ids.push(id);
      else result.unknown.push(trimmed);
    }
    const target = label.isBan ? result.bans : result.picks;
    target[label.side] = [...(target[label.side] ?? []), ...ids].slice(0, 5);
  }
  return result;
}
