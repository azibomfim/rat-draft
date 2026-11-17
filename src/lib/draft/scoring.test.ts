import { describe, expect, it } from "vitest";
import { fitScore } from "../comp/fit";
import type { LaneMeta, LaneMetaEntry, Role } from "../data/types";
import {
  laneWinRate,
  metaScore,
  neededTables,
  suggestBans,
  suggestPicks,
  tableKey,
  type ScoringData,
  type SimpleBoard,
  type TeamPool,
} from "./scoring";

const entry = (championId: string, role: Role, tier: number, winRate = 0.5, banRate = 0.02): LaneMetaEntry => ({
  championId,
  role,
  tier,
  winRate,
  pickRate: 0.05,
  banRate,
  roleRate: 0.9,
});

const meta: LaneMeta = {
  top: [entry("Malphite", "top", 1, 0.52), entry("Darius", "top", 2), entry("Jayce", "top", 3), entry("Teemo", "top", 4)],
  jungle: [entry("Sejuani", "jungle", 1), entry("MasterYi", "jungle", 2, 0.51, 0.2)],
  mid: [entry("Ahri", "mid", 1, 0.51), entry("Syndra", "mid", 2), entry("Orianna", "mid", 2), entry("Zed", "mid", 3, 0.5, 0.15)],
  adc: [entry("Jinx", "adc", 1), entry("Ezreal", "adc", 2)],
  support: [entry("Leona", "support", 1), entry("Lulu", "support", 2), entry("Thresh", "support", 1)],
};

const data: ScoringData = {
  meta,
  tables: {
    // Syndra's table in mid: Ahri wins 60% of 1000 games against her (from Syndra's view: 400 wins).
    [tableKey("mid", "Syndra")]: { Ahri: { games: 1000, wins: 400 }, Zed: { games: 800, wins: 480 } },
    // Our Jinx in adc: Ezreal beats her.
    [tableKey("adc", "Jinx")]: { Ezreal: { games: 2000, wins: 860 } },
  },
};

const empty = (): SimpleBoard => ({ blue: { bans: [], picks: [] }, red: { bans: [], picks: [] } });

describe("metaScore / laneWinRate", () => {
  it("scores by tier with a win-rate adjustment", () => {
    expect(metaScore(entry("X", "top", 1, 0.5))).toBe(90);
    expect(metaScore(entry("X", "top", 1, 0.53))).toBe(96);
    expect(metaScore(entry("X", "top", 5, 0.4))).toBe(20);
    expect(metaScore(undefined)).toBe(20);
  });

  it("reads the lane win rate from either table, shrunk to 50%", () => {
    const wr = laneWinRate(data, "mid", "Ahri", "Syndra")!;
    expect(wr).toBeGreaterThan(0.58);
    expect(wr).toBeLessThan(0.6);
    // Only Jinx's table exists: it works from both directions.
    expect(laneWinRate(data, "adc", "Ezreal", "Jinx")!).toBeGreaterThan(0.55);
    expect(laneWinRate(data, "adc", "Jinx", "Ezreal")!).toBeLessThan(0.45);
    expect(laneWinRate(data, "top", "Darius", "Teemo")).toBeNull();
  });
});

describe("fitScore", () => {
  it("rewards frontline/engage when missing and penalizes stacking one damage type", () => {
    const squishy = [{ championId: "Ahri" }, { championId: "Jinx" }];
    expect(fitScore(squishy, "Malphite").reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["adds_frontline", "adds_engage"]));
    const allAd = [{ championId: "Darius" }, { championId: "Zed" }];
    const r = fitScore(allAd, "Jinx");
    expect(r.reasons).toContainEqual({ code: "same_damage", type: "AD" });
    expect(fitScore(allAd, "Ahri").reasons).toContainEqual({ code: "balances_damage", type: "AP" });
  });
});

