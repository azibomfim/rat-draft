/**
 * Simulator state as a reducer (seção 8.2). The state is the list of actions
 * taken so far; the board is derived from it. Undo removes the user's last
 * action and every coach action that came after it.
 */
import type { Role } from "../data/types";
import { DRAFT_LENGTH, DRAFT_ORDER, stepAt, type DraftStep } from "./order";
import { emptyBoard, type DraftBoardState, type DraftSide } from "./types";

export type Actor = "user" | "coach";

export interface TakenAction {
  championId: string;
  /** Only for picks. */
  role?: Role;
  by: Actor;
  /** Coach's explanation, shown in the speech box. */
  reasoning?: string;
}

export interface SimState {
  userSide: DraftSide;
  actions: TakenAction[];
  /** Role overrides for picks, applied after the draft (swaps, like in game). */
  roleSwaps: Partial<Record<DraftSide, Role[]>>;
}

export type SimAction =
  | { type: "act"; championId: string; role?: Role; by: Actor; reasoning?: string }
  | { type: "undo" }
  | { type: "swapRoles"; side: DraftSide; a: number; b: number }
  | { type: "reset"; userSide?: DraftSide };

export function initialSimState(userSide: DraftSide): SimState {
  return { userSide, actions: [], roleSwaps: {} };
}

export function currentStep(state: SimState): DraftStep | null {
  return stepAt(state.actions.length);
}

export function isComplete(state: SimState): boolean {
  return state.actions.length >= DRAFT_LENGTH;
}

/** Who acts on the current step. */
export function currentActor(state: SimState): Actor | null {
  const step = currentStep(state);
  return step ? (step.side === state.userSide ? "user" : "coach") : null;
}

export function usedIds(state: SimState): Set<string> {
  return new Set(state.actions.map((a) => a.championId));
}

/** Roles still open for picks on a side. */
export function openRoles(state: SimState, side: DraftSide, all: readonly Role[]): Role[] {
  const taken = new Set(
    state.actions.flatMap((a, i) => (DRAFT_ORDER[i].side === side && DRAFT_ORDER[i].action === "pick" && a.role ? [a.role] : [])),
  );
  return all.filter((r) => !taken.has(r));
}

export function toBoard(state: SimState): DraftBoardState {
  const board = emptyBoard();
  for (const side of ["blue", "red"] as const) for (const p of board[side].picks) p.role = null;
  state.actions.forEach((a, i) => {
    const step = DRAFT_ORDER[i];
    if (step.action === "ban") board[step.side].bans[step.slot] = a.championId;
    else board[step.side].picks[step.slot] = { championId: a.championId, role: a.role ?? null, player: null };
  });
  for (const side of ["blue", "red"] as const) {
    const roles = state.roleSwaps[side];
    if (roles) roles.forEach((r, i) => (board[side].picks[i].role = r));
  }
  return board;
}

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case "act": {
      const step = currentStep(state);
      if (!step) return state;
      const expected: Actor = step.side === state.userSide ? "user" : "coach";
      if (action.by !== expected) return state;
      if (usedIds(state).has(action.championId)) return state;
      if (step.action === "pick") {
        if (!action.role) return state;
        const roles = openRoles(state, step.side, ["top", "jungle", "mid", "adc", "support"]);
        if (!roles.includes(action.role)) return state;
      }
      const taken: TakenAction = {
        championId: action.championId,
        by: action.by,
        ...(step.action === "pick" ? { role: action.role } : {}),
        ...(action.reasoning ? { reasoning: action.reasoning } : {}),
      };
      return { ...state, actions: [...state.actions, taken], roleSwaps: {} };
    }
    case "undo": {
      let lastUser = -1;
      state.actions.forEach((a, i) => {
        if (a.by === "user") lastUser = i;
      });
      if (lastUser < 0) return state;
      return { ...state, actions: state.actions.slice(0, lastUser), roleSwaps: {} };
    }
    case "swapRoles": {
      if (!isComplete(state)) return state;
      const board = toBoard(state);
      const roles = board[action.side].picks.map((p) => p.role as Role);
      [roles[action.a], roles[action.b]] = [roles[action.b], roles[action.a]];
      return { ...state, roleSwaps: { ...state.roleSwaps, [action.side]: roles } };
    }
    case "reset":
      return initialSimState(action.userSide ?? state.userSide);
  }
}
