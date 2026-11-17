"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ChampionIcon, useChampionName } from "@/components/champions/ChampionData";
import { ROLES, type PlayerResult, type Role } from "@/lib/data/types";

const TOP_CHAMPIONS = 6;

interface Props {
  gameName: string;
  tagLine: string;
  tagAssumed?: boolean;
  role: Role | null;
  onRoleChange: (role: Role | null) => void;
  result: PlayerResult | null;
  loading: boolean;
  now: number;
}

function comfortColor(comfort: number): string {
  if (comfort >= 70) return "bg-emerald-500";
  if (comfort >= 45) return "bg-amber-500";
  return "bg-zinc-400";
}

export function PlayerCard({ gameName, tagLine, tagAssumed, role, onRoleChange, result, loading, now }: Props) {
  const t = useTranslations("Team");
  const tRoles = useTranslations("Roles");
  const tTiers = useTranslations("Tiers");
  const format = useFormatter();
  const championName = useChampionName();
  const profile = result?.ok ? result.profile : null;

  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier);
  const pct = (x: number) => Math.round(x * 100);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <header className="flex flex-col gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold" title={`${gameName}#${tagLine}`}>
            {gameName}
            <span className="font-normal opacity-60">#{tagLine}</span>
            {tagAssumed && <span className="ml-1 text-amber-600" aria-hidden>*</span>}
          </h3>
          {profile && (
            <p className="text-sm">
              {profile.tier ? (
                <>
                  <strong>
                    {tierLabel(profile.tier)} {profile.division ?? ""}
                  </strong>
                  {profile.lp !== undefined && <> · {t("lp", { lp: profile.lp })}</>}
                  {profile.queue === "flex" && <span className="opacity-60"> ({t("flexQueue")})</span>}
                </>
              ) : (
                <span className="opacity-70">{t("unranked")}</span>
              )}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="opacity-70">{t("roleLabel")}</span>
          <select
            value={role ?? ""}
            onChange={(e) => onRoleChange((e.target.value || null) as Role | null)}
            className="rounded border border-black/20 bg-transparent px-1 py-0.5 text-sm dark:border-white/20"
          >
            <option value="">{t("noRole")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {loading && <p className="animate-pulse text-sm opacity-70">{t("loading")}</p>}

      {!loading && result && !result.ok && (
        <p role="alert" className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">
          {t(`errors.${result.error.code}`)}
        </p>
      )}

      {!loading && profile && (
        <>
          <div className="space-y-1 text-sm">
            {profile.wins !== undefined && profile.losses !== undefined && profile.wins + profile.losses > 0 && (
              <p>
                {t("record", {
                  wins: profile.wins,
                  losses: profile.losses,
                  rate: pct(profile.wins / (profile.wins + profile.losses)),
                })}
              </p>
            )}
            <p className="opacity-80">
              {profile.mainRoles.length
                ? t("mainRole", { roles: profile.mainRoles.map((r) => tRoles(r)).join(", ") })
                : t("noMainRole")}
            </p>
            <p className="opacity-80">
              {profile.recentForm.games > 0
                ? t("recentForm", {
                    games: profile.recentForm.games,
                    wins: profile.recentForm.wins,
                    losses: profile.recentForm.games - profile.recentForm.wins,
                    kda: format.number(profile.recentForm.kda, { maximumFractionDigits: 2 }),
                  })
                : t("noRecent")}
            </p>
          </div>

          <div>
            <h4 className="mb-1 flex items-center justify-between text-xs font-semibold uppercase opacity-70">
              <span>{t("topChampions")}</span>
              <span title={t("comfortHelp")} className="cursor-help underline decoration-dotted">
                {t("comfort")}
              </span>
            </h4>
            {profile.champions.length === 0 ? (
              <p className="text-sm opacity-70">{t("noChampions")}</p>
            ) : (
              <ul className="space-y-1.5">
                {profile.champions.slice(0, TOP_CHAMPIONS).map((c) => (
                  <li key={c.championId} className="flex items-center gap-2 text-sm">
                    <ChampionIcon id={c.championId} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-medium">{championName(c.championId)}</span>
                        <span className="shrink-0 tabular-nums">{c.comfort}</span>
                      </div>
                      <span className="my-0.5 block h-1 overflow-hidden rounded bg-black/10 dark:bg-white/10">
                        <span className={`block h-full ${comfortColor(c.comfort)}`} style={{ width: `${c.comfort}%` }} />
                      </span>
                      <span className="block truncate text-xs tabular-nums opacity-70">
                        {t("games", { count: c.games })} · {t("winRate", { rate: pct(c.winRate) })} ·{" "}
                        {t("kda", { kda: format.number(c.kda, { maximumFractionDigits: 2 }) })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {profile.sourceUpdatedAt && (
            <p className="text-xs opacity-60">
              {t("sourceUpdated", { ago: format.relativeTime(new Date(profile.sourceUpdatedAt), now) })}
            </p>
          )}
        </>
      )}
    </article>
  );
}
