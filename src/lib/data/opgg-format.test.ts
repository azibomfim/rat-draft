import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asArray, getPath, OpggFormatError, parseOpggText } from "./opgg-format";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("parseOpggText", () => {
  it("maps constructor args to declared field names", () => {
    const text = [
      "class Root: data",
      "class Data: name,stats,missing",
      "class Stat: n,ok",
      "",
      'Root(Data("A \\"b\\" ç",[Stat(1,true),Stat(-2.5,null)]))',
      "OP.GG page: https://op.gg",
    ].join("\n");
    expect(parseOpggText(text)).toEqual({
      data: { name: 'A "b" ç', stats: [{ n: 1, ok: true }, { n: -2.5, ok: null }], missing: null },
    });
  });

  it("parses JSON responses as JSON", () => {
    expect(parseOpggText('{"data":{"x":1}}\nOP.GG page: x')).toEqual({ data: { x: 1 } });
  });

  it("parses a real profile response", () => {
    const root = parseOpggText(fixture("opgg-profile.txt"));
    expect(getPath(root, "data.summoner.game_name")).toBe("Robo");
    const champs = asArray(getPath(root, "data.summoner.ranked_most_champions.my_champion_stats"));
    expect(champs.length).toBeGreaterThan(0);
    expect(champs[0]).toMatchObject({ champion_name: expect.any(String), play: expect.any(Number) });
  });

  it("throws a typed error on garbage", () => {
    expect(() => parseOpggText("no data here")).toThrow(OpggFormatError);
  });
});
