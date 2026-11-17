import { describe, expect, it } from "vitest";
import { ChampionIndex } from "../data/champion-id";
import { parseDraftText } from "./parse-text";

// Names in both languages, as the app builds the index from pt_BR + en_US.
const index = new ChampionIndex([
  { id: "Aatrox", name: "Aatrox" },
  { id: "LeeSin", name: "Lee Sin" },
  { id: "Ahri", name: "Ahri" },
  { id: "Jinx", name: "Jinx" },
  { id: "Thresh", name: "Thresh" },
  { id: "Ornn", name: "Ornn" },
  { id: "Vi", name: "Vi" },
  { id: "Orianna", name: "Orianna" },
  { id: "Kaisa", name: "Kai'Sa" },
  { id: "Nautilus", name: "Nautilus" },
  { id: "Bard", name: "Bard" },
  { id: "Bard", name: "Bardo" },
  { id: "Nunu", name: "Nunu & Willump" },
  { id: "Nunu", name: "Nunu e Willump" },
  { id: "MonkeyKing", name: "Wukong" },
  { id: "Yone", name: "Yone" },
  { id: "Rell", name: "Rell" },
]);

describe("parseDraftText", () => {
  it("parses one line per team in Portuguese", () => {
    const r = parseDraftText("Azul: Aatrox, Lee Sin, Ahri, Jinx, Thresh\nVermelho: Ornn, Vi, Orianna, Kai'Sa, Nautilus", index);
    expect(r.picks.blue).toEqual(["Aatrox", "LeeSin", "Ahri", "Jinx", "Thresh"]);
    expect(r.picks.red).toEqual(["Ornn", "Vi", "Orianna", "Kaisa", "Nautilus"]);
    expect(r.unknown).toEqual([]);
  });

  it("accepts English side names and localized champion names", () => {
    const r = parseDraftText("Blue: Wukong; Bardo | Nunu e Willump\nRed team - nunu & willump, bard", index);
    expect(r.picks.blue).toEqual(["MonkeyKing", "Bard", "Nunu"]);
    expect(r.picks.red).toEqual(["Nunu", "Bard"]);
  });

  it("reads ban lines in both languages", () => {
    const r = parseDraftText("Bans azul: Yone, Rell\nRed bans: Ahri\nVermelho (banimentos): Jinx", index);
    expect(r.bans).toEqual({ blue: ["Yone", "Rell"], red: ["Ahri", "Jinx"] });
    expect(r.picks).toEqual({});
  });

  it("reports unknown names and ignored lines", () => {
    const r = parseDraftText("Time Azul: Aatrox, Nao Existe\nPartida de ontem\nVerde: Ahri", index);
    expect(r.picks.blue).toEqual(["Aatrox"]);
    expect(r.unknown).toEqual(["Nao Existe"]);
    expect(r.ignoredLines).toEqual(["Partida de ontem", "Verde: Ahri"]);
  });

  it("keeps at most 5 per line", () => {
    const r = parseDraftText("Azul: Aatrox, Lee Sin, Ahri, Jinx, Thresh, Ornn", index);
    expect(r.picks.blue).toHaveLength(5);
  });
});
