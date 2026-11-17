import { describe, expect, it } from "vitest";
import type { ComfortResult, LaneResult } from "../analysis/contract";
import { compareComps } from "../comp/analyze";
import type { Role } from "../data/types";
import { ANALYST_HEADINGS, buildAnalystPrompt, type AnalystPromptInput } from "./prompts";

const ROLES: Role[] = ["top", "jungle", "mid", "adc", "support"];
const blue = ["Malphite", "Sejuani", "Orianna", "MissFortune", "Leona"];
const red = ["Jayce", "Nidalee", "Xerath", "Ezreal", "Karma"];
const picks = (ids: string[]) => ids.map((championId, i) => ({ championId, role: ROLES[i] }));

const lanes: LaneResult[] = [
  {
    role: "top",
    blue: "Malphite",
    red: "Jayce",
    matchup: {
      role: "top",
      championA: "Malphite",
      championB: "Jayce",
      winRateA: 0.532,
      games: 2100,
      laneAdvantage: "b",
      tips: [],
      tipsB: [],
      powerCurve: { a: [], b: [] },
      fetchedAt: "2026-11-17T00:00:00Z",
    },
  },
  { role: "jungle", blue: "Sejuani", red: "Nidalee", error: { source: "opgg", code: "timeout", message: "x" } },
];

const comfort: ComfortResult[] = [
  { side: "blue", role: "mid", championId: "Orianna", player: { gameName: "Robo", tagLine: "ROBS" }, comfort: 81, games: 40, winRate: 0.6 },
  { side: "blue", role: "top", championId: "Malphite", player: { gameName: "Robo", tagLine: "ROBS" } },
];

function input(overrides: Partial<AnalystPromptInput> = {}): AnalystPromptInput {
  return {
    locale: "pt",
    names: { MissFortune: "Miss Fortune" },
    draft: { blue: { bans: ["Yone", "Rell"], picks: picks(blue) }, red: { bans: ["Ahri"], picks: picks(red) } },
    comparison: compareComps(picks(blue), picks(red)),
    lanes,
    comfort,
    ...overrides,
  };
}

describe("buildAnalystPrompt", () => {
  it("matches the snapshot (pt, with result)", () => {
    expect(buildAnalystPrompt(input({ winner: "red" }))).toMatchSnapshot();
  });

  it("matches the snapshot (en, no result)", () => {
    expect(buildAnalystPrompt(input({ locale: "en" }))).toMatchSnapshot();
  });

  it("asks for the UI language and to rely on the data", () => {
    const pt = buildAnalystPrompt(input());
    expect(pt.system).toContain("português do Brasil");
    expect(pt.system).toMatch(/Never invent statistics/);
    expect(buildAnalystPrompt(input({ locale: "en" })).system).toContain("Always answer in English");
  });

  it("only asks about the result when it is known", () => {
    expect(buildAnalystPrompt(input()).prompt).not.toContain(ANALYST_HEADINGS.pt.result);
    expect(buildAnalystPrompt(input({ winner: "blue" })).prompt).toContain(`## ${ANALYST_HEADINGS.pt.result}`);
  });

  it("includes computed data: scores, matchups and comfort", () => {
    const { prompt } = buildAnalystPrompt(input());
    expect(prompt).toContain("Miss Fortune");
    expect(prompt).toContain("Top: Malphite (Azul) vs Jayce (Vermelho): Malphite wins 53.2% of 2100 games; early lane advantage: Jayce");
    expect(prompt).toContain("Jungle: Sejuani (Azul) vs Nidalee (Vermelho): no data");
    expect(prompt).toContain("comfort 81, 40 games");
    expect(prompt).toContain("no recorded games on this champion");
    expect(prompt).toMatch(/draft score \(0-100\): \d+/);
  });
});
