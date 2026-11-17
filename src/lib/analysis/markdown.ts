/**
 * Builds the "Copy analysis" Markdown (for the team's Discord). Pure: all
 * visible words come from `labels`, already translated by the caller.
 */
import type { CompAnalysis, CompComparison } from "../comp/analyze";
import type { Role } from "../data/types";
import type { DraftSide } from "../draft/types";
import type { LaneResult } from "./contract";

export interface MarkdownLabels {
  title: string;
  /** Already formatted, e.g. "Resultado: vitória do Azul"; null if unknown. */
  result: string | null;
  /** Already formatted scores line. */
  scores: string;
  favored: string;
  reasons: string[];
  side: Record<DraftSide, string>;
  role: Record<Role, string>;
  picks: string;
  bans: string;
  archetype: string;
  curve: string;
  damage: string;
  weaknesses: string;
  strengths: string;
  archetypeName: (type: string) => string;
  weaknessText: (code: string) => string;
  strengthText: (code: string) => string;
  lanesTitle: string;
  laneNoData: string;
  aiTitle: string;
  footer: string;
}

export interface MarkdownInput {
  names: Record<string, string>;
  draft: Record<DraftSide, { bans: string[]; picks: { championId: string; role: Role }[] }>;
  comparison: CompComparison;
  lanes: LaneResult[];
  aiText: string;
  pct: (x: number) => string;
  /** Locale number formatter (defaults to String). */
  num?: (x: number) => string;
  labels: MarkdownLabels;
}

export function buildAnalysisMarkdown(input: MarkdownInput): string {
  const { names, draft, comparison, lanes, aiText, pct, labels: l } = input;
  const num = input.num ?? String;
  const n = (id: string) => names[id] ?? id;
  const out: string[] = [`# ${l.title}`, ""];
  if (l.result) out.push(`**${l.result}**`, "");
  out.push(`**${l.scores}**`, "", `**${l.favored}**`);
  for (const r of l.reasons) out.push(`- ${r}`);
  out.push("");

  for (const side of ["blue", "red"] as const) {
    const comp: CompAnalysis = side === "blue" ? comparison.a : comparison.b;
    out.push(`## ${l.side[side]}`);
    out.push(`- ${l.picks}: ${draft[side].picks.map((p) => `${n(p.championId)} (${l.role[p.role]})`).join(", ")}`);
    if (draft[side].bans.length) out.push(`- ${l.bans}: ${draft[side].bans.map(n).join(", ")}`);
    out.push(`- ${l.archetype}: ${comp.archetypes.slice(0, 2).map((a) => l.archetypeName(a.type)).join(" / ")}`);
    out.push(`- ${l.damage}: AD ${pct(comp.damage.ad)} · AP ${pct(comp.damage.ap)}`);
    out.push(`- ${l.curve}: ${num(comp.powerCurve.early)} / ${num(comp.powerCurve.mid)} / ${num(comp.powerCurve.late)}`);
    if (comp.weaknesses.length) out.push(`- ${l.weaknesses}: ${comp.weaknesses.map(l.weaknessText).join("; ")}`);
    if (comp.strengths.length) out.push(`- ${l.strengths}: ${comp.strengths.map(l.strengthText).join("; ")}`);
    out.push("");
  }

  out.push(`## ${l.lanesTitle}`);
  for (const lane of lanes) {
    const head = `- ${l.role[lane.role]}: ${n(lane.blue)} × ${n(lane.red)}`;
    const wr = lane.matchup?.winRateA;
    out.push(wr === undefined ? `${head}: ${l.laneNoData}` : `${head}: ${pct(wr)} × ${pct(1 - wr)}`);
  }
  out.push("");

  if (aiText.trim()) {
    out.push(`## ${l.aiTitle}`, "", aiText.trim().replace(/^## /gm, "### "), "");
  }
  out.push(`_${l.footer}_`);
  return out.join("\n");
}
