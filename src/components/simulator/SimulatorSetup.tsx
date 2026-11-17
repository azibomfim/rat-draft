"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { PlayerResult } from "@/lib/data/types";
import { toTeamPool } from "@/lib/draft/pools";
import type { TeamPool } from "@/lib/draft/scoring";
import { COACH_STYLES } from "@/lib/draft/sim-contract";
import { SIDES, type DraftSide } from "@/lib/draft/types";
import { parseRiotIds } from "@/lib/riot-id";
import { assignDefaultRoles } from "@/lib/team-summary";
import { loadTeam, type SavedTeam } from "@/lib/team-storage";

export interface SimulatorConfig {
  userSide: DraftSide;
  style: (typeof COACH_STYLES)[number];
  userPool?: TeamPool;
  enemyPool?: TeamPool;
}

const MAX_PLAYERS = 5;

export function SimulatorSetup({ initial, onStart }: { initial?: SimulatorConfig; onStart: (c: SimulatorConfig) => void }) {
  const t = useTranslations("Simulator.setup");
  const tDraft = useTranslations("Draft");
  const format = useFormatter();
  const [side, setSide] = useState<DraftSide>(initial?.userSide ?? "blue");
  const [style, setStyle] = useState<SimulatorConfig["style"]>(initial?.style ?? "balanced");
  const [team, setTeam] = useState<SavedTeam | null>(null);
  const [enemyText, setEnemyText] = useState("");
  const [enemyPool, setEnemyPool] = useState<TeamPool | undefined>(initial?.enemyPool);
  const [enemyState, setEnemyState] = useState<{ loading: boolean; loaded?: number; failed?: string[]; none?: boolean }>({ loading: false });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage
    setTeam(loadTeam());
  }, []);

  const userPool = team
    ? toTeamPool(team.players.map((p) => ({ role: p.role, profile: p.result?.ok ? p.result.profile : null })))
    : undefined;
  const loadedPlayers = team?.players.filter((p) => p.result?.ok).length ?? 0;

  async function loadEnemy() {
    const ids = parseRiotIds(enemyText).ids.slice(0, MAX_PLAYERS);
    if (!ids.length) {
      setEnemyState({ loading: false, none: true });
      return;
    }
    setEnemyState({ loading: true });
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ players: ids.map(({ gameName, tagLine }) => ({ gameName, tagLine })), region: ids[0].region }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { results } = (await res.json()) as { results: PlayerResult[] };
      const profiles = results.map((r) => (r.ok ? r.profile : null));
      const roles = assignDefaultRoles(profiles);
      setEnemyPool(toTeamPool(profiles.map((profile, i) => ({ role: roles[i], profile }))));
      setEnemyState({
        loading: false,
        loaded: profiles.filter(Boolean).length,
        failed: results.filter((r) => !r.ok).map((r) => `${r.riotId.gameName}#${r.riotId.tagLine}`),
      });
    } catch {
      setEnemyState({ loading: false, failed: ids.map((i) => `${i.gameName}#${i.tagLine}`) });
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("side")}</legend>
        <div className="flex gap-2">
          {SIDES.map((s) => (
            <label
              key={s}
              className={`cursor-pointer rounded border-2 px-3 py-1.5 text-sm ${side === s ? (s === "blue" ? "border-sky-600 bg-sky-500/10" : "border-rose-600 bg-rose-500/10") : "border-black/15 dark:border-white/15"}`}
            >
              <input type="radio" name="side" value={s} checked={side === s} onChange={() => setSide(s)} className="sr-only" />
              {tDraft(`sides.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1 text-sm font-medium">{t("yourTeam")}</p>
        <p className="text-sm opacity-80">
          {userPool && team
            ? t("teamLoaded", { count: loadedPlayers, ago: format.relativeTime(new Date(team.savedAt), new Date()) })
            : t("noTeam")}
        </p>
      </div>

      <div>
        <label htmlFor="enemy-team" className="mb-1 block text-sm font-medium">
          {t("enemyTeam")}
        </label>
        <p className="mb-1 text-xs opacity-70">{t("enemyHelp")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            id="enemy-team"
            rows={2}
            value={enemyText}
            onChange={(e) => setEnemyText(e.target.value)}
            placeholder={t("enemyPlaceholder")}
            className="flex-1 rounded border border-black/20 bg-transparent p-2 font-mono text-sm dark:border-white/20"
          />
          <button
            type="button"
            onClick={loadEnemy}
            disabled={!enemyText.trim() || enemyState.loading}
            className="self-start rounded border border-black/20 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20"
          >
            {enemyState.loading ? t("enemyLoading") : t("enemyLoad")}
          </button>
        </div>
        <div className="mt-1 space-y-0.5 text-xs" aria-live="polite">
          {enemyState.none && <p className="text-amber-800 dark:text-amber-200">{t("enemyNone")}</p>}
          {enemyState.loaded !== undefined && enemyState.loaded > 0 && <p>{t("enemyLoaded", { count: enemyState.loaded })}</p>}
          {!!enemyState.failed?.length && (
            <p className="text-amber-800 dark:text-amber-200">{t("enemyFailed", { names: enemyState.failed.join(", ") })}</p>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("style")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {COACH_STYLES.map((s) => (
            <label
              key={s}
              className={`cursor-pointer rounded border-2 p-2 text-sm ${style === s ? "border-foreground" : "border-black/15 dark:border-white/15"}`}
            >
              <input type="radio" name="style" value={s} checked={style === s} onChange={() => setStyle(s)} className="sr-only" />
              <span className="font-medium">{t(`styles.${s}`)}</span>
              <span className="block text-xs opacity-70">{t(`styleHelp.${s}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => onStart({ userSide: side, style, userPool, enemyPool })}
        disabled={enemyState.loading}
        className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {t("start")}
      </button>
    </section>
  );
}
