"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CompAnalysis } from "@/lib/comp/analyze";
import { ATTRIBUTE_KEYS } from "@/lib/comp/attributes";

interface TeamSeries {
  label: string;
  analysis: CompAnalysis;
}

/**
 * Radar of the composition profile (0–10 per attribute) for one or two teams.
 * Team A uses --series-a (solid), team B --series-b (dashed): identity never
 * depends on color alone. A table view carries the same numbers.
 */
export function CompRadar({ teams }: { teams: [TeamSeries] | [TeamSeries, TeamSeries] }) {
  const t = useTranslations("Comp");
  const format = useFormatter();
  const rows = ATTRIBUTE_KEYS.map((key) => ({
    attribute: t(`attributes.${key}`),
    a: teams[0].analysis.profile[key],
    ...(teams[1] ? { b: teams[1].analysis.profile[key] } : {}),
  }));
  const num = (v: number) => format.number(v, { maximumFractionDigits: 1 });

  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase opacity-70" title={t("radarHelp")}>
        {t("radarTitle")}
      </h3>
      <div className="h-72 w-full text-[11px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius="70%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="var(--chart-grid)" />
            <PolarAngleAxis dataKey="attribute" tick={{ fill: "var(--chart-muted)" }} />
            <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={false} axisLine={false} />
            <Tooltip
              formatter={(v, key) => [num(Number(v)), key === "a" ? teams[0].label : (teams[1]?.label ?? "")]}
              contentStyle={{ background: "var(--background)", borderColor: "var(--chart-axis)", borderRadius: 6 }}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Radar
              name="a"
              dataKey="a"
              stroke="var(--series-a)"
              fill="var(--series-a)"
              fillOpacity={0.18}
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--series-a)", strokeWidth: 0 }}
              isAnimationActive={false}
            />
            {teams[1] && (
              <Radar
                name="b"
                dataKey="b"
                stroke="var(--series-b)"
                fill="var(--series-b)"
                fillOpacity={0.12}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: "var(--series-b)", strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}
            {teams[1] && (
              <Legend
                formatter={(key: string) => (
                  <span style={{ color: "var(--foreground)" }}>{key === "a" ? teams[0].label : teams[1]?.label}</span>
                )}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer opacity-70">{t("showTable")}</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr className="opacity-70">
              <th className="font-medium">{t("attribute")}</th>
              <th className="font-medium">{teams[0].label}</th>
              {teams[1] && <th className="font-medium">{teams[1].label}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.attribute}>
                <td>{r.attribute}</td>
                <td>{num(r.a)}</td>
                {teams[1] && <td>{num((r as { b?: number }).b ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
