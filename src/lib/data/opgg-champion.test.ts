import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ChampionIndex } from "./champion-id";
import {
  championMetaFromOpgg,
  laneMatchupFromGuides,
  MIN_MATCHUP_GAMES,
  parseMatchupGuide,
  toOpggChampionName,
} from "./opgg-champion";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

/** Index from every (id, name) pair that appears in the fixtures. */
function fixtureIndex(): ChampionIndex {
  const text = fixture("opgg-champion-ahri-mid.txt") + fixture("opgg-guide-ahri-syndra.txt");
  const entries = new Map<string, { id: string; key: string; name: string }>();
  for (const m of text.matchAll(/\((\d+),"([^"]+)"/g)) entries.set(m[1], { key: m[1], name: m[2], id: m[2].replace(/[^A-Za-z]/g, "") });
  for (const m of text.matchAll(/"champion_id":(\d+),"champion_name":"([^"]+)"/g))
    entries.set(m[1], { key: m[1], name: m[2], id: m[2].replace(/[^A-Za-z]/g, "") });
  entries.set("103", { id: "Ahri", key: "103", name: "Ahri" });
  entries.set("134", { id: "Syndra", key: "134", name: "Syndra" });
  return new ChampionIndex([...entries.values()]);
}

const now = Date.parse("2026-11-17T12:00:00Z");

describe("toOpggChampionName", () => {
  it("uses the English name in UPPER_SNAKE_CASE without apostrophes", () => {
    expect(toOpggChampionName("Wukong")).toBe("WUKONG");
    expect(toOpggChampionName("K'Sante")).toBe("KSANTE");
    expect(toOpggChampionName("Kai'Sa")).toBe("KAISA");
    expect(toOpggChampionName("Dr. Mundo")).toBe("DR_MUNDO");
    expect(toOpggChampionName("Nunu & Willump")).toBe("NUNU_WILLUMP");
    expect(toOpggChampionName("Lee Sin")).toBe("LEE_SIN");
    expect(toOpggChampionName("Jarvan IV")).toBe("JARVAN_IV");
  });
});

describe("parseMatchupGuide", () => {
  it("reads the full matchup table, tip, advantage and power curve", () => {
    const g = parseMatchupGuide(fixture("opgg-guide-ahri-syndra.txt"), fixtureIndex());
    expect(g.table.size).toBeGreaterThan(20);
    expect(g.table.get("Syndra")?.games).toBeGreaterThan(0);
    expect(g.opponentTip).toMatch(/Syndra/);
    expect(g.laneAdvantage).toBeTruthy();
    expect(g.powerCurve.length).toBeGreaterThan(2);
    expect(g.powerCurve[0].fromMinute).toBeLessThan(g.powerCurve[1].fromMinute);
  });
});

describe("championMetaFromOpgg", () => {
  const index = fixtureIndex();
  const table = parseMatchupGuide(fixture("opgg-guide-ahri-syndra.txt"), index).table;

  it("uses the role stats and the full table for counters", () => {
    const meta = championMetaFromOpgg(fixture("opgg-champion-ahri-mid.txt"), { championId: "Ahri", role: "mid", index, table, now });
    expect(meta.championId).toBe("Ahri");
    expect(meta.winRate).toBeGreaterThan(0.3);
    expect(meta.pickRate).toBeGreaterThan(0);
    expect(meta.roleRate).toBeGreaterThan(0.5);
    expect(meta.offRole).toBeUndefined();
    expect(meta.tier).toMatch(/^[1-5]$/);
    expect(meta.counters.length).toBeGreaterThan(3);
    for (const c of meta.counters) {
      expect(c.winRate).toBeGreaterThan(0.5); // the counter wins
      expect(c.games).toBeGreaterThanOrEqual(MIN_MATCHUP_GAMES);
    }
    for (const c of meta.goodAgainst) expect(c.winRate).toBeGreaterThan(0.5);
    // sorted: strongest counter first
    expect(meta.counters[0].winRate).toBeGreaterThanOrEqual(meta.counters.at(-1)!.winRate);
    expect(meta.synergies.length).toBeGreaterThan(0);
    expect(meta.synergies.every((s) => s.role !== "mid")).toBe(true);
  });

  it("falls back to OP.GG top counters without the table", () => {
    const meta = championMetaFromOpgg(fixture("opgg-champion-ahri-mid.txt"), { championId: "Ahri", role: "mid", index, table: null, now });
    expect(meta.counters.length).toBeGreaterThan(0);
    expect(meta.goodAgainst.length).toBeGreaterThan(0);
  });

  it("marks off-role champions", () => {
    const meta = championMetaFromOpgg(fixture("opgg-champion-ahri-mid.txt"), { championId: "Ahri", role: "support", index, now });
    expect(meta.offRole).toBe(true);
  });
});

describe("laneMatchupFromGuides", () => {
  const index = fixtureIndex();
  const ab = parseMatchupGuide(fixture("opgg-guide-ahri-syndra.txt"), index);

  it("builds the lane matchup from A's table", () => {
    const m = laneMatchupFromGuides(ab, null, { role: "mid", a: "Ahri", b: "Syndra", index, now });
    const row = ab.table.get("Syndra")!;
    expect(m.winRateA).toBeCloseTo(row.wins / row.games, 4);
    expect(m.games).toBe(row.games);
    expect(m.tips).toHaveLength(1);
    expect(m.tipsB).toEqual([]);
    expect(m.tipsLang).toBe("en");
    expect(m.powerCurve.a.length).toBeGreaterThan(0);
  });

  it("maps lane advantage names to sides and falls back to B's table", () => {
    const fake = (overrides: Partial<typeof ab>) => ({ ...ab, ...overrides });
    const m = laneMatchupFromGuides(
      fake({ table: new Map(), laneAdvantage: "Syndra", soloKillAdvantage: "EVEN" }),
      fake({ table: new Map([["Ahri", { games: 1000, wins: 600 }]]), opponentTip: "tip for Syndra" }),
      { role: "mid", a: "Ahri", b: "Syndra", index, now },
    );
    expect(m.laneAdvantage).toBe("b");
    expect(m.soloKillAdvantage).toBe("even");
    expect(m.winRateA).toBeCloseTo(0.4);
    expect(m.tipsB).toEqual(["tip for Syndra"]);
  });
});
