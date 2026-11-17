/**
 * Rule engine for team compositions (seção 7). Pure and deterministic: the AI
 * only uses this output as context. All thresholds live in the constants below
 * so they are easy to tune.
 */
import type { Role } from "../data/types";
import { ATTRIBUTE_KEYS, getAttributes, type AttributeKey, type ChampionAttributes } from "./attributes";

export const ARCHETYPES = ["engage", "poke", "pick", "protect", "splitpush", "dive", "skirmish"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const WEAKNESS_CODES = [
  "no_frontline",
  "no_engage",
  "low_waveclear",
  "single_damage_type",
  "no_peel_for_carry",
  "vulnerable_to_poke",
] as const;
export type WeaknessCode = (typeof WEAKNESS_CODES)[number];

export const STRENGTH_CODES = [
  "strong_frontline",
  "strong_engage",
  "strong_peel",
  "strong_cc",
  "strong_waveclear",
  "high_mobility",
  "objective_control",
  "balanced_damage",
  "strong_early",
  "strong_late",
] as const;
export type StrengthCode = (typeof STRENGTH_CODES)[number];

export type Profile = Record<AttributeKey, number>;
export type Phase = "early" | "mid" | "late";

export interface CompPick {
  championId: string;
  role?: Role;
}

export interface CompAnalysis {
  /** Share of damage weight, 0–1. */
  damage: { ad: number; ap: number; true?: number };
  damageWarning?: "full_ad" | "full_ap";
  /** Team sum per attribute, normalized to 0–10 (10 = 5 champions at 3). */
  profile: Profile;
  /** Sorted, strongest first. score 0–10. */
  archetypes: { type: Archetype; score: number }[];
  /** 0–10 */
  powerCurve: Record<Phase, number>;
  weaknesses: WeaknessCode[];
  strengths: StrengthCode[];
  /** Champions analyzed / without attribute data (ignored). */
  champions: string[];
  unknown: string[];
}

/* ------------------------------------------------------------------ */
/* Constants (ponto de partida — ajuste à vontade)                     */
/* ------------------------------------------------------------------ */

export const COMP = {
  TEAM_SIZE: 5,
  MAX_ATTRIBUTE: 3,
  /** Warnings and weaknesses only make sense with a few champions in. */
  MIN_CHAMPIONS_FOR_WARNINGS: 3,
  /** More than this share of one damage type → full_ad / full_ap. */
  DAMAGE_WARNING_SHARE: 0.8,
  /** Both types at least this share → balanced_damage strength. */
  BALANCED_DAMAGE_SHARE: 0.35,

  /** Weaknesses: team totals (raw sums, 0–15) below these. */
  NO_FRONTLINE_BELOW: 3,
  NO_ENGAGE_BELOW: 3,
  LOW_WAVECLEAR_BELOW: 4,
  NO_PEEL_FOR_CARRY_BELOW: 3,
  /** Own mobility total below this AND enemy is poke → vulnerable_to_poke. */
  LOW_MOBILITY_BELOW: 6,
  /** Enemy poke archetype score at or above this counts as "poke team". */
  ENEMY_POKE_ARCHETYPE_MIN: 6,

  /** Strengths: team totals (raw sums) at or above these. */
  STRONG_FRONTLINE_MIN: 7,
  STRONG_ENGAGE_MIN: 9,
  STRONG_PEEL_MIN: 8,
  STRONG_CC_MIN: 11,
  STRONG_WAVECLEAR_MIN: 12,
  HIGH_MOBILITY_MIN: 11,
  OBJECTIVE_CONTROL_MIN: 10,
  /** Power curve phase score (0–10) at or above this → strong_early/late. */
  STRONG_PHASE_MIN: 7.5,

  /** Scaling → weight per phase (early, mid, late). */
  SCALING_WEIGHTS: {
    early: { early: 3, mid: 2, late: 1 },
    mid: { early: 2, mid: 3, late: 2 },
    late: { early: 1, mid: 2, late: 3 },
  },
} as const;

/**
 * Archetype formulas. Each champion contributes `perChampion(attrs, role)`;
 * the team sum is normalized by `full` (the sum of a fully committed comp) to 0–10.
 */
export const ARCHETYPE_RULES: Record<
  Archetype,
  { full: number; perChampion: (a: ChampionAttributes, role?: Role) => number }
> = {
  // engage = engage + cc + frontline (engage weighs most) + tag
  engage: {
    full: 34,
    perChampion: (a) => 1.5 * a.engage + 0.5 * a.cc + 0.5 * a.frontline + tag(a, "engage"),
  },
  // poke = poke + being ranged (+ a bit of waveclear to siege)
  poke: {
    full: 28,
    perChampion: (a) => 1.5 * a.poke + (a.range === "ranged" ? 0.5 : 0) + 0.25 * a.waveclear + tag(a, "poke"),
  },
  pick: {
    full: 20,
    perChampion: (a) => 0.5 * a.cc + 0.5 * a.mobility + 2 * tag(a, "pick"),
  },
  // protect = peel (+ disengage); boosted by a hypercarry, halved without one (see analyzeComp)
  protect: {
    full: 28,
    perChampion: (a) => 1.5 * a.peel + 0.5 * a.disengage + 1.5 * tag(a, "protect") + tag(a, "enchanter"),
  },
  // splitpush counts high splitpush on top/mid much more than elsewhere
  splitpush: {
    full: 18,
    perChampion: (a, role) => {
      const sideLane = role ? role === "top" || role === "mid" : a.roles.includes("top") || a.roles.includes("mid");
      return (sideLane ? 2 : 0.75) * a.splitpush + tag(a, "splitpush");
    },
  },
  dive: {
    full: 24,
    perChampion: (a) => 0.5 * a.engage + a.mobility + 1.5 * tag(a, "dive"),
  },
  skirmish: {
    full: 22,
    perChampion: (a) =>
      0.5 * a.mobility + (a.damageProfile === "sustained" ? 1 : 0.5) + 1.5 * tag(a, "skirmish"),
  },
};

/** Bonus to protect when the team has a hypercarry; multiplier when it has none. */
export const PROTECT_HYPERCARRY_BONUS = 5;
export const PROTECT_WITHOUT_CARRY_FACTOR = 0.5;

/**
 * Archetype matchups: [winner, loser]. A starting point; tune freely.
 * engage > poke, poke > protect, pick > splitpush (from the spec) and a few more.
 */
export const ARCHETYPE_ADVANTAGES: readonly [Archetype, Archetype][] = [
  ["engage", "poke"],
  ["poke", "protect"],
  ["pick", "splitpush"],
  ["protect", "dive"],
  ["dive", "poke"],
  ["splitpush", "engage"],
  ["engage", "skirmish"],
  ["skirmish", "splitpush"],
  ["pick", "poke"],
  ["protect", "pick"],
];

/* ------------------------------------------------------------------ */

function tag(a: ChampionAttributes, t: ChampionAttributes["tags"][number]): number {
  return a.tags.includes(t) ? 1 : 0;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

interface Resolved {
  pick: CompPick;
  attrs: ChampionAttributes;
}

function resolve(picks: CompPick[]): { resolved: Resolved[]; unknown: string[] } {
  const resolved: Resolved[] = [];
  const unknown: string[] = [];
  for (const pick of picks.slice(0, COMP.TEAM_SIZE)) {
    const attrs = getAttributes(pick.championId);
    if (attrs) resolved.push({ pick, attrs });
    else unknown.push(pick.championId);
  }
  return { resolved, unknown };
}

function sums(resolved: Resolved[]): Profile {
  const total = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0])) as Profile;
  for (const { attrs } of resolved) for (const k of ATTRIBUTE_KEYS) total[k] += attrs[k];
  return total;
}

