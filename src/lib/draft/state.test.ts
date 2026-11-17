import { describe, expect, it } from "vitest";
import { DRAFT_LENGTH, DRAFT_ORDER } from "./order";
import { currentActor, currentStep, initialSimState, isComplete, openRoles, simReducer, toBoard, type SimState } from "./state";

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

describe("DRAFT_ORDER", () => {
  it("follows the tournament order", () => {
    const seq = DRAFT_ORDER.map((s) => `${s.side[0].toUpperCase()}${s.action === "ban" ? "b" : "p"}`).join(" ");
    expect(seq).toBe(
      "Bb Rb Bb Rb Bb Rb Bp Rp Rp Bp Bp Rp Rb Bb Rb Bb Rp Bp Bp Rp",
    );
    expect(DRAFT_LENGTH).toBe(20);
  });

  it("gives each side 5 bans and 5 picks in slot order", () => {
    for (const side of ["blue", "red"] as const) {
      for (const action of ["ban", "pick"] as const) {
        const slots = DRAFT_ORDER.filter((s) => s.side === side && s.action === action).map((s) => s.slot);
        expect(slots).toEqual([0, 1, 2, 3, 4]);
      }
    }
  });

  it("labels the phases", () => {
    expect(DRAFT_ORDER.slice(0, 6).every((s) => s.phase === "ban1")).toBe(true);
    expect(DRAFT_ORDER.slice(6, 12).every((s) => s.phase === "pick1")).toBe(true);
    expect(DRAFT_ORDER.slice(12, 16).every((s) => s.phase === "ban2")).toBe(true);
    expect(DRAFT_ORDER.slice(16).every((s) => s.phase === "pick2")).toBe(true);
  });
});

/** Plays the whole draft with distinct champions; picks take open roles in order. */
function playAll(userSide: "blue" | "red"): SimState {
  let s = initialSimState(userSide);
  for (let i = 0; i < DRAFT_LENGTH; i++) {
    const step = currentStep(s)!;
    const role = step.action === "pick" ? openRoles(s, step.side, ROLES)[0] : undefined;
    s = simReducer(s, { type: "act", championId: `C${i}`, role, by: currentActor(s)! });
  }
  return s;
}

describe("simReducer", () => {
  it("only accepts the expected actor", () => {
    const s = initialSimState("red"); // blue (coach) bans first
    expect(simReducer(s, { type: "act", championId: "Ahri", by: "user" })).toBe(s);
    const next = simReducer(s, { type: "act", championId: "Ahri", by: "coach" });
    expect(next.actions).toHaveLength(1);
    expect(currentActor(next)).toBe("user");
  });

  it("rejects used champions and picks without an open role", () => {
    let s = initialSimState("blue");
    s = simReducer(s, { type: "act", championId: "Ahri", by: "user" });
    expect(simReducer(s, { type: "act", championId: "Ahri", by: "coach" })).toBe(s);
    for (let i = 0; i < 5; i++) s = simReducer(s, { type: "act", championId: `B${i}`, by: currentActor(s)! });
    // step 7: blue pick
    expect(currentStep(s)?.action).toBe("pick");
    expect(simReducer(s, { type: "act", championId: "Zed", by: "user" })).toBe(s);
    s = simReducer(s, { type: "act", championId: "Zed", role: "mid", by: "user" });
    expect(toBoard(s).blue.picks[0]).toMatchObject({ championId: "Zed", role: "mid" });
  });

  it("does not allow the same role twice on a side", () => {
    let s = initialSimState("blue");
    for (let i = 0; i < 6; i++) s = simReducer(s, { type: "act", championId: `B${i}`, by: currentActor(s)! });
    s = simReducer(s, { type: "act", championId: "Zed", role: "mid", by: "user" }); // B pick 1
    s = simReducer(s, { type: "act", championId: "Ahri", role: "mid", by: "coach" }); // R pick 1
    s = simReducer(s, { type: "act", championId: "Lux", role: "support", by: "coach" }); // R pick 2
    expect(openRoles(s, "blue", ROLES)).toEqual(["top", "jungle", "adc", "support"]);
    expect(simReducer(s, { type: "act", championId: "Jinx", role: "mid", by: "user" })).toBe(s);
  });

  it("undo removes the user's last action and the coach actions after it", () => {
    let s = initialSimState("blue");
    s = simReducer(s, { type: "act", championId: "A", by: "user" });
    s = simReducer(s, { type: "act", championId: "B", by: "coach" });
    s = simReducer(s, { type: "act", championId: "C", by: "user" });
    s = simReducer(s, { type: "act", championId: "D", by: "coach" });
    s = simReducer(s, { type: "undo" });
    expect(s.actions.map((a) => a.championId)).toEqual(["A", "B"]);
    s = simReducer(s, { type: "undo" });
    expect(s.actions).toEqual([]);
    expect(simReducer(s, { type: "undo" })).toBe(s);
  });

  it("completes a full draft and fills the board", () => {
    const s = playAll("red");
    expect(isComplete(s)).toBe(true);
    expect(currentStep(s)).toBeNull();
    const board = toBoard(s);
    expect(board.blue.bans.every(Boolean)).toBe(true);
    expect(board.red.picks.every((p) => p.championId && p.role)).toBe(true);
  });

  it("lets roles be swapped only after the draft", () => {
    const s = playAll("blue");
    const before = toBoard(s).blue.picks.map((p) => p.role);
    const swapped = simReducer(s, { type: "swapRoles", side: "blue", a: 0, b: 1 });
    const after = toBoard(swapped).blue.picks.map((p) => p.role);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(simReducer(initialSimState("blue"), { type: "swapRoles", side: "blue", a: 0, b: 1 }).roleSwaps).toEqual({});
  });
});
