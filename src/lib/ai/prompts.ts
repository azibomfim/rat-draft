/**
 * Prompts for the AI (seção 8.4). Each prompt is a pure function returning
 * { system, prompt } so the assembled text can be snapshot-tested.
 *
 * Rules: professional, objective LoL analyst/coach; always send the computed
 * data and ask the model to rely on it without inventing statistics; answer in
 * the UI language; short, scannable bullet points.
 */
import type { ComfortResult, LaneResult } from "../analysis/contract";
import type { CompAnalysis, CompComparison } from "../comp/analyze";
import type { Role } from "../data/types";
import type { DraftSide } from "../draft/types";

export type PromptLocale = "pt" | "en";

const LANGUAGE: Record<PromptLocale, string> = {
  pt: "português do Brasil",
  en: "English",
};

const SIDE_NAME: Record<PromptLocale, Record<DraftSide, string>> = {
  pt: { blue: "Azul", red: "Vermelho" },
  en: { blue: "Blue", red: "Red" },
};

const ROLE_NAME: Record<PromptLocale, Record<Role, string>> = {
  pt: { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Suporte" },
  en: { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" },
};

/** Section headings the analyst must use (the UI renders them as-is). */
export const ANALYST_HEADINGS: Record<PromptLocale, { winConditions: string; playAgainst: string; turningPoints: string; result: string }> = {
  pt: {
    winConditions: "Condições de vitória",
    playAgainst: "Como jogar contra",
    turningPoints: "Pontos de virada do draft",
    result: "O draft explica o resultado?",
  },
  en: {
    winConditions: "Win conditions",
    playAgainst: "How to play against",
    turningPoints: "Draft turning points",
    result: "Does the draft explain the result?",
  },
};

export function baseSystemPrompt(locale: PromptLocale): string {
  return [
    "You are a professional League of Legends analyst and coach: objective and direct.",
    "Base every statement on the DATA block you receive (composition analysis, meta, matchups, comfort).",
    "Never invent statistics, win rates or numbers that are not in the data. When something is not in the data, say it is a qualitative assessment.",
    "Only quote a number together with the exact item it belongs to in the data (same lane, same champion). Do not quote internal score points or factor values; describe them in words.",
    "Never write internal codes from the data (like no_frontline, vulnerable_to_poke, archetype_identity); say what they mean in plain words.",
    `Always answer in ${LANGUAGE[locale]}.`,
    "Keep answers short and scannable: bullet points, no filler, no introduction or conclusion paragraphs.",
  ].join("\n");
}

export interface PromptPick {
  championId: string;
  role: Role;
}

export interface AnalystPromptInput {
  locale: PromptLocale;
  /** Data Dragon id → champion name in the UI language. */
  names: Record<string, string>;
  draft: Record<DraftSide, { bans: string[]; picks: PromptPick[] }>;
  comparison: CompComparison;
  lanes: LaneResult[];
  comfort: ComfortResult[];
  winner?: DraftSide | null;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function describeComp(c: CompAnalysis): string[] {
  return [
    `  archetypes (0-10): ${c.archetypes
      .slice(0, 3)
      .map((a) => `${a.type} ${a.score}`)
      .join(", ")}`,
    `  damage: AD ${pct(c.damage.ad)}, AP ${pct(c.damage.ap)}${c.damageWarning ? ` (warning: ${c.damageWarning})` : ""}`,
    `  power curve (0-10): early ${c.powerCurve.early}, mid ${c.powerCurve.mid}, late ${c.powerCurve.late}`,
    `  profile (0-10): ${Object.entries(c.profile)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
    `  weaknesses: ${c.weaknesses.join(", ") || "none"}`,
    `  strengths: ${c.strengths.join(", ") || "none"}`,
  ];
}

/** The DATA block shared by the analyst prompt (and reused by the coach later). */
export function draftDataBlock(input: Omit<AnalystPromptInput, "winner">): string {
  const { locale, names, draft, comparison, lanes, comfort } = input;
  const n = (id: string) => names[id] ?? id;
  const lines: string[] = [];

  for (const side of ["blue", "red"] as const) {
    const label = SIDE_NAME[locale][side];
    const comp = side === "blue" ? comparison.a : comparison.b;
    const score = side === "blue" ? comparison.scores.a : comparison.scores.b;
    lines.push(`${label} (${side}):`);
    lines.push(`  bans: ${draft[side].bans.map(n).join(", ") || "none"}`);
    lines.push(`  picks: ${draft[side].picks.map((p) => `${ROLE_NAME[locale][p.role]} ${n(p.championId)}`).join(", ")}`);
    lines.push(...describeComp(comp));
    lines.push(
      `  draft score (0-100): ${score.score}; factors: ${score.factors
        .map((f) => `${f.code}${f.detail ? `:${f.detail}` : ""} ${f.points > 0 ? "+" : ""}${f.points}`)
        .join(", ")}`,
    );
  }

  const sideName = (s: "a" | "b" | "even") =>
    s === "even" ? "even" : SIDE_NAME[locale][s === "a" ? "blue" : "red"];
  lines.push("Comparison:");
  lines.push(`  favored: ${sideName(comparison.favored)}`);
  lines.push(
    `  archetype matchup: ${comparison.archetypeMatchup.a} (blue) vs ${comparison.archetypeMatchup.b} (red) → ${sideName(comparison.archetypeMatchup.winner)}`,
  );
  lines.push(
    `  stronger by phase: early ${sideName(comparison.phases.early)}, mid ${sideName(comparison.phases.mid)}, late ${sideName(comparison.phases.late)}`,
  );

  lines.push("Lane matchups (current patch, all ranks):");
  for (const lane of lanes) {
    const head = `  ${ROLE_NAME[locale][lane.role]}: ${n(lane.blue)} (${SIDE_NAME[locale].blue}) vs ${n(lane.red)} (${SIDE_NAME[locale].red})`;
    const m = lane.matchup;
    if (!m || m.winRateA === undefined) {
      lines.push(`${head}: no data`);
      continue;
    }
    const favored = m.winRateA >= 0.5 ? lane.blue : lane.red;
    const favoredRate = m.winRateA >= 0.5 ? m.winRateA : 1 - m.winRateA;
    const adv =
      m.laneAdvantage === "a" ? n(lane.blue) : m.laneAdvantage === "b" ? n(lane.red) : m.laneAdvantage === "even" ? "even" : null;
    lines.push(
      `${head}: ${n(favored)} wins ${pct(favoredRate)} of ${m.games ?? "?"} games${adv ? `; early lane advantage: ${adv}` : ""}`,
    );
  }

  if (comfort.length) {
    lines.push("Player comfort on the picked champion (0-100):");
    for (const c of comfort) {
      const who = `${c.player.gameName}#${c.player.tagLine}`;
      const body = c.error
        ? "could not fetch"
        : c.comfort === undefined
          ? "no recorded games on this champion"
          : `comfort ${c.comfort}, ${c.games} games, win rate ${pct(c.winRate ?? 0)}`;
      lines.push(`  ${SIDE_NAME[locale][c.side]} ${ROLE_NAME[locale][c.role]} ${n(c.championId)} (${who}): ${body}`);
    }
  }
  return lines.join("\n");
}

/** Prompt for the AI part of /api/analyze (items 3, 4, 6 and 7 of seção 8.3). */
export function buildAnalystPrompt(input: AnalystPromptInput): { system: string; prompt: string } {
  const h = ANALYST_HEADINGS[input.locale];
  const side = SIDE_NAME[input.locale];
  const sections = [
    `## ${h.winConditions}\n  For each team (${side.blue} and ${side.red}): 2-3 bullets on how it must play to win (timings, objectives, fight style).`,
    `## ${h.playAgainst}\n  For each team: 2-3 bullets on what it must avoid against the other comp.`,
    `## ${h.turningPoints}\n  3-4 bullets: the picks or bans that most shifted the balance and, for each, a better alternative and why (qualitative if not backed by the data).`,
  ];
  if (input.winner) {
    sections.push(
      `## ${h.result}\n  The match was won by ${side[input.winner]}. 2-3 bullets on whether the draft helps explain it. Do not claim causality: drafts give an edge, the game is decided by play.`,
    );
  }

  const prompt = [
    "Analyze this tournament draft. The rule-based overview, composition breakdown and lane matchups are already shown to the user; do NOT repeat them.",
    "Write ONLY these Markdown sections, with exactly these headings and in this order:",
    ...sections,
    "",
    "DATA:",
    draftDataBlock(input),
  ].join("\n");

  return { system: baseSystemPrompt(input.locale), prompt };
}
