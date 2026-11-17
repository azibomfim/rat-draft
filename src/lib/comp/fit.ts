/**
 * How well a champion fits a (partial) composition: covers weaknesses such as
 * missing frontline, engage or a damage type, and reinforces the comp's
 * archetype. Pure; used by the suggestion engine (seção 8.2).
 */
import type { Role } from "../data/types";
import { analyzeComp, COMP, type Archetype, type CompPick } from "./analyze";
import { getAttributes } from "./attributes";

export type FitReason =
  | { code: "adds_frontline" }
  | { code: "adds_engage" }
  | { code: "balances_damage"; type: "AD" | "AP" }
  | { code: "same_damage"; type: "AD" | "AP" }
  | { code: "adds_peel" }
  | { code: "protected_carry" }
  | { code: "adds_waveclear" }
  | { code: "reinforces"; archetype: Archetype };

export const FIT = {
  MIN: -10,
  MAX: 20,
  FRONTLINE: 6,
  ENGAGE: 5,
  BALANCE_DAMAGE: 5,
  SAME_DAMAGE: -6,
  PEEL: 4,
  PROTECTED_CARRY: 3,
  WAVECLEAR: 3,
  /** Points per archetype point gained by the top archetype (max ARCHETYPE_MAX). */
  ARCHETYPE_PER_POINT: 1.5,
  ARCHETYPE_MAX: 6,
  /** Team damage share from which the other damage type is "needed". */
  DAMAGE_SKEW: 0.7,
} as const;

export interface FitResult {
  points: number;
  reasons: FitReason[];
}

export function fitScore(team: CompPick[], championId: string, role?: Role): FitResult {
  const cand = getAttributes(championId);
  if (!cand) return { points: 0, reasons: [] };
  const members = team.map((p) => getAttributes(p.championId)).filter((a): a is NonNullable<typeof a> => !!a);
  const n = members.length;
  const sum = (k: "frontline" | "engage" | "peel" | "waveclear") => members.reduce((s, a) => s + a[k], 0);
  const reasons: FitReason[] = [];
  let points = 0;

  if (sum("frontline") < COMP.NO_FRONTLINE_BELOW && cand.frontline >= 2) {
    points += FIT.FRONTLINE;
    reasons.push({ code: "adds_frontline" });
  }
  if (sum("engage") < COMP.NO_ENGAGE_BELOW && cand.engage >= 2) {
    points += FIT.ENGAGE;
    reasons.push({ code: "adds_engage" });
  }

  // Damage balance.
  let ad = 0;
  let ap = 0;
  for (const a of members) {
    if (a.damageType === "AD") ad += 1;
    else if (a.damageType === "AP") ap += 1;
    else {
      ad += 0.5;
      ap += 0.5;
    }
  }
  if (n >= 2) {
    const adShare = ad / (ad + ap);
    if (adShare >= FIT.DAMAGE_SKEW && cand.damageType === "AP") {
      points += FIT.BALANCE_DAMAGE;
      reasons.push({ code: "balances_damage", type: "AP" });
    } else if (1 - adShare >= FIT.DAMAGE_SKEW && cand.damageType === "AD") {
      points += FIT.BALANCE_DAMAGE;
      reasons.push({ code: "balances_damage", type: "AD" });
    }
    const nextAd = ad + (cand.damageType === "AD" ? 1 : cand.damageType === "mixed" ? 0.5 : 0);
    const nextAp = ap + (cand.damageType === "AP" ? 1 : cand.damageType === "mixed" ? 0.5 : 0);
    const nextAdShare = nextAd / (nextAd + nextAp);
    if (n + 1 >= COMP.MIN_CHAMPIONS_FOR_WARNINGS) {
      if (nextAdShare > COMP.DAMAGE_WARNING_SHARE && cand.damageType === "AD") {
        points += FIT.SAME_DAMAGE;
        reasons.push({ code: "same_damage", type: "AD" });
      } else if (1 - nextAdShare > COMP.DAMAGE_WARNING_SHARE && cand.damageType === "AP") {
        points += FIT.SAME_DAMAGE;
        reasons.push({ code: "same_damage", type: "AP" });
      }
    }
  }

  const hasCarry = members.some((a) => a.tags.includes("hypercarry"));
  if (hasCarry && sum("peel") < COMP.NO_PEEL_FOR_CARRY_BELOW && cand.peel >= 2) {
    points += FIT.PEEL;
    reasons.push({ code: "adds_peel" });
  }
  if (cand.tags.includes("hypercarry") && sum("peel") >= 4) {
    points += FIT.PROTECTED_CARRY;
    reasons.push({ code: "protected_carry" });
  }
  if (n >= 3 && sum("waveclear") < COMP.LOW_WAVECLEAR_BELOW && cand.waveclear >= 3) {
    points += FIT.WAVECLEAR;
    reasons.push({ code: "adds_waveclear" });
  }

  // Archetype synergy: does it push the comp's identity further?
  if (n >= 1) {
    const before = analyzeComp(team).archetypes[0];
    const after = analyzeComp([...team, { championId, role }]).archetypes.find((a) => a.type === before.type);
    const gain = (after?.score ?? 0) - before.score;
    const bonus = Math.min(FIT.ARCHETYPE_MAX, Math.max(0, gain * FIT.ARCHETYPE_PER_POINT));
    if (bonus >= 1) {
      points += bonus;
      reasons.push({ code: "reinforces", archetype: before.type });
    }
  }

  return { points: Math.round(Math.min(FIT.MAX, Math.max(FIT.MIN, points))), reasons };
}
