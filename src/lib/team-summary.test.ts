import { describe, expect, it } from "vitest";
import type { PlayerChampion, PlayerProfile, Role } from "./data/types";
import { assignDefaultRoles, summarizeTeam } from "./team-summary";

const champ = (championId: string, games: number, comfort: number, role?: Role): PlayerChampion => ({
  championId,
  games,
  winRate: 0.5,
  kda: 3,
  comfort,
  ...(role ? { role } : {}),
});

const profile = (mainRoles: Role[], champions: PlayerChampion[]): PlayerProfile => ({
  riotId: { gameName: "x", tagLine: "BR1" },
  region: "br",
  mainRoles,
  champions,
  recentForm: { games: 0, wins: 0, kda: 0 },
  fetchedAt: "2026-11-17T00:00:00Z",
});

describe("summarizeTeam", () => {
  it("builds the pool per role and flags shallow pools and one-tricks", () => {
    const { poolByRole, alerts } = summarizeTeam([
      { key: "a", role: "top", profile: profile(["top"], [champ("Gnar", 30, 80, "top"), champ("Jax", 20, 70), champ("Ahri", 10, 60, "mid"), champ("Fiora", 8, 50, "top")]) },
      { key: "b", role: "mid", profile: profile(["mid"], [champ("Ahri", 80, 95, "mid"), champ("Lux", 5, 30)]) },
      { key: "c", role: "jungle", profile: null },
      { key: "d", role: "jungle", profile: null },
    ]);

    expect(poolByRole.top[0].champions.map((c) => c.championId)).toEqual(["Gnar", "Jax", "Fiora"]);
    expect(poolByRole.mid[0].champions.map((c) => c.championId)).toEqual(["Ahri"]);
    expect(alerts).toContainEqual({ code: "shallow_pool", role: "mid", playerKey: "b", count: 1 });
    expect(alerts).toContainEqual(expect.objectContaining({ code: "one_trick", role: "mid", championId: "Ahri" }));
    expect(alerts).toContainEqual({ code: "duplicate_role", role: "jungle" });
    expect(alerts).toContainEqual({ code: "missing_role", role: "adc" });
    expect(alerts).toContainEqual({ code: "missing_role", role: "support" });
    expect(alerts.some((a) => a.code === "shallow_pool" && a.role === "top")).toBe(false);
  });
});

describe("assignDefaultRoles", () => {
  it("uses main roles first and fills the rest with free roles", () => {
    expect(
      assignDefaultRoles([profile(["mid"], []), profile(["mid", "top"], []), null, profile([], []), profile(["support"], [])]),
    ).toEqual(["mid", "top", null, "jungle", "support"]);
  });
});
