"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { PlayerResult, Role } from "@/lib/data/types";
import { parseRiotIds, riotIdKey, type ParsedRiotId } from "@/lib/riot-id";
import { assignDefaultRoles, summarizeTeam } from "@/lib/team-summary";
import { clearTeam, loadTeam, saveTeam, type SavedPlayer, type SavedTeam } from "@/lib/team-storage";
import { PlayerCard } from "./PlayerCard";
import { TeamSummaryPanel } from "./TeamSummaryPanel";

const MAX_PLAYERS = 5;
const CLOCK_TICK_MS = 30_000;

interface Notices {
  tooMany?: number;
  tagAssumed?: string[];
  invalid?: string[];
  empty?: boolean;
}

async function fetchPlayers(
  players: { gameName: string; tagLine: string }[],
  region: string | undefined,
  refresh: boolean,
): Promise<PlayerResult[]> {
  const res = await fetch("/api/players", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ players, region, refresh }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { results: PlayerResult[] };
  return json.results;
}

export function TeamPage() {
  const t = useTranslations("Team");
  const format = useFormatter();

  const [input, setInput] = useState("");
  const [team, setTeam] = useState<SavedTeam | null>(null);
  const [loading, setLoading] = useState(false);
  const [notices, setNotices] = useState<Notices>({});
  const [requestError, setRequestError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Restore the saved team after hydration (localStorage is client-only).
  useEffect(() => {
    const saved = loadTeam();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage
    if (saved) setTeam(saved);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  function persist(next: SavedTeam) {
    setTeam(next);
    setStorageError(!saveTeam(next));
  }

  async function load(players: SavedPlayer[], region: string | undefined, refresh: boolean, keepRoles: boolean) {
    setLoading(true);
    setRequestError(false);
    setNow(Date.now());
    setTeam({ savedAt: new Date().toISOString(), region, players });
    try {
      const results = await fetchPlayers(players, region, refresh);
      const defaults = assignDefaultRoles(results.map((r) => (r.ok ? r.profile : null)));
      persist({
        savedAt: new Date().toISOString(),
        region,
        players: players.map((p, i) => ({
          ...p,
          role: keepRoles && p.role ? p.role : defaults[i],
          result: results[i] ?? null,
        })),
      });
    } catch {
      setRequestError(true);
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { ids, invalid } = parseRiotIds(input);
    const used: ParsedRiotId[] = ids.slice(0, MAX_PLAYERS);
    setNotices({
      tooMany: ids.length > MAX_PLAYERS ? ids.length : undefined,
      tagAssumed: used.filter((i) => i.tagAssumed).map((i) => i.gameName),
      invalid,
      empty: ids.length === 0,
    });
    if (used.length === 0) return;
    const region = used.find((i) => i.region)?.region;
    void load(
      used.map((i) => ({ gameName: i.gameName, tagLine: i.tagLine, tagAssumed: i.tagAssumed, role: null, result: null })),
      region,
      false,
      false,
    );
  }

  function onRefresh() {
    if (team) void load(team.players, team.region, true, true);
  }

  function onClear() {
    clearTeam();
    setTeam(null);
    setNotices({});
    setRequestError(false);
  }

  function setRole(index: number, role: Role | null) {
    if (!team) return;
    persist({ ...team, players: team.players.map((p, i) => (i === index ? { ...p, role } : p)) });
  }

  const summary = useMemo(
    () =>
      team
        ? summarizeTeam(
            team.players.map((p) => ({
              key: riotIdKey(p),
              role: p.role,
              profile: p.result?.ok ? p.result.profile : null,
            })),
          )
        : null,
    [team],
  );
  const playerNames = useMemo(
    () => Object.fromEntries((team?.players ?? []).map((p) => [riotIdKey(p), p.gameName])),
    [team],
  );
  const hasResults = team?.players.some((p) => p.result) ?? false;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
        <p className="max-w-3xl opacity-80">{t("intro")}</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="team-input" className="block text-sm font-medium">
          {t("inputLabel")}
        </label>
        <textarea
          id="team-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("inputPlaceholder")}
          rows={4}
          className="w-full rounded border border-black/20 bg-transparent p-2 font-mono text-sm dark:border-white/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? t("loading") : t("load")}
          </button>
          {team && (
            <>
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="rounded border border-black/20 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20"
              >
                {t("refresh")}
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={loading}
                className="rounded px-3 py-2 text-sm underline opacity-70 disabled:opacity-40"
              >
                {t("clear")}
              </button>
              {hasResults && !loading && (
                <span className="text-sm opacity-70">
                  {t("updatedAgo", { ago: format.relativeTime(new Date(team.savedAt), now) })}
                </span>
              )}
            </>
          )}
        </div>
      </form>

      <div className="space-y-1 text-sm" aria-live="polite">
        {notices.empty && <p className="text-red-700 dark:text-red-300">{t("empty")}</p>}
        {notices.tooMany && <p className="text-amber-700 dark:text-amber-300">{t("tooMany", { count: notices.tooMany })}</p>}
        {!!notices.tagAssumed?.length && (
          <p className="text-amber-700 dark:text-amber-300">{t("tagAssumed", { names: notices.tagAssumed.join(", ") })}</p>
        )}
        {!!notices.invalid?.length && (
          <p className="text-amber-700 dark:text-amber-300">{t("invalid", { items: notices.invalid.join(", ") })}</p>
        )}
        {requestError && <p className="text-red-700 dark:text-red-300">{t("requestFailed")}</p>}
        {storageError && <p className="opacity-70">{t("storageUnavailable")}</p>}
      </div>

      {team && (
        <>
          <p className="rounded bg-black/5 px-3 py-2 text-xs opacity-80 dark:bg-white/5">{t("dataNotice")}</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {team.players.map((p, i) => (
              <PlayerCard
                key={riotIdKey(p)}
                gameName={p.gameName}
                tagLine={p.tagLine}
                tagAssumed={p.tagAssumed}
                role={p.role}
                onRoleChange={(role) => setRole(i, role)}
                result={p.result}
                loading={loading}
                now={now}
              />
            ))}
          </div>

          {summary && hasResults && !loading && <TeamSummaryPanel summary={summary} playerNames={playerNames} />}
        </>
      )}
    </div>
  );
}
