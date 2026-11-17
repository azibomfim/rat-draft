"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChampionIcon, useChampionName } from "@/components/champions/ChampionData";
import type { Role } from "@/lib/data/types";
import type { PickSuggestion } from "@/lib/draft/scoring";
import type { SuggestResponse } from "@/lib/draft/sim-contract";
import { ReasonList } from "./ReasonList";

interface Props {
  action: "ban" | "pick";
  data?: SuggestResponse;
  loading: boolean;
  error: boolean;
  openRoles: Role[];
  /** Player per role, to label the tabs. */
  playerByRole: Partial<Record<Role, string>>;
  onChoose: (championId: string, role?: Role) => void;
  onExplain: () => void;
  explaining: boolean;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function SuggestionsPanel({ action, data, loading, error, openRoles, playerByRole, onChoose, onExplain, explaining }: Props) {
  const t = useTranslations("Simulator.suggestions");
  const tRoles = useTranslations("Roles");
  const name = useChampionName();
  const [tab, setTab] = useState<Role | null>(null);
  const activeRole = tab && openRoles.includes(tab) ? tab : openRoles[0];
  const explanations = data?.explanations ?? {};

  const pickParts = (p: PickSuggestion) =>
    [
      t("parts.comfort", { value: p.parts.comfort ?? t("noComfort") }),
      t("parts.meta", { value: p.parts.meta }),
      t("parts.counter", { value: signed(p.parts.counter) }),
      t("parts.fit", { value: signed(p.parts.fit) }),
    ].join(" · ");

  return (
    <section className="rounded-lg border border-black/10 p-3 dark:border-white/15" aria-busy={loading}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{action === "ban" ? t("ban") : t("pick")}</h3>
        <button
          type="button"
          onClick={onExplain}
          disabled={loading || explaining || !data}
          className="rounded border border-black/20 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/20"
        >
          {explaining ? t("explaining") : t("explain")}
        </button>
      </div>

      {data?.ai === "unavailable" && <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">{t("aiUnavailable")}</p>}
      {data?.ai === "error" && <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">{t("aiError")}</p>}

      {action === "pick" && openRoles.length > 0 && (
        <div role="tablist" className="mb-2 flex flex-wrap gap-1 text-xs">
          {openRoles.map((r) => (
            <button
              key={r}
              role="tab"
              type="button"
              aria-selected={r === activeRole}
              onClick={() => setTab(r)}
              className="rounded border border-black/20 px-2 py-1 aria-selected:bg-foreground aria-selected:text-background dark:border-white/20"
            >
              {tRoles(r)}
              {playerByRole[r] && <span className="opacity-70"> · {playerByRole[r]}</span>}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="h-40 animate-pulse rounded bg-black/5 dark:bg-white/5" />}
      {error && !loading && <p className="text-sm text-red-700 dark:text-red-300">{t("error")}</p>}

      {data && !loading && action === "ban" && (
        <ul className="space-y-1.5">
          {(data.bans ?? []).map((b) => (
            <li key={b.championId}>
              <button
                type="button"
                onClick={() => onChoose(b.championId)}
                className="flex w-full items-start gap-2 rounded p-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChampionIcon id={b.championId} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{name(b.championId)}</span>
                    <span className="tabular-nums opacity-70">{t("total", { value: b.total })}</span>
                  </span>
                  <ReasonList reasons={b.reasons} />
                  {explanations[b.championId] && <span className="block text-xs italic">{explanations[b.championId]}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && !loading && action === "pick" && activeRole && (
        <ul className="space-y-1.5">
          {(data.picks?.[activeRole] ?? []).length === 0 && <li className="text-sm opacity-60">{t("none")}</li>}
          {(data.picks?.[activeRole] ?? []).map((p) => (
            <li key={p.championId}>
              <button
                type="button"
                onClick={() => onChoose(p.championId, p.role)}
                className="flex w-full items-start gap-2 rounded p-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChampionIcon id={p.championId} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{name(p.championId)}</span>
                    <span className="tabular-nums opacity-70">{t("total", { value: p.total })}</span>
                  </span>
                  <span className="block text-xs tabular-nums opacity-70">{pickParts(p)}</span>
                  <ReasonList reasons={p.reasons} />
                  {explanations[p.championId] && <span className="block text-xs italic">{explanations[p.championId]}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
