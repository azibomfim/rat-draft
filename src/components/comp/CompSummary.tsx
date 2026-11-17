"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useChampionName } from "@/components/champions/ChampionData";
import type { CompAnalysis, Phase } from "@/lib/comp/analyze";

const TOP_ARCHETYPES = 2;
const PHASES: Phase[] = ["early", "mid", "late"];

/** Text summary of one team's composition: archetypes, damage, power curve, weaknesses and strengths. */
export function CompSummary({ analysis, title }: { analysis: CompAnalysis; title?: string }) {
  const t = useTranslations("Comp");
  const format = useFormatter();
  const name = useChampionName();
  const pct = (x: number) => format.number(x, { style: "percent", maximumFractionDigits: 0 });

  if (analysis.champions.length === 0) {
    return <p className="text-sm opacity-70">{t("empty")}</p>;
  }

  return (
    <section className="space-y-3 text-sm">
      {title && <h3 className="font-semibold">{title}</h3>}

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{t("archetypeTitle")}</h4>
        <ul className="space-y-1">
          {analysis.archetypes.slice(0, TOP_ARCHETYPES).map((a, i) => (
            <li key={a.type} className="flex items-center gap-2">
              <span className={`w-36 shrink-0 ${i === 0 ? "font-semibold" : ""}`}>{t(`archetypes.${a.type}`)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-black/10 dark:bg-white/10">
                <span className="block h-full rounded bg-foreground/70" style={{ width: `${a.score * 10}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums">{format.number(a.score, { maximumFractionDigits: 1 })}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{t("damageTitle")}</h4>
        <div className="flex justify-between text-xs tabular-nums">
          <span>{t("ad", { pct: pct(analysis.damage.ad) })}</span>
          <span>{t("ap", { pct: pct(analysis.damage.ap) })}</span>
        </div>
        <div className="mt-1 flex h-2.5 gap-0.5 overflow-hidden rounded" aria-hidden>
          {analysis.damage.ad > 0 && <span className="h-full bg-dmg-ad" style={{ width: `${analysis.damage.ad * 100}%` }} />}
          {analysis.damage.ap > 0 && <span className="h-full flex-1 bg-dmg-ap" />}
        </div>
        {analysis.damageWarning && (
          <p className="mt-1 flex gap-1 text-amber-800 dark:text-amber-200">
            <span aria-hidden>⚠</span>
            {t(`damageWarnings.${analysis.damageWarning}`)}
          </p>
        )}
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{t("powerTitle")}</h4>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {PHASES.map((p) => (
            <div key={p} className="rounded bg-black/5 p-1.5 dark:bg-white/5">
              <dt className="text-xs opacity-70">{t(`phases.${p}`)}</dt>
              <dd className="font-semibold tabular-nums">{format.number(analysis.powerCurve[p], { maximumFractionDigits: 1 })}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{t("weaknessesTitle")}</h4>
          {analysis.weaknesses.length === 0 ? (
            <p className="opacity-60">{t("none")}</p>
          ) : (
            <ul className="space-y-1">
              {analysis.weaknesses.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <span aria-hidden className="text-red-600 dark:text-red-400">✕</span>
                  {t(`weaknesses.${w}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{t("strengthsTitle")}</h4>
          {analysis.strengths.length === 0 ? (
            <p className="opacity-60">{t("none")}</p>
          ) : (
            <ul className="space-y-1">
              {analysis.strengths.map((s) => (
                <li key={s} className="flex gap-1.5">
                  <span aria-hidden className="text-emerald-700 dark:text-emerald-400">✓</span>
                  {t(`strengths.${s}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {analysis.unknown.length > 0 && (
        <p className="text-xs opacity-60">{t("unknown", { names: analysis.unknown.map(name).join(", ") })}</p>
      )}
    </section>
  );
}
