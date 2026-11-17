"use client";

import { useTranslations } from "next-intl";
import { ChampionIcon, useChampionName } from "@/components/champions/ChampionData";
import { ROLES } from "@/lib/data/types";
import type { TeamAlert, TeamSummary } from "@/lib/team-summary";

const POOL_PREVIEW = 8;

interface Props {
  summary: TeamSummary;
  /** playerKey → display name */
  playerNames: Record<string, string>;
}

export function TeamSummaryPanel({ summary, playerNames }: Props) {
  const t = useTranslations("Team");
  const tRoles = useTranslations("Roles");
  const championName = useChampionName();

  const alertText = (a: TeamAlert) => {
    const role = tRoles(a.role);
    switch (a.code) {
      case "missing_role":
      case "duplicate_role":
        return t(`alerts.${a.code}`, { role });
      case "shallow_pool":
        return t("alerts.shallow_pool", { role, count: a.count });
      case "one_trick":
        return t("alerts.one_trick", { role, champion: championName(a.championId), share: Math.round(a.share * 100) });
    }
  };

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="mb-3 text-lg font-semibold">{t("summaryTitle")}</h2>

      {summary.alerts.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {summary.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 rounded bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-200">
              <span aria-hidden>⚠</span>
              {alertText(a)}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase opacity-70">{t("poolByRole")}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((role) => {
          const entries = summary.poolByRole[role];
          return (
            <div key={role} className="rounded bg-black/5 p-2 dark:bg-white/5">
              <p className="text-sm font-semibold">{tRoles(role)}</p>
              {entries.length === 0 ? (
                <p className="text-xs opacity-60">{t("nobody")}</p>
              ) : (
                entries.map((e) => (
                  <div key={e.playerKey} className="mt-1">
                    <p className="truncate text-xs opacity-70">{playerNames[e.playerKey]}</p>
                    {e.champions.length === 0 ? (
                      <p className="text-xs opacity-60">{t("noComfortPicks")}</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.champions.slice(0, POOL_PREVIEW).map((c) => (
                          <span key={c.championId} title={`${championName(c.championId)} · ${c.comfort}`}>
                            <ChampionIcon id={c.championId} size={24} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
