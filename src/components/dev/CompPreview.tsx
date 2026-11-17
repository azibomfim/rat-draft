"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useChampionData } from "@/components/champions/ChampionData";
import { CompRadar } from "@/components/comp/CompRadar";
import { CompSummary } from "@/components/comp/CompSummary";
import { analyzeComp, type CompPick } from "@/lib/comp/analyze";
import { ChampionIndex } from "@/lib/data/champion-id";
import { ROLES } from "@/lib/data/types";

export function CompPreview() {
  const t = useTranslations("Dev");
  const { names } = useChampionData();
  const index = useMemo(() => new ChampionIndex(Object.entries(names).map(([id, name]) => ({ id, name }))), [names]);
  const [textA, setTextA] = useState("Malphite, Sejuani, Orianna, Miss Fortune, Leona");
  const [textB, setTextB] = useState("Jayce, Nidalee, Xerath, Ezreal, Karma");

  const toPicks = (text: string): CompPick[] =>
    text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((s, i) => ({ championId: index.resolve(s) ?? s, role: ROLES[i] }));

  const picksA = toPicks(textA);
  const picksB = toPicks(textB);
  const a = analyzeComp(picksA, picksB);
  const b = analyzeComp(picksB, picksA);

  const input = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex flex-1 flex-col text-sm">
      <span className="opacity-70">{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20" />
    </label>
  );

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{t("compTitle")}</h2>
      <p className="text-xs opacity-60">{t("teamHelp")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {input(t("teamA"), textA, setTextA)}
        {input(t("teamB"), textB, setTextB)}
      </div>
      <div className="grid gap-4 rounded-lg border border-black/10 p-4 lg:grid-cols-3 dark:border-white/15">
        <CompRadar teams={[{ label: t("teamA"), analysis: a }, { label: t("teamB"), analysis: b }]} />
        <CompSummary title={t("teamA")} analysis={a} />
        <CompSummary title={t("teamB")} analysis={b} />
      </div>
    </section>
  );
}
