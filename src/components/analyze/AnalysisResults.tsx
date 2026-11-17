"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ChampionIcon, useChampionData, useChampionName } from "@/components/champions/ChampionData";
import { MatchupPanelView, WinRateBar } from "@/components/champions/MatchupPanel";
import { CompRadar } from "@/components/comp/CompRadar";
import { CompSummary } from "@/components/comp/CompSummary";
import { Markdown } from "@/components/Markdown";
import type { ComfortResult, LaneResult } from "@/lib/analysis/contract";
import { buildAnalysisMarkdown } from "@/lib/analysis/markdown";
import type { CompComparison, ScoreFactor, Side } from "@/lib/comp/analyze";
import type { Role } from "@/lib/data/types";
import type { DraftSide } from "@/lib/draft/types";

export type AiStatus = "idle" | "waiting" | "streaming" | "done" | "unavailable" | "error";

export interface AnalysisState {
  comparison?: CompComparison;
  lanes?: LaneResult[];
  comfort?: ComfortResult[];
  aiText: string;
  aiStatus: AiStatus;
}

interface Props {
  state: AnalysisState;
  draft: Record<DraftSide, { bans: string[]; picks: { championId: string; role: Role }[] }>;
  winner: DraftSide | null;
}

const MAX_REASONS = 4;
const toSide = (s: "a" | "b"): DraftSide => (s === "a" ? "blue" : "red");

