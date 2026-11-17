"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useChampionName } from "@/components/champions/ChampionData";
import type { BanReason, PickReason } from "@/lib/draft/scoring";

/** Translated one-line text for a rule reason. */
export function useReasonText(): (r: BanReason | PickReason) => string {
  const t = useTranslations("Simulator.reasons");
  const tRoles = useTranslations("Roles");
  const tComp = useTranslations("Comp");
  const format = useFormatter();
  const name = useChampionName();
  const rate = (x: number) => format.number(x, { style: "percent", maximumFractionDigits: 1 });

  return (r) => {
    switch (r.code) {
      case "comfort":
      case "enemy_comfort":
        return t(r.code, { player: r.player, comfort: r.comfort });
      case "meta":
        return "role" in r ? t("meta_ban", { tier: r.tier, role: tRoles(r.role) }) : t("meta", { tier: r.tier });
      case "counters":
      case "countered":
      case "counters_yours":
        return t(r.code, { champion: name(r.championId), rate: rate(r.winRate) });
      case "balances_damage":
      case "same_damage":
        return t(r.code, { type: r.type });
      case "reinforces":
        return t("reinforces", { archetype: tComp(`archetypes.${r.archetype}`) });
      case "high_ban_rate":
        return t("high_ban_rate", { rate: rate(r.banRate) });
      default:
        return t(r.code);
    }
  };
}

export function ReasonList({ reasons, max = 3 }: { reasons: (BanReason | PickReason)[]; max?: number }) {
  const text = useReasonText();
  if (!reasons.length) return null;
  return <p className="text-xs opacity-80">{reasons.slice(0, max).map(text).join(" · ")}</p>;
}