describe("suggestPicks", () => {
  it("returns up to 5 per open role, excluding used champions", () => {
    const board = empty();
    board.red.bans = ["Ahri"];
    board.blue.picks = [{ championId: "Malphite", role: "top" }];
    const s = suggestPicks(data, board, "blue");
    expect(Object.keys(s).sort()).toEqual(["adc", "jungle", "mid", "support"]);
    expect(s.mid!.map((p) => p.championId)).not.toContain("Ahri");
    expect(s.mid!.length).toBeLessThanOrEqual(5);
    expect(s.mid![0].parts.comfort).toBeNull();
  });

  it("uses comfort when the team is known and shows the breakdown", () => {
    const pool: TeamPool = { mid: { player: "Robo", champions: { Zed: 95, Syndra: 10 } } };
    const s = suggestPicks(data, empty(), "blue", pool);
    const zed = s.mid!.find((p) => p.championId === "Zed")!;
    expect(zed.parts.comfort).toBe(95);
    expect(zed.reasons).toContainEqual({ code: "comfort", player: "Robo", comfort: 95 });
    expect(s.mid![0].championId).toBe("Zed");
  });

  it("answers the enemy laner with counters", () => {
    const board = empty();
    board.red.picks = [{ championId: "Syndra", role: "mid" }];
    const s = suggestPicks(data, board, "blue");
    const ahri = s.mid!.find((p) => p.championId === "Ahri")!;
    expect(ahri.parts.counter).toBeGreaterThan(10);
    expect(ahri.reasons.some((r) => r.code === "counters")).toBe(true);
    const zed = s.mid!.find((p) => p.championId === "Zed");
    if (zed) expect(zed.parts.counter).toBeLessThan(0);
    // counter style weighs counters more
    const counterStyle = suggestPicks(data, board, "blue", undefined, "counter").mid!.find((p) => p.championId === "Ahri")!;
    expect(counterStyle.parts.counter).toBeGreaterThan(ahri.parts.counter);
  });

  it("changes as the draft advances", () => {
    const first = suggestPicks(data, empty(), "blue").support!.map((p) => p.championId);
    const board = empty();
    board.red.picks = [{ championId: "Leona", role: "support" }];
    board.blue.bans = ["Thresh"];
    const later = suggestPicks(data, board, "blue").support!.map((p) => p.championId);
    expect(later).not.toEqual(first);
    expect(later).not.toContain("Leona");
    expect(later).not.toContain("Thresh");
  });
});

describe("suggestBans", () => {
  it("suggests at most 5 available bans with reasons", () => {
    const board = empty();
    board.blue.bans = ["Malphite"];
    const bans = suggestBans(data, board, "blue");
    expect(bans.length).toBeLessThanOrEqual(5);
    expect(bans.map((b) => b.championId)).not.toContain("Malphite");
    expect(bans.every((b) => b.reasons.length > 0)).toBe(true);
  });

  it("prioritizes the enemy's comfort picks and threats to your picks", () => {
    const enemy: TeamPool = { top: { player: "Rival", champions: { Teemo: 98 } } };
    const board = empty();
    board.blue.picks = [{ championId: "Jinx", role: "adc" }];
    const bans = suggestBans(data, board, "blue", undefined, enemy).map((b) => b.championId);
    expect(bans).toContain("Teemo");
    expect(bans).toContain("Ezreal");
    const teemo = suggestBans(data, board, "blue", undefined, enemy).find((b) => b.championId === "Teemo")!;
    expect(teemo.reasons).toContainEqual({ code: "enemy_comfort", player: "Rival", comfort: 98 });
  });

  it("lists the tables it needs", () => {
    const board = empty();
    board.red.picks = [{ championId: "Syndra", role: "mid" }];
    board.blue.picks = [{ championId: "Jinx", role: "adc" }];
    const pool: TeamPool = { top: { player: "A", champions: { Darius: 80 } } };
    expect(neededTables(board, "blue", pool).map((t) => tableKey(t.role, t.championId)).sort()).toEqual(["adc:Jinx", "mid:Syndra", "top:Darius"]);
  });
});
