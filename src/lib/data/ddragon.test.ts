import { describe, expect, it } from "vitest";
import { championIconUrl, championSplashUrl, toDDragonLanguage } from "./ddragon";

describe("ddragon helpers", () => {
  it("maps app locales to Data Dragon languages", () => {
    expect(toDDragonLanguage("pt")).toBe("pt_BR");
    expect(toDDragonLanguage("en")).toBe("en_US");
  });

  it("builds image URLs", () => {
    expect(championIconUrl("15.22.1", "MonkeyKing")).toBe(
      "https://ddragon.leagueoflegends.com/cdn/15.22.1/img/champion/MonkeyKing.png",
    );
    expect(championSplashUrl("Ahri")).toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg",
    );
  });
});
