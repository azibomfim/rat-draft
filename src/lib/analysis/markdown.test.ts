import { describe, expect, it } from "vitest";
import { compareComps } from "../comp/analyze";
import type { Role } from "../data/types";
import { buildAnalysisMarkdown, type MarkdownLabels } from "./markdown";

const ROLES: Role[] = ["top", "jungle", "mid", "adc", "support"];
const picks = (ids: string[]) => ids.map((championId, i) => ({ championId, role: ROLES[i] }));
const blue = picks(["Malphite", "Sejuani", "Orianna", "MissFortune", "Leona"]);
const red = picks(["Jayce", "Nidalee", "Xerath", "Ezreal", "Karma"]);

const labels: MarkdownLabels = {
  title: "Análise de draft",
  result: "Resultado: vitória do Vermelho",
  scores: "Nota do draft: Azul 79 × 49 Vermelho",
  favored: "Azul saiu na frente no draft",
  reasons: ["Estilo bem definido (Engage)"],
  side: { blue: "Azul", red: "Vermelho" },
  role: { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Suporte" },
  picks: "Picks",
  bans: "Bans",
  archetype: "Estilo",
  curve: "Curva",
  damage: "Dano",
  weaknesses: "Fraquezas",
  strengths: "Forças",
  archetypeName: (t) => t.toUpperCase(),
  weaknessText: (c) => `w:${c}`,
  strengthText: (c) => `s:${c}`,
  lanesTitle: "Matchups de rota",
  laneNoData: "sem dados",
  aiTitle: "Análise do coach (IA)",
  footer: "Gerado pelo Analista de Draft",
};

describe("buildAnalysisMarkdown", () => {
  const md = buildAnalysisMarkdown({
    names: { MissFortune: "Miss Fortune" },
    draft: { blue: { bans: ["Yone"], picks: blue }, red: { bans: [], picks: red } },
    comparison: compareComps(blue, red),
    lanes: [
      { role: "top", blue: "Malphite", red: "Jayce", matchup: { role: "top", championA: "Malphite", championB: "Jayce", winRateA: 0.55, tips: [], tipsB: [], powerCurve: { a: [], b: [] }, fetchedAt: "" } },
      { role: "jungle", blue: "Sejuani", red: "Nidalee" },
    ],
    aiText: "## Condições de vitória\n- Lutar no dragão",
    pct: (x) => `${Math.round(x * 100)}%`,
    labels,
  });

  it("contains the overview, both teams, lanes and the AI text", () => {
    expect(md).toContain("# Análise de draft");
    expect(md).toContain("**Resultado: vitória do Vermelho**");
    expect(md).toContain("- Estilo bem definido (Engage)");
    expect(md).toContain("- Picks: Malphite (Top), Sejuani (Jungle), Orianna (Mid), Miss Fortune (ADC), Leona (Suporte)");
    expect(md).toContain("- Bans: Yone");
    expect(md).toContain("- Estilo: ENGAGE");
    expect(md).toContain("- Top: Malphite × Jayce: 55% × 45%");
    expect(md).toContain("- Jungle: Sejuani × Nidalee: sem dados");
    expect(md).toContain("w:no_frontline");
    // AI headings are demoted under the AI section
    expect(md).toContain("## Análise do coach (IA)\n\n### Condições de vitória");
    expect(md.trim().endsWith("_Gerado pelo Analista de Draft_")).toBe(true);
  });

  it("omits empty bans and the AI section when there is no text", () => {
    const noAi = buildAnalysisMarkdown({
      names: {},
      draft: { blue: { bans: [], picks: blue }, red: { bans: [], picks: red } },
      comparison: compareComps(blue, red),
      lanes: [],
      aiText: "  ",
      pct: (x) => `${x}`,
      labels: { ...labels, result: null },
    });
    expect(noAi).not.toContain("Bans:");
    expect(noAi).not.toContain("IA");
    expect(noAi).not.toContain("Resultado");
  });
});
