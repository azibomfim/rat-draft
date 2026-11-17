import { describe, expect, it } from "vitest";
import type { PlayerProfile } from "../data/types";
import { toTeamPool } from "./pools";

const profile = (name: string, champs: [string, number][]): PlayerProfile => ({
  riotId: { gameName: name, tagLine: "BR1" },
  region: "br",
  mainRoles: [],
  champions: champs.map(([championId, comfort]) => ({ championId, comfort, games: 10, winRate: 0.5, kda: 3 })),
  recentForm: { games: 0, wins: 0, kda: 0 },
  fetchedAt: "",
});

describe("toTeamPool", () => {
  it("maps players by role and skips missing roles, profiles and duplicates", () => {
    const pool = toTeamPool([
      { role: "top", profile: profile("A", [["Gnar", 80], ["Jax", 90]]) },
      { role: "top", profile: profile("B", [["Darius", 99]]) },
      { role: null, profile: profile("C", [["Ahri", 50]]) },
      { role: "mid", profile: null },
    ]);
    expect(pool).toEqual({ top: { player: "A", champions: { Jax: 90, Gnar: 80 } } });
  });

  it("returns undefined for an empty team", () => {
    expect(toTeamPool([])).toBeUndefined();
  });
});
