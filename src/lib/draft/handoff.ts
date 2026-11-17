/**
 * Hand-off of a finished draft from the simulator to the analyzer
 * ("Analisar este draft"). Uses sessionStorage, wrapped in try/catch.
 */
import type { DraftBoardState, DraftSide } from "./types";

const KEY = "rat-draft:analyze-draft:v1";

export interface DraftHandoff {
  board: DraftBoardState;
  winner?: DraftSide | null;
}

export function saveDraftHandoff(data: DraftHandoff): boolean {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Reads and removes the pending draft, if any. */
export function takeDraftHandoff(): DraftHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as DraftHandoff;
    return parsed?.board?.blue && parsed.board.red ? parsed : null;
  } catch {
    return null;
  }
}
