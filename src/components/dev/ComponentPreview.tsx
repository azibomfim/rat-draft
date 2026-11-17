"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useChampionData } from "@/components/champions/ChampionData";
import { ChampionCard } from "@/components/champions/ChampionCard";
import { MatchupPanel } from "@/components/champions/MatchupPanel";
import { ROLES, type Role } from "@/lib/data/types";
import { CompPreview } from "./CompPreview";

export function ComponentPreview() {
  const t = useTranslations("Dev");
  const tRoles = useTranslations("Roles");
  const { names } = useChampionData();
  const options = Object.entries(names).sort((x, y) => x[1].localeCompare(y[1]));
  const [a, setA] = useState("Darius");
  const [b, setB] = useState("Vayne");
  const [role, setRole] = useState<Role>("top");

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex flex-col text-sm">
      <span className="opacity-70">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20">
        {options.map(([id, name]) => (
          <option key={id} value={id}>{name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm opacity-70">{t("note")}</p>
      <div className="flex flex-wrap gap-3">
        {select(a, setA, t("champion"))}
        {select(b, setB, t("opponent"))}
        <label className="flex flex-col text-sm">
          <span className="opacity-70">{t("role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20">
            {ROLES.map((r) => <option key={r} value={r}>{tRoles(r)}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <ChampionCard championId={a} role={role} />
        <MatchupPanel role={role} a={a} b={b} />
      </div>
      <CompPreview />
    </div>
  );
}
