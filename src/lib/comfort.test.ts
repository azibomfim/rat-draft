import { describe, expect, it } from "vitest";
import { adjustedWinRate, comfortScore, recencyScore, volumeScore } from "./comfort";

describe("comfort", () => {
  it("has diminishing returns on games", () => {
    expect(volumeScore(0)).toBe(0);
    expect(volumeScore(10) - volumeScore(5)).toBeGreaterThan(volumeScore(50) - volumeScore(45));
    expect(volumeScore(200)).toBe(1);
  });

  it("pulls small samples towards 50%", () => {
    expect(adjustedWinRate(3, 3)).toBeCloseTo(0.6875);
    expect(adjustedWinRate(60, 100)).toBeCloseTo(0.5952, 3);
  });

  it("decays recency with a 14 day half-life", () => {
    expect(recencyScore(0)).toBe(1);
    expect(recencyScore(14)).toBeCloseTo(0.5);
    expect(recencyScore(undefined)).toBe(0.25);
  });

  it("ranks a played-a-lot champion above a lucky 3-0", () => {
    const main = comfortScore({ games: 60, wins: 33, lastPlayedDaysAgo: 1 });
    const lucky = comfortScore({ games: 3, wins: 3, lastPlayedDaysAgo: 1 });
    expect(main).toBeGreaterThan(lucky);
  });

  it("stays within 0–100 and rewards recent play", () => {
    expect(comfortScore({ games: 0, wins: 0 })).toBe(0);
    expect(comfortScore({ games: 500, wins: 500, lastPlayedDaysAgo: 0 })).toBe(100);
    const old = comfortScore({ games: 40, wins: 20, lastPlayedDaysAgo: 90 });
    const recent = comfortScore({ games: 40, wins: 20, lastPlayedDaysAgo: 0 });
    expect(recent).toBeGreaterThan(old);
  });
});