function archetypeScores(resolved: Resolved[]): { type: Archetype; score: number }[] {
  const hasCarry = resolved.some((r) => r.attrs.tags.includes("hypercarry"));
  return ARCHETYPES.map((type) => {
    const rule = ARCHETYPE_RULES[type];
    let raw = resolved.reduce((s, r) => s + rule.perChampion(r.attrs, r.pick.role), 0);
    if (type === "protect") raw = hasCarry ? raw + PROTECT_HYPERCARRY_BONUS : raw * PROTECT_WITHOUT_CARRY_FACTOR;
    return { type, score: round1(clamp((raw / rule.full) * 10, 0, 10)) };
  }).sort((a, b) => b.score - a.score || ARCHETYPES.indexOf(a.type) - ARCHETYPES.indexOf(b.type));
}

/** Analyzes one team (up to 5 picks). Pass the enemy to enable matchup-aware weaknesses. */
export function analyzeComp(team: CompPick[], enemy?: CompPick[]): CompAnalysis {
  const { resolved, unknown } = resolve(team);
  const n = resolved.length;
  const total = sums(resolved);
  const maxSum = COMP.TEAM_SIZE * COMP.MAX_ATTRIBUTE;

  // Damage: AD = 1, AP = 1, mixed = 0.5 each.
  let ad = 0;
  let ap = 0;
  for (const { attrs } of resolved) {
    if (attrs.damageType === "AD") ad += 1;
    else if (attrs.damageType === "AP") ap += 1;
    else {
      ad += 0.5;
      ap += 0.5;
    }
  }
  const dmgTotal = ad + ap;
  const damage = { ad: dmgTotal ? round3(ad / dmgTotal) : 0, ap: dmgTotal ? round3(ap / dmgTotal) : 0 };
  const enough = n >= COMP.MIN_CHAMPIONS_FOR_WARNINGS;
  const damageWarning =
    enough && damage.ad > COMP.DAMAGE_WARNING_SHARE
      ? ("full_ad" as const)
      : enough && damage.ap > COMP.DAMAGE_WARNING_SHARE
        ? ("full_ap" as const)
        : undefined;

  const profile = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, round1((total[k] / maxSum) * 10)])) as Profile;
  const archetypes = archetypeScores(resolved);

  // Power curve: average phase weight (1–3) → 0–10.
  const powerCurve: Record<Phase, number> = { early: 0, mid: 0, late: 0 };
  if (n > 0) {
    for (const phase of ["early", "mid", "late"] as const) {
      const avg = resolved.reduce((s, r) => s + COMP.SCALING_WEIGHTS[r.attrs.scaling][phase], 0) / n;
      powerCurve[phase] = round1((avg / 3) * 10);
    }
  }

  const weaknesses: WeaknessCode[] = [];
  const strengths: StrengthCode[] = [];
  if (enough) {
    if (total.frontline < COMP.NO_FRONTLINE_BELOW) weaknesses.push("no_frontline");
    if (total.engage < COMP.NO_ENGAGE_BELOW) weaknesses.push("no_engage");
    if (total.waveclear < COMP.LOW_WAVECLEAR_BELOW) weaknesses.push("low_waveclear");
    if (damageWarning) weaknesses.push("single_damage_type");
    const hasCarry = resolved.some((r) => r.attrs.tags.includes("hypercarry"));
    if (hasCarry && total.peel < COMP.NO_PEEL_FOR_CARRY_BELOW) weaknesses.push("no_peel_for_carry");
    if (enemy && enemy.length) {
      const enemyPoke = archetypeScores(resolve(enemy).resolved).find((a) => a.type === "poke")?.score ?? 0;
      if (enemyPoke >= COMP.ENEMY_POKE_ARCHETYPE_MIN && total.mobility < COMP.LOW_MOBILITY_BELOW) {
        weaknesses.push("vulnerable_to_poke");
      }
    }

    if (total.frontline >= COMP.STRONG_FRONTLINE_MIN) strengths.push("strong_frontline");
    if (total.engage >= COMP.STRONG_ENGAGE_MIN) strengths.push("strong_engage");
    if (total.peel >= COMP.STRONG_PEEL_MIN) strengths.push("strong_peel");
    if (total.cc >= COMP.STRONG_CC_MIN) strengths.push("strong_cc");
    if (total.waveclear >= COMP.STRONG_WAVECLEAR_MIN) strengths.push("strong_waveclear");
    if (total.mobility >= COMP.HIGH_MOBILITY_MIN) strengths.push("high_mobility");
    if (total.objectiveControl >= COMP.OBJECTIVE_CONTROL_MIN) strengths.push("objective_control");
    if (damage.ad >= COMP.BALANCED_DAMAGE_SHARE && damage.ap >= COMP.BALANCED_DAMAGE_SHARE) {
      strengths.push("balanced_damage");
    }
    if (powerCurve.early >= COMP.STRONG_PHASE_MIN) strengths.push("strong_early");
    if (powerCurve.late >= COMP.STRONG_PHASE_MIN) strengths.push("strong_late");
  }

  return {
    damage,
    ...(damageWarning ? { damageWarning } : {}),
    profile,
    archetypes,
    powerCurve,
    weaknesses,
    strengths,
    champions: resolved.map((r) => r.pick.championId),
    unknown,
  };
}

