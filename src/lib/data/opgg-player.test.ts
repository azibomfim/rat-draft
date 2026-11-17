import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ChampionIndex } from "./champion-id";
import { profileFromOpgg } from "./opgg-player";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

const PROFILE = [
  "class Root: data",
  "class Data: summoner",
  "class Summoner: game_name,tagline,updated_at,league_stats,ranked_most_champions",
  "class LeagueStat: game_type,tier_info,win,lose",
  "class TierInfo: tier,division,lp",
  "class Ranked: my_champion_stats",
  "class Stat: id,play,win,lose,basic,champion_name",
  "class Basic: kill,death,assist",
  "",
  'Root(Data(Summoner("Nome","BR1","2026-11-10T10:00:00+09:00",[LeagueStat("SOLORANKED",TierInfo("DIAMOND",2,40),30,20),LeagueStat("FLEXRANKED",TierInfo("GOLD",1,10),5,5)],Ranked([Stat(62,30,18,12,Basic(150,90,120),"Wukong"),Stat(103,5,2,3,Basic(20,25,30),"Ahri")]))))',
].join("\n");

const MATCHES = [
  "class Root: data",
  "class Data: game_history",
  "class Game: created_at,game_type,participants",
  "class P: champion_id,champion_name,position,stats",
  "class S: kill,death,assist,result",
  "",
  'Root(Data([Game("2026-11-16T10:00:00+09:00","SOLORANKED",[P(62,"Wukong","JUNGLE",S(5,2,7,"WIN"))]),Game("2026-11-15T10:00:00+09:00","SOLORANKED",[P(62,"Wukong","JUNGLE",S(1,5,3,"LOSE"))]),Game("2026-11-14T10:00:00+09:00","ARAM",[P(103,"Ahri","NONE",S(20,1,30,"WIN"))]),Game("2026-11-13T10:00:00+09:00","NORMAL",[P(20,"Nunu & Willump","JUNGLE",S(2,2,10,"WIN"))])]))',
].join("\n");

const index = new ChampionIndex([
  { id: "MonkeyKing", key: "62", name: "Wukong" },
  { id: "Ahri", key: "103", name: "Ahri" },
  { id: "Nunu", key: "20", name: "Nunu & Willump" },
]);
const now = Date.parse("2026-11-17T12:00:00Z");
const base = { riotId: { gameName: "nome", tagLine: "BR1" }, region: "br", index, now };

describe("profileFromOpgg", () => {
  it("converts rank, pool, roles and recent form", () => {
    const p = profileFromOpgg(PROFILE, { ...base, matchesText: MATCHES });
    expect(p).toMatchObject({
      riotId: { gameName: "Nome", tagLine: "BR1" },
      tier: "DIAMOND",
      division: "II",
      lp: 40,
      queue: "solo",
      wins: 30,
      losses: 20,
      mainRoles: ["jungle"],
    });
    // ARAM does not count: 3 SR games, 2 wins, (8+20)/9
    expect(p.recentForm).toEqual({ games: 3, wins: 2, kda: 3.11 });
    const wukong = p.champions.find((c) => c.championId === "MonkeyKing");
    expect(wukong).toMatchObject({ games: 30, winRate: 0.6, kda: 3, role: "jungle", lastPlayedDaysAgo: 1 });
    expect(p.champions.map((c) => c.championId)).toContain("Nunu");
    expect(p.champions[0].championId).toBe("MonkeyKing");
    expect(p.sourceUpdatedAt).toBe("2026-11-10T01:00:00.000Z");
  });

  it("still works without match history", () => {
    const p = profileFromOpgg(PROFILE, { ...base, matchesText: null });
    expect(p.mainRoles).toEqual([]);
    expect(p.recentForm).toEqual({ games: 0, wins: 0, kda: 0 });
    expect(p.champions).toHaveLength(2);
  });

  it("reads the real fixtures", () => {
    // Build an index from every (key, name) pair seen in the fixtures.
    const text = fixture("opgg-profile.txt") + fixture("opgg-matches.txt");
    const pairs = [
      ...text.matchAll(/MyChampionStat\((\d+),\d+,\d+,\d+,(?:Basic\([^)]*\),)?"([^"]+)"/g),
      ...text.matchAll(/Participant\((\d+),"([^"]+)"/g),
    ].map((m) => ({ id: m[2], key: m[1], name: m[2] }));
    const p = profileFromOpgg(fixture("opgg-profile.txt"), {
      ...base,
      index: new ChampionIndex(pairs),
      matchesText: fixture("opgg-matches.txt"),
    });
    expect(p.tier).toBeTruthy();
    expect(p.mainRoles.length).toBeGreaterThan(0);
    expect(p.recentForm.games).toBeGreaterThan(0);
    expect(p.champions.length).toBeGreaterThan(0);
  });
});
