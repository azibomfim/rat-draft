"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiErrorMessage } from "@/components/ApiErrorMessage";
import type { LaneMatchup, LaneSide, PowerPoint, Role } from "@/lib/data/types";
import { useApi } from "@/lib/use-api";
import { ChampionIcon, useChampionName } from "./ChampionData";

/** Locale-aware percentage with one decimal ("50,8%" in PT). */
function usePercent(): (x: number) => string {
  const format = useFormatter();
  return (x) => format.number(x, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
/** Y-axis tick step for the power curve (2 percentage points). */
const TICK_STEP = 0.02;
/** Win-rate difference between first and last bucket that counts as a spike. */
const SPIKE_DELTA = 0.03;

/** Fetches /api/matchup and shows the lane matchup from A's point of view. */
export function MatchupPanel({ role, a, b }: { role: Role; a: string; b: string }) {
  const url = a && b && a !== b ? `/api/matchup?${new URLSearchParams({ role, a, b })}` : null;
  const { data, error, loading, retry } = useApi<LaneMatchup>(url);
  return <MatchupPanelView a={a} b={b} matchup={data} loading={loading} error={error} onRetry={retry} />;
}

interface ViewProps {
  a: string;
  b: string;
  matchup?: LaneMatchup;
  loading?: boolean;
  error?: { code: string };
  onRetry?: () => void;
}

export function MatchupPanelView({ a, b, matchup, loading, error, onRetry }: ViewProps) {
  const t = useTranslations("Matchup");
  const name = useChampionName();
  const pct = usePercent();

  const sideLabel = (side?: LaneSide) =>
    side === "a" ? name(a) : side === "b" ? name(b) : side === "even" ? t("even") : null;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <header className="flex items-center gap-2">
        <ChampionIcon id={a} size={40} />
        <h3 className="flex-1 text-center text-lg font-semibold">{t("title", { a: name(a), b: name(b) })}</h3>
        <ChampionIcon id={b} size={40} />
      </header>

      {loading && <div className="h-56 animate-pulse rounded bg-black/5 dark:bg-white/5" aria-busy="true" />}
      {error && !loading && <ApiErrorMessage error={error} onRetry={onRetry} />}

      {matchup && !loading && (
        <>
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{t("estimate")}</h4>
            {matchup.winRateA !== undefined ? (
              <>
                <WinRateBar a={name(a)} b={name(b)} winRateA={matchup.winRateA} />
                <p className="mt-1 text-sm">
                  {t("estimateValue", {
                    champion: matchup.winRateA >= 0.5 ? name(a) : name(b),
                    rate: pct(matchup.winRateA >= 0.5 ? matchup.winRateA : 1 - matchup.winRateA),
                  })}
                  {matchup.games !== undefined && <span className="opacity-60"> · {t("sample", { count: matchup.games })}</span>}
                </p>
              </>
            ) : (
              <p className="text-sm opacity-70">{t("noSample")}</p>
            )}
          </section>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            {sideLabel(matchup.laneAdvantage) && (
              <Fact label={t("laneAdvantage")} value={sideLabel(matchup.laneAdvantage)!} />
            )}
            {sideLabel(matchup.soloKillAdvantage) && (
              <Fact label={t("soloKill")} value={sideLabel(matchup.soloKillAdvantage)!} />
            )}
            {matchup.playStyleA && (
              <Fact label={`${t("style")} · ${name(a)}`} value={t(`styles.${matchup.playStyleA}`)} />
            )}
          </dl>

          {(matchup.powerCurve.a.length > 0 || matchup.powerCurve.b.length > 0) && (
            <PowerCurve a={a} b={b} curve={matchup.powerCurve} />
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <Tips title={t("tipsFor", { champion: name(a) })} tips={matchup.tips} />
            <Tips title={t("tipsFor", { champion: name(b) })} tips={matchup.tipsB} />
            {matchup.tipsLang === "en" && (matchup.tips.length > 0 || matchup.tipsB.length > 0) && (
              <p className="text-xs opacity-60 sm:col-span-2">{t("tipsEnglish")}</p>
            )}
          </section>
        </>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-black/5 p-2 dark:bg-white/5">
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function WinRateBar({ a, b, winRateA }: { a: string; b: string; winRateA: number }) {
  const pct = usePercent();
  const width = Math.min(100, Math.max(0, winRateA * 100));
  return (
    <div>
      <div className="flex justify-between text-xs tabular-nums">
        <span>
          {a} {pct(winRateA)}
        </span>
        <span>
          {pct(1 - winRateA)} {b}
        </span>
      </div>
      <div className="relative mt-1 flex h-2.5 gap-0.5 overflow-hidden rounded" role="img" aria-label={`${a} ${pct(winRateA)} · ${b} ${pct(1 - winRateA)}`}>
        <span className="h-full rounded-l bg-series-a" style={{ width: `${width}%` }} />
        <span className="h-full flex-1 rounded-r bg-series-b" />
        <span className="absolute left-1/2 top-0 h-full w-px bg-[var(--background)]" aria-hidden />
      </div>
    </div>
  );
}

function bucketLabel(t: ReturnType<typeof useTranslations<"Matchup">>, points: PowerPoint[], i: number): string {
  const from = points[i].fromMinute;
  const next = points[i + 1]?.fromMinute;
  if (i === 0 && from === 0 && next !== undefined) return t("bucketFirst", { to: next });
  if (next === undefined) return t("bucketLast", { from });
  return t("bucketRange", { from, to: next });
}

function PowerCurve({ a, b, curve }: { a: string; b: string; curve: LaneMatchup["powerCurve"] }) {
  const t = useTranslations("Matchup");
  const name = useChampionName();
  const pct = usePercent();
  const format = useFormatter();
  const base = curve.a.length >= curve.b.length ? curve.a : curve.b;
  const rows = base.map((p, i) => ({
    label: bucketLabel(t, base, i),
    a: curve.a.find((x) => x.fromMinute === p.fromMinute)?.winRate,
    b: curve.b.find((x) => x.fromMinute === p.fromMinute)?.winRate,
  }));
  const values = rows.flatMap((r) => [r.a, r.b]).filter((v): v is number => v !== undefined);
  const min = Math.floor((Math.min(0.48, ...values) - 0.005) / TICK_STEP) * TICK_STEP;
  const max = Math.ceil((Math.max(0.52, ...values) + 0.005) / TICK_STEP) * TICK_STEP;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += TICK_STEP) ticks.push(Math.round(v * 100) / 100);

  const spike = (points: PowerPoint[], id: string) => {
    if (points.length < 2) return null;
    const delta = points[points.length - 1].winRate - points[0].winRate;
    if (delta >= SPIKE_DELTA) return t("spikeLate", { champion: name(id) });
    if (delta <= -SPIKE_DELTA) return t("spikeEarly", { champion: name(id) });
    return null;
  };
  const notes = [spike(curve.a, a), spike(curve.b, b)].filter(Boolean);

  return (
    <section>
      <h4 className="mb-1 text-xs font-semibold uppercase opacity-70" title={t("powerCurveHelp")}>
        {t("powerCurve")}
      </h4>
      <div className="h-48 w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-muted)" }} tickLine={false} />
            <YAxis
              domain={[min, max]}
              ticks={ticks}
              interval={0}
              tickFormatter={(v: number) => format.number(v, { style: "percent", maximumFractionDigits: 0 })}
              stroke="var(--chart-axis)"
              tick={{ fill: "var(--chart-muted)" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <ReferenceLine y={0.5} stroke="var(--chart-axis)" strokeDasharray="4 4" />
            <Tooltip
              formatter={(v, key) => [pct(Number(v)), key === "a" ? name(a) : name(b)]}
              contentStyle={{ background: "var(--background)", borderColor: "var(--chart-axis)", borderRadius: 6 }}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Legend formatter={(key: string) => <span style={{ color: "var(--foreground)" }}>{key === "a" ? name(a) : name(b)}</span>} />
            <Line type="monotone" dataKey="a" stroke="var(--series-a)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: "var(--series-a)" }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="b" stroke="var(--series-b)" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: "var(--series-b)" }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {notes.length > 0 && <p className="mt-1 text-sm opacity-80">{notes.join(" · ")}</p>}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer opacity-70">{t("showTable")}</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr className="opacity-70">
              <th className="font-medium">{t("duration")}</th>
              <th className="font-medium">{name(a)}</th>
              <th className="font-medium">{name(b)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.a !== undefined ? pct(r.a) : "—"}</td>
                <td>{r.b !== undefined ? pct(r.b) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Tips({ title, tips }: { title: string; tips: string[] }) {
  const t = useTranslations("Matchup");
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase opacity-70">{title}</h4>
      {tips.length === 0 ? (
        <p className="text-sm opacity-60">{t("noTips")}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4 text-sm" lang="en">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