/* ------------------------------------------------------------------ */
/* Two-team comparison                                                 */
/* ------------------------------------------------------------------ */

export type Side = "a" | "b" | "even";

export type FactorCode =
  | "archetype_identity"
  | "archetype_matchup"
  | "weakness"
  | "strength"
  | "damage_balance"
  | "phase";

export interface ScoreFactor {
  code: FactorCode;
  /** Points added to (or removed from) the base score. */
  points: number;
  /** Weakness/strength code, archetype or phase the factor refers to. */
  detail?: string;
}

export interface SideScore {
  /** 0–100 */
  score: number;
  factors: ScoreFactor[];
}

export interface CompComparison {
  a: CompAnalysis;
  b: CompAnalysis;
  phases: Record<Phase, Side>;
  archetypeMatchup: { a: Archetype; b: Archetype; winner: Side };
  scores: { a: SideScore; b: SideScore };
  /** Who came out ahead in the draft. */
  favored: Side;
}

export const SCORE = {
  BASE: 50,
  /** Points per archetype point above 5 for the top archetype (identity). */
  IDENTITY_PER_POINT: 2,
  ARCHETYPE_MATCHUP: 8,
  PER_WEAKNESS: -6,
  MAX_WEAKNESS_PENALTY: -24,
  PER_STRENGTH: 3,
  MAX_STRENGTH_BONUS: 12,
  DAMAGE_WARNING: -8,
  PER_PHASE_WON: 3,
  /** Phase scores within this margin are "even". */
  PHASE_MARGIN: 0.5,
  /** Final scores within this margin → favored "even". */
  FAVORED_MARGIN: 3,
} as const;

