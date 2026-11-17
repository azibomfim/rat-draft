/** Draft board types shared by the analyzer (free board) and the simulator. */
import type { RiotId, Role } from "../data/types";

export const SIDES = ["blue", "red"] as const;
export type DraftSide = (typeof SIDES)[number];

export const BANS_PER_SIDE = 5;
export const PICKS_PER_SIDE = 5;

export interface DraftPick {
  championId: string | null;
  role: Role | null;
  /** Optional player who played it (comfort). */
  player?: RiotId | null;
}

export interface DraftSideState {
  bans: (string | null)[];
  picks: DraftPick[];
}

export type DraftBoardState = Record<DraftSide, DraftSideState>;

/** Slot address on the board. */
export type DraftSlot = { side: DraftSide; kind: "ban" | "pick"; index: number };

export const DEFAULT_PICK_ROLES: Role[] = ["top", "jungle", "mid", "adc", "support"];

export function emptyBoard(): DraftBoardState {
  const side = (): DraftSideState => ({
    bans: Array.from({ length: BANS_PER_SIDE }, () => null),
    picks: DEFAULT_PICK_ROLES.map((role) => ({ championId: null, role, player: null })),
  });
  return { blue: side(), red: side() };
}

/** Every champion already banned or picked on the board. */
export function usedChampions(board: DraftBoardState): Set<string> {
  const used = new Set<string>();
  for (const side of SIDES) {
    for (const b of board[side].bans) if (b) used.add(b);
    for (const p of board[side].picks) if (p.championId) used.add(p.championId);
  }
  return used;
}

export function otherSide(side: DraftSide): DraftSide {
  return side === "blue" ? "red" : "blue";
}
