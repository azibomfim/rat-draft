import { describe, expect, it } from "vitest";
import { parseRiotIds } from "./riot-id";

const names = (input: string) => parseRiotIds(input).ids.map((i) => `${i.gameName}#${i.tagLine}`);

describe("parseRiotIds", () => {
  it("parses a multi OP.GG link with %23 and %2C", () => {
    const r = parseRiotIds("https://op.gg/multisearch/br?summoners=Nome%23BR1%2CNome2%23BR1");
    expect(r.ids).toEqual([
      { gameName: "Nome", tagLine: "BR1", tagAssumed: false, region: "br" },
      { gameName: "Nome2", tagLine: "BR1", tagAssumed: false, region: "br" },
    ]);
    expect(r.invalid).toEqual([]);
  });

  it("parses multi links with other URL variations", () => {
    expect(names("https://www.op.gg/lol/multisearch/br?summoners=Robo%23ROBS,tinowns%23BR1")).toEqual([
      "Robo#ROBS",
      "tinowns#BR1",
    ]);
    expect(names("op.gg/multisearch/br?summoners=Pa%C3%A7oca+Doce%23BR1%2Cbrttxdd-BR2")).toEqual([
      "Paçoca Doce#BR1",
      "brttxdd#BR2",
    ]);
    expect(names("https://op.gg/multisearch?region=br&summoners=A%20B%23BR1")).toEqual(["A B#BR1"]);
  });

  it("parses OP.GG profile links", () => {
    const r = parseRiotIds("https://op.gg/summoners/br/Nome-BR1");
    expect(r.ids).toEqual([{ gameName: "Nome", tagLine: "BR1", tagAssumed: false, region: "br" }]);
    expect(names("https://www.op.gg/lol/summoners/br/Jo%C3%A3o%20Silva-1234?queue_type=SOLORANKED")).toEqual([
      "João Silva#1234",
    ]);
  });

  it("parses Riot IDs separated by lines, commas and semicolons", () => {
    expect(names("Nome#BR1\nOutro#BR2, Terceiro #KR1;Quarto#ABCD")).toEqual([
      "Nome#BR1",
      "Outro#BR2",
      "Terceiro#KR1",
      "Quarto#ABCD",
    ]);
  });

  it("keeps accents and inner spaces", () => {
    expect(names("  Ação   Rápida#BR1  ")).toEqual(["Ação Rápida#BR1"]);
  });

  it("decodes %23 in plain text", () => {
    expect(names("Nome%23BR1")).toEqual(["Nome#BR1"]);
  });

  it("assumes #BR1 when the tag is missing", () => {
    expect(parseRiotIds("SemTag").ids).toEqual([{ gameName: "SemTag", tagLine: "BR1", tagAssumed: true }]);
  });

  it("uppercases tags and removes duplicates", () => {
    expect(names("nome#br1\nNOME#BR1")).toEqual(["nome#BR1"]);
  });

  it("reports invalid pieces", () => {
    const r = parseRiotIds("Bom#BR1, Ruim#TAGLONGA, #BR1");
    expect(r.ids.map((i) => i.gameName)).toEqual(["Bom"]);
    expect(r.invalid).toEqual(["Ruim#TAGLONGA", "#BR1"]);
  });

  it("mixes links and IDs in the same input", () => {
    expect(names("https://op.gg/summoners/br/Robo-ROBS\ntinowns#BR1")).toEqual(["Robo#ROBS", "tinowns#BR1"]);
  });
});