export function archetypeWinner(a: Archetype, b: Archetype): Side {
  if (ARCHETYPE_ADVANTAGES.some(([w, l]) => w === a && l === b)) return "a";
  if (ARCHETYPE_ADVANTAGES.some(([w, l]) => w === b && l === a)) return "b";
  return "even";
}

function sideScore(own: CompAnalysis, matchup: Side, me: "a" | "b", phases: Record<Phase, Side>): SideScore {
  const factors: ScoreFactor[] = [];
  const top = own.archetypes[0];
  if (top) {
    factors.push({ code: "archetype_identity", points: round1((top.score - 5) * SCORE.IDENTITY_PER_POINT), detail: top.type });
  }
  if (matchup !== "even") {
    factors.push({
      code: "archetype_matchup",
      points: matchup === me ? SCORE.ARCHETYPE_MATCHUP : -SCORE.ARCHETYPE_MATCHUP,
      detail: top?.type,
    });
  }
  let weaknessPoints = 0;
  for (const w of own.weaknesses) {
    if (w === "single_damage_type") continue; // counted as damage_balance
    const points = Math.max(SCORE.PER_WEAKNESS, SCORE.MAX_WEAKNESS_PENALTY - weaknessPoints);
    if (points === 0) break;
    weaknessPoints += points;
    factors.push({ code: "weakness", points, detail: w });
  }
  let strengthPoints = 0;
  for (const s of own.strengths) {
    const points = Math.min(SCORE.PER_STRENGTH, SCORE.MAX_STRENGTH_BONUS - strengthPoints);
    if (points === 0) break;
    strengthPoints += points;
    factors.push({ code: "strength", points, detail: s });
  }
  if (own.damageWarning) factors.push({ code: "damage_balance", points: SCORE.DAMAGE_WARNING, detail: own.damageWarning });
  for (const phase of ["early", "mid", "late"] as const) {
    if (phases[phase] === me) factors.push({ code: "phase", points: SCORE.PER_PHASE_WON, detail: phase });
  }
  const score = Math.round(clamp(SCORE.BASE + factors.reduce((s, f) => s + f.points, 0), 0, 100));
  return { score, factors };
}

/** Compares two teams: phases, archetype matchup and a 0–100 score per side. */
export function compareComps(teamA: CompPick[], teamB: CompPick[]): CompComparison {
  const a = analyzeComp(teamA, teamB);
  const b = analyzeComp(teamB, teamA);

  const phases = {} as Record<Phase, Side>;
  for (const phase of ["early", "mid", "late"] as const) {
    const diff = a.powerCurve[phase] - b.powerCurve[phase];
    phases[phase] = Math.abs(diff) <= SCORE.PHASE_MARGIN ? "even" : diff > 0 ? "a" : "b";
  }

  const topA = a.archetypes[0]?.type ?? "engage";
  const topB = b.archetypes[0]?.type ?? "engage";
  const winner = archetypeWinner(topA, topB);

  const scores = { a: sideScore(a, winner, "a", phases), b: sideScore(b, winner, "b", phases) };
  const diff = scores.a.score - scores.b.score;
  const favored: Side = Math.abs(diff) <= SCORE.FAVORED_MARGIN ? "even" : diff > 0 ? "a" : "b";

  return { a, b, phases, archetypeMatchup: { a: topA, b: topB, winner }, scores, favored };
}
