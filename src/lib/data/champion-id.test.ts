import { describe, expect, it } from "vitest";
import { ChampionIndex, toDDragonId } from "./champion-id";

const index = new ChampionIndex([
  { id: "MonkeyKing", key: "62", name: "Wukong" },
  { id: "Nunu", key: "20", name: "Nunu & Willump" },
  { id: "Kaisa", key: "145", name: "Kai'Sa" },
  { id: "AurelionSol", key: "136", name: "Aurelion Sol" },
  { id: "Renata", key: "888", name: "Renata Glasc" },
  { id: "Velkoz", key: "161", name: "Vel'Koz" },
  { id: "Ahri", key: "103", name: "Ahri" },
]);

describe("toDDragonId", () => {
  it("maps special names without an index", () => {
    expect(toDDragonId("Wukong")).toBe("MonkeyKing");
    expect(toDDragonId("Nunu & Willump")).toBe("Nunu");
    expect(toDDragonId("Kai'Sa")).toBe("Kaisa");
    expect(toDDragonId("Cho'Gath")).toBe("Chogath");
    expect(toDDragonId("Kog'Maw")).toBe("KogMaw");
    expect(toDDragonId("Dr. Mundo")).toBe("DrMundo");
    expect(toDDragonId("Renata Glasc")).toBe("Renata");
    expect(toDDragonId("Aurelion Sol")).toBe("AurelionSol");
    expect(toDDragonId("Lee Sin")).toBe("LeeSin");
    expect(toDDragonId("Ahri")).toBe("Ahri");
  });

  it("resolves through the Data Dragon index by name, id or key", () => {
    expect(toDDragonId("Wukong", index)).toBe("MonkeyKing");
    expect(toDDragonId("monkeyking", index)).toBe("MonkeyKing");
    expect(toDDragonId("Nunu & Willump", index)).toBe("Nunu");
    expect(toDDragonId("VEL'KOZ", index)).toBe("Velkoz");
    expect(index.resolve(62)).toBe("MonkeyKing");
    expect(index.resolve("888")).toBe("Renata");
  });

  it("returns undefined for unknown champions with an index", () => {
    expect(toDDragonId("Nao Existe", index)).toBeUndefined();
    expect(index.resolve(99999)).toBeUndefined();
  });
});