export function AnalysisResults({ state, draft, winner }: Props) {
  const t = useTranslations("Analyze");
  const tDraft = useTranslations("Draft");
  const tComp = useTranslations("Comp");
  const tRoles = useTranslations("Roles");
  const format = useFormatter();
  const name = useChampionName();
  const { names } = useChampionData();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const { comparison, lanes, comfort, aiText, aiStatus } = state;
  if (!comparison) return null;

  const sideName = (s: DraftSide) => tDraft(`sideShort.${s}`);
  const pct = (x: number) => format.number(x, { style: "percent", maximumFractionDigits: 1 });

  const factorText = (f: ScoreFactor): string => {
    let detail = f.detail ?? "";
    if (f.code === "archetype_identity" || f.code === "archetype_matchup") detail = detail ? tComp(`archetypes.${detail}`) : "";
    else if (f.code === "weakness") detail = t(`weaknessShort.${detail}`);
    else if (f.code === "strength") detail = tComp(`strengths.${detail}`);
    else if (f.code === "phase") detail = t(`phaseNames.${detail}`);
    return t(`factors.${f.code}`, { detail });
  };

  // Reasons: the favored side's best factors + the other side's worst ones.
  const reasons: string[] = [];
  if (comparison.favored !== "even") {
    const fav = comparison.favored;
    const other = fav === "a" ? "b" : "a";
    const plus = [...comparison.scores[fav].factors].filter((f) => f.points > 0).sort((x, y) => y.points - x.points);
    const minus = [...comparison.scores[other].factors]
      .filter((f) => f.points < 0 && f.code !== "archetype_matchup")
      .sort((x, y) => x.points - y.points);
    for (const f of plus.slice(0, 2)) reasons.push(`${sideName(toSide(fav))}: ${factorText(f)}`);
    for (const f of minus.slice(0, 2)) reasons.push(`${sideName(toSide(other))}: ${factorText(f)}`);
  }
  const favoredText =
    comparison.favored === "even" ? t("even") : t("favored", { side: sideName(toSide(comparison.favored)) });
  const phaseWinner = (s: Side) => (s === "even" ? t("phaseEven") : sideName(toSide(s)));

  async function copy() {
    const md = buildAnalysisMarkdown({
      names,
      draft,
      comparison: comparison!,
      lanes: lanes ?? [],
      aiText,
      pct,
      num: (x: number) => format.number(x, { maximumFractionDigits: 1 }),
      labels: {
        title: t("markdown.title"),
        result: winner ? t("markdown.result", { side: sideName(winner) }) : null,
        scores: t("markdown.scores", {
          blue: sideName("blue"),
          red: sideName("red"),
          blueScore: comparison!.scores.a.score,
          redScore: comparison!.scores.b.score,
        }),
        favored: favoredText,
        reasons: reasons.slice(0, MAX_REASONS),
        side: { blue: tDraft("sides.blue"), red: tDraft("sides.red") },
        role: { top: tRoles("top"), jungle: tRoles("jungle"), mid: tRoles("mid"), adc: tRoles("adc"), support: tRoles("support") },
        picks: t("markdown.picks"),
        bans: t("markdown.bans"),
        archetype: t("markdown.archetype"),
        curve: t("markdown.curve"),
        damage: t("markdown.damage"),
        weaknesses: t("markdown.weaknesses"),
        strengths: t("markdown.strengths"),
        archetypeName: (type) => tComp(`archetypes.${type}`),
        weaknessText: (code) => t(`weaknessShort.${code}`),
        strengthText: (code) => tComp(`strengths.${code}`),
        lanesTitle: t("lanesTitle"),
        laneNoData: t("laneNoData"),
        aiTitle: t("aiTitle"),
        footer: t("markdown.footer"),
      },
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2500);
  }

  const aiBusy = aiStatus === "waiting" || aiStatus === "streaming";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span aria-live="polite" className="text-sm opacity-70">
          {copyState === "copied" ? t("copied") : copyState === "failed" ? t("copyFailed") : ""}
        </span>
        <button
          type="button"
          onClick={copy}
          disabled={aiBusy}
          className="rounded border border-black/20 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20"
        >
          {t("copy")}
        </button>
      </div>

      {/* 1. Overview */}
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-lg font-semibold">{t("overviewTitle")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((s) => (
            <div key={s} className={`rounded p-3 ${s === "a" ? "bg-sky-500/10" : "bg-rose-500/10"}`}>
              <p className="text-sm opacity-80">
                {sideName(toSide(s))} · {t("score")}
              </p>
              <p className="text-3xl font-bold tabular-nums">{comparison.scores[s].score}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 font-semibold">{favoredText}</p>
        {reasons.length > 0 && (
          <>
            <p className="mt-1 text-xs font-semibold uppercase opacity-70">{t("reasons")}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {reasons.slice(0, MAX_REASONS).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase opacity-70">{t("phasesTitle")}</p>
            <ul className="mt-1 space-y-0.5">
              {(["early", "mid", "late"] as const).map((p) => (
                <li key={p}>
                  {tComp(`phases.${p}`)}: <strong>{phaseWinner(comparison.phases[p])}</strong>
                </li>
              ))}
            </ul>
          </div>
          <p>
            {t("archetypeMatchup", {
              a: tComp(`archetypes.${comparison.archetypeMatchup.a}`),
              b: tComp(`archetypes.${comparison.archetypeMatchup.b}`),
            })}
            {" — "}
            {comparison.archetypeMatchup.winner === "even"
              ? t("archetypeEven")
              : t("archetypeWinner", { side: sideName(toSide(comparison.archetypeMatchup.winner)) })}
          </p>
        </div>
      </section>

      {/* 2. Compositions */}
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-lg font-semibold">{t("compsTitle")}</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <CompRadar
            teams={[
              { label: sideName("blue"), analysis: comparison.a },
              { label: sideName("red"), analysis: comparison.b },
            ]}
          />
          <CompSummary title={tDraft("sides.blue")} analysis={comparison.a} />
          <CompSummary title={tDraft("sides.red")} analysis={comparison.b} />
        </div>
      </section>

      {/* 5. Lane matchups */}
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-lg font-semibold">{t("lanesTitle")}</h2>
        {!lanes ? (
          <div className="h-40 animate-pulse rounded bg-black/5 dark:bg-white/5" aria-busy="true" />
        ) : (
          <ul className="space-y-3">
            {lanes.map((lane) => {
              const comfortFor = (side: DraftSide) => comfort?.find((c) => c.side === side && c.role === lane.role);
              return (
                <li key={lane.role} className="rounded bg-black/5 p-2 dark:bg-white/5">
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="w-16 shrink-0 font-semibold">{tRoles(lane.role)}</span>
                    <ChampionIcon id={lane.blue} size={24} />
                    <span className="truncate">{name(lane.blue)}</span>
                    <span className="opacity-50">×</span>
                    <span className="truncate">{name(lane.red)}</span>
                    <ChampionIcon id={lane.red} size={24} />
                  </div>
                  {lane.matchup?.winRateA !== undefined ? (
                    <WinRateBar a={name(lane.blue)} b={name(lane.red)} winRateA={lane.matchup.winRateA} />
                  ) : (
                    <p className="text-xs opacity-60">{t("laneNoData")}</p>
                  )}
                  {(comfortFor("blue") || comfortFor("red")) && (
                    <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs opacity-80">
                      <ComfortLine c={comfortFor("blue")} />
                      <ComfortLine c={comfortFor("red")} />
                    </div>
                  )}
                  {lane.matchup && (
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-xs opacity-70">{t("laneDetails")}</summary>
                      <div className="mt-2">
                        <MatchupPanelView a={lane.blue} b={lane.red} matchup={lane.matchup} />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3, 4, 6, 7. AI */}
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15" aria-busy={aiBusy}>
        <h2 className="mb-3 text-lg font-semibold">{t("aiTitle")}</h2>
        {aiText && <Markdown text={aiText} />}
        {aiBusy && <p className="mt-2 animate-pulse text-sm opacity-70">{t("aiLoading")}</p>}
        {aiStatus === "unavailable" && (
          <p className="rounded bg-amber-500/10 px-2 py-1 text-sm text-amber-800 dark:text-amber-200">{t("aiUnavailable")}</p>
        )}
        {aiStatus === "error" && (
          <p role="alert" className="rounded bg-red-500/10 px-2 py-1 text-sm text-red-700 dark:text-red-300">
            {t("aiError")}
          </p>
        )}
      </section>
    </div>
  );
}

function ComfortLine({ c }: { c?: ComfortResult }) {
  const t = useTranslations("Analyze");
  if (!c) return <span />;
  const who = `${c.player.gameName}#${c.player.tagLine}`;
  const body = c.error
    ? t("comfortError")
    : c.comfort === undefined
      ? t("comfortNone")
      : t("comfortValue", { comfort: c.comfort, games: c.games ?? 0 });
  return (
    <span>
      <strong>{who}</strong>: {body}
    </span>
  );
}
