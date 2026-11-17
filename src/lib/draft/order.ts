/**
 * Tournament draft order (seção 8.2), fearless off.
 *
 * | #     | Phase   | Action                                          |
 * | 1–6   | Bans 1  | Blue, Red, Blue, Red, Blue, Red                 |
 * | 7–12  | Picks 1 | Blue, Red, Red, Blue, Blue, Red                 |
 * | 13–16 | Bans 2  | Red, Blue, Red, Blue                            |
 * | 17–20 | Picks 2 | Red, Blue, Blue, Red                            |
 */
import type { DraftSide } from "./types";

export type DraftPhase = "ban1" | "pick1" | "ban2" | "pick2";
export type DraftAction = "ban" | "pick";

export interface DraftStep {
  /** 0-based position in the draft (0–19). */
  index: number;
  phase: DraftPhase;
  side: DraftSide;
  action: DraftAction;
  /** Slot on that side's ban or pick row (0–4). */
  slot: number;
}

const B = "blue" as const;
const R = "red" as const;

const PHASES: { phase: DraftPhase; action: DraftAction; sides: DraftSide[] }[] = [
  { phase: "ban1", action: "ban", sides: [B, R, B, R, B, R] },
  { phase: "pick1", action: "pick", sides: [B, R, R, B, B, R] },
  { phase: "ban2", action: "ban", sides: [R, B, R, B] },
  { phase: "pick2", action: "pick", sides: [R, B, B, R] },
];

function buildOrder(): DraftStep[] {
  const steps: DraftStep[] = [];
  const counters = { blue: { ban: 0, pick: 0 }, red: { ban: 0, pick: 0 } };
  for (const { phase, action, sides } of PHASES) {
    for (const side of sides) {
      steps.push({ index: steps.length, phase, side, action, slot: counters[side][action]++ });
    }
  }
  return steps;
}

export const DRAFT_ORDER: readonly DraftStep[] = Object.freeze(buildOrder());
export const DRAFT_LENGTH = DRAFT_ORDER.length;

/** The step at `index`, or null when the draft is over. */
export function stepAt(index: number): DraftStep | null {
  return DRAFT_ORDER[index] ?? null;
}
