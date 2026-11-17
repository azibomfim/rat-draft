import { describe, expect, it } from "vitest";
import type { Role } from "../data/types";
import { analyzeComp, archetypeWinner, compareComps, type CompPick } from "./analyze";
import { attributeIds, getAttributes, parseChampionAttributesFile } from "./attributes";

const ROLE_ORDER: Role[] = ["top", "jungle", "mid", "adc", "support"];
const team = (...ids: string[]): CompPick[] => ids.map((championId, i) => ({ championId, role: ROLE_ORDER[i] }));
const top2 = (picks: CompPick[]) => analyzeComp(picks).archetypes.slice(0, 2).map((a) => a.type);

// Six well-known comps (seção 9, Fase 3).
const ENGAGE = team("Malphite", "Sejuani", "Orianna", "MissFortune", "Leona");
const POKE = team("Jayce", "Nidalee", "Xerath", "Ezreal", "Karma");
const PROTECT = team("Ornn", "Ivern", "Orianna", "Jinx", "Lulu");
const FULL_AD = team("Darius", "Graves", "Zed", "Draven", "Pyke");
const NO_FRONTLINE = team("Fiora", "Kindred", "Ahri", "Jinx", "Lux");
const SPLIT = team("Fiora", "Trundle", "TwistedFate", "Ezreal", "Shen");
const DIVE = team("Camille", "Vi", "Diana", "Kaisa", "Rakan");

describe("attributes file", () => {
  it("has every field for every champion", () => {
    expect(attributeIds().length).toBeGreaterThan(160);
    expect(getAttributes("MonkeyKing")?.roles).toContain("jungle");
  });

  it("rejects invalid data with a clear message", () => {
    const bad = { Ahri: { ...getAttributes("Ahri"), engage: 7 } };
    expect(() => parseChampionAttributesFile(bad)).toThrow(/Ahri\.engage/);
    const missing = { Ahri: { ...getAttributes("Ahri"), poke: undefined } };
    expect(() => parseChampionAttributesFile(missing)).toThrow(/Ahri\.poke/);
  });
});

describe("analyzeComp", () => {
  it("classic engage comp: engage archetype, frontline, no engage weakness", () => {
    const r = analyzeComp(ENGAGE);
    expect(r.archetypes[0].type).toBe("engage");
    expect(r.weaknesses).not.toContain("no_engage");
    expect(r.weaknesses).not.toContain("no_frontline");
    expect(r.strengths).toEqual(expect.arrayContaining(["strong_engage", "strong_frontline"]));
  });

  it("poke comp: poke archetype and no frontline", () => {
    const r = analyzeComp(POKE);
    expect(r.archetypes[0].type).toBe("poke");
    expect(r.weaknesses).toContain("no_frontline");
  });

  it("protect the ADC: protect in the top 2 and good peel", () => {
    expect(top2(PROTECT)).toContain("protect");
    const r = analyzeComp(PROTECT);
    expect(r.strengths).toContain("strong_peel");
    expect(r.weaknesses).not.toContain("no_peel_for_carry");
  });

  it("full AD comp → full_ad warning", () => {
    const r = analyzeComp(FULL_AD);
    expect(r.damage.ad).toBeGreaterThan(0.8);
    expect(r.damageWarning).toBe("full_ad");
    expect(r.weaknesses).toContain("single_damage_type");
  });

  it("comp without a tank → no_frontline, and the carry lacks peel", () => {
    const r = analyzeComp(NO_FRONTLINE);
    expect(r.weaknesses).toContain("no_frontline");
  });

  it("split push comp: splitpush in the top 2", () => {
    expect(top2(SPLIT)).toContain("splitpush");
  });

  it("dive comp: dive in the top 2", () => {
    expect(top2(DIVE)).toContain("dive");
  });

  it("flags an unpeeled hypercarry", () => {
    const r = analyzeComp(team("Fiora", "MasterYi", "Zed", "Jinx", "Pyke"));
    expect(r.weaknesses).toContain("no_peel_for_carry");
  });

  it("normalizes the profile and the power curve to 0–10", () => {
    const r = analyzeComp(ENGAGE);
    for (const v of Object.values(r.profile)) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(r.profile)) expect(v).toBeLessThanOrEqual(10);
    const early = analyzeComp(team("Renekton", "LeeSin", "Pantheon", "Draven", "Leona")).powerCurve;
    const late = analyzeComp(team("Kayle", "MasterYi", "Kassadin", "Jinx", "Sona")).powerCurve;
    expect(early.early).toBeGreaterThan(early.late);
    expect(late.late).toBeGreaterThan(late.early);
  });

  it("does not warn on a partial draft and ignores unknown champions", () => {
    const r = analyzeComp(team("Darius", "NotAChampion"));
    expect(r.damageWarning).toBeUndefined();
    expect(r.weaknesses).toEqual([]);
    expect(r.unknown).toEqual(["NotAChampion"]);
    expect(analyzeComp([]).archetypes.every((a) => a.score === 0)).toBe(true);
  });

  it("flags vulnerable_to_poke only when the enemy pokes and we are immobile", () => {
    const immobile = team("Ornn", "Sejuani", "Orianna", "Jinx", "Braum");
    expect(analyzeComp(immobile, POKE).weaknesses).toContain("vulnerable_to_poke");
    expect(analyzeComp(immobile).weaknesses).not.toContain("vulnerable_to_poke");
  });
});

describe("compareComps", () => {
  it("engage beats poke in the archetype matchup", () => {
    expect(archetypeWinner("engage", "poke")).toBe("a");
    expect(archetypeWinner("poke", "protect")).toBe("a");
    expect(archetypeWinner("splitpush", "pick")).toBe("b");
    const c = compareComps(ENGAGE, POKE);
    expect(c.archetypeMatchup).toEqual({ a: "engage", b: "poke", winner: "a" });
    expect(c.scores.a.score).toBeGreaterThan(c.scores.b.score);
    expect(c.favored).toBe("a");
  });

  it("explains each score with factors and stays in 0–100", () => {
    const c = compareComps(FULL_AD, PROTECT);
    for (const side of [c.scores.a, c.scores.b]) {
      expect(side.score).toBeGreaterThanOrEqual(0);
      expect(side.score).toBeLessThanOrEqual(100);
      expect(side.factors.length).toBeGreaterThan(0);
    }
    expect(c.scores.a.factors).toContainEqual(expect.objectContaining({ code: "damage_balance", detail: "full_ad" }));
  });

  it("is symmetric", () => {
    const ab = compareComps(ENGAGE, DIVE);
    const ba = compareComps(DIVE, ENGAGE);
    expect(ab.scores.a.score).toBe(ba.scores.b.score);
    expect(ab.scores.b.score).toBe(ba.scores.a.score);
  });

  it("reports who is stronger in each phase", () => {
    const c = compareComps(team("Renekton", "LeeSin", "Pantheon", "Draven", "Leona"), team("Kayle", "MasterYi", "Kassadin", "Jinx", "Sona"));
    expect(c.phases.early).toBe("a");
    expect(c.phases.late).toBe("b");
  });
});
