"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ApiErrorMessage } from "@/components/ApiErrorMessage";
import type { ChampionMeta, MatchupStat, Role } from "@/lib/data/types";
import { useApi } from "@/lib/use-api";
import { ChampionIcon, useChampionName } from "./ChampionData";

const LIST_SIZE = 5;
function usePercent(): (x: number) => string {
  const format = useFormatter();
  return (x) => format.number(x, { style: "percent", maximumFractionDigits: 1 });
}

/** Fetches /api/champion and shows the champion's meta in a role. */
export function ChampionCard({ championId, role }: { championId: string; role: Role }) {
  const url = `/api/champion?${new URLSearchParams({ id: championId, role })}`;
  const { data, error, loading, retry } = useApi<ChampionMeta>(url);
  return <ChampionCardView championId={championId} role={role} meta={data} loading={loading} error={error} onRetry={retry} />;
}

interface ViewProps {
  championId: string;
  role: Role;
  meta?: ChampionMeta;
  loading?: boolean;
  error?: { code: string };
  onRetry?: () => void;
}

export function ChampionCardView({ championId, role, meta, loading, error, onRetry }: ViewProps) {
  const t = useTranslations("Champion");
  const tRoles = useTranslations("Roles");
  const name = useChampionName();
  const pct = usePercent();

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <header className="flex items-center gap-3">
        <ChampionIcon id={championId} size={48} />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{name(championId)}</h3>
          <p className="text-sm opacity-70">
            {tRoles(role)}
            {meta?.tier && (
              <>
                {" · "}
                <span title={t("tierHelp")} className="cursor-help underline decoration-dotted">
                  {t("tier", { tier: meta.tier })}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {loading && <div className="h-40 animate-pulse rounded bg-black/5 dark:bg-white/5" aria-busy="true" />}
      {error && !loading && <ApiErrorMessage error={error} onRetry={onRetry} />}

      {meta && !loading && (
        <>
          {meta.offRole && (
            <p className="rounded bg-amber-500/10 px-2 py-1 text-sm text-amber-800 dark:text-amber-200">{t("offRole")}</p>
          )}
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["winRate", meta.winRate],
                ["pickRate", meta.pickRate],
                ["banRate", meta.banRate],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded bg-black/5 p-2 dark:bg-white/5">
                <dt className="text-xs opacity-70">{t(key)}</dt>
                <dd className="text-lg font-semibold tabular-nums">{pct(value)}</dd>
              </div>
            ))}
          </dl>
          {meta.roleRate !== undefined && !meta.offRole && (
            <p className="text-xs opacity-60">{t("roleRate", { rate: Math.round(meta.roleRate * 100) })}</p>
          )}

          <StatList title={t("counters")} help={t("countersHelp")} items={meta.counters} />
          <StatList title={t("goodAgainst")} help={t("goodAgainstHelp")} items={meta.goodAgainst} />
          <StatList
            title={t("synergies")}
            help={t("synergiesHelp")}
            items={meta.synergies}
            suffix={(s) => ("role" in s && s.role ? tRoles(s.role as Role) : null)}
          />
        </>
      )}
    </article>
  );
}

function StatList({
  title,
  help,
  items,
  suffix,
}: {
  title: string;
  help: string;
  items: MatchupStat[];
  suffix?: (item: MatchupStat) => string | null;
}) {
  const t = useTranslations("Champion");
  const name = useChampionName();
  const pct = usePercent();
  return (
    <section>
      <h4 className="mb-1 text-xs font-semibold uppercase opacity-70" title={help}>
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm opacity-60">{t("none")}</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, LIST_SIZE).map((c) => (
            <li key={`${c.championId}-${suffix?.(c) ?? ""}`} className="flex items-center gap-2 text-sm">
              <ChampionIcon id={c.championId} size={24} />
              <span className="min-w-0 flex-1 truncate">
                {name(c.championId)}
                {suffix?.(c) && <span className="opacity-60"> · {suffix(c)}</span>}
              </span>
              <span className="tabular-nums">{pct(c.winRate)}</span>
              {c.games !== undefined && (
                <span className="hidden w-20 text-right text-xs tabular-nums opacity-60 sm:inline">
                  {t("games", { count: c.games })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
