"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChampionIcon, useChampionName } from "@/components/champions/ChampionData";
import { MatchupPanel } from "@/components/champions/MatchupPanel";
import { CompRadar } from "@/components/comp/CompRadar";
import { ChampionGrid } from "@/components/draft/ChampionGrid";
import { DraftBoard } from "@/components/draft/DraftBoard";
import { useRouter } from "@/i18n/navigation";
import { analyzeComp } from "@/lib/comp/analyze";
import { getAttributes } from "@/lib/comp/attributes";
import { ROLES, type Role } from "@/lib/data/types";
import { saveDraftHandoff } from "@/lib/draft/handoff";
import type { SimpleBoard } from "@/lib/draft/scoring";
import type { CoachResponse, SuggestResponse } from "@/lib/draft/sim-contract";
import {
  currentActor,
  currentStep,
  initialSimState,
  isComplete,
  openRoles,
  simReducer,
  toBoard,
  usedIds,
  type TakenAction,
} from "@/lib/draft/state";
import { otherSide, type DraftBoardState, type DraftSide } from "@/lib/draft/types";
import { ReasonList } from "./ReasonList";
import type { SimulatorConfig } from "./SimulatorSetup";
import { SuggestionsPanel } from "./SuggestionsPanel";

function toSimpleBoard(board: DraftBoardState): SimpleBoard {
  const side = (s: DraftSide) => ({
    bans: board[s].bans.filter((b): b is string => !!b),
    picks: board[s].picks.flatMap((p) => (p.championId && p.role ? [{ championId: p.championId, role: p.role }] : [])),
  });
  return { blue: side("blue"), red: side("red") };
}

interface CoachState {
  key: number;
  status: "cancelled" | "error";
}

export function DraftView({ config, onChangeSetup }: { config: SimulatorConfig; onChangeSetup: () => void }) {
  const t = useTranslations("Simulator");
  const tDraft = useTranslations("Draft");
  const tRoles = useTranslations("Roles");
  const tComp = useTranslations("Comp");
  const locale = useLocale() as "pt" | "en";
  const name = useChampionName();
  const router = useRouter();

  const [state, dispatch] = useReducer(simReducer, config.userSide, initialSimState);
  const board = useMemo(() => toBoard(state), [state]);
  const simple = useMemo(() => toSimpleBoard(board), [board]);
  const step = currentStep(state);
  const actor = currentActor(state);
  const used = useMemo(() => usedIds(state), [state]);
  const userSide = config.userSide;
  const coachSide = otherSide(userSide);
  const userOpenRoles = openRoles(state, userSide, ROLES);
  const turnKey = state.actions.length;
  const done = isComplete(state);

  /* ---------------- suggestions (user's turn) ---------------- */
  const [suggest, setSuggest] = useState<{ key: string; data?: SuggestResponse; error?: boolean }>({ key: "" });
  const [explaining, setExplaining] = useState(false);
  const suggestKey = actor === "user" && step ? `${turnKey}` : "";

  const requestSuggestions = useCallback(
    (explain: boolean, signal?: AbortSignal) =>
      fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          locale,
          side: userSide,
          action: step?.action,
          board: simple,
          ownPool: config.userPool,
          enemyPool: config.enemyPool,
          explain,
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as SuggestResponse;
      }),
    [locale, userSide, step?.action, simple, config.userPool, config.enemyPool],
  );

  useEffect(() => {
    if (!suggestKey) return;
    const controller = new AbortController();
    requestSuggestions(false, controller.signal)
      .then((data) => setSuggest({ key: suggestKey, data }))
      .catch(() => {
        if (!controller.signal.aborted) setSuggest({ key: suggestKey, error: true });
      });
    return () => controller.abort();
  }, [suggestKey, requestSuggestions]);

  async function explain() {
    const key = suggestKey;
    setExplaining(true);
    try {
      const data = await requestSuggestions(true);
      setSuggest((prev) => (prev.key === key ? { key, data } : prev));
    } catch {
      setSuggest((prev) => (prev.key === key && prev.data ? { key, data: { ...prev.data, ai: "error" } } : prev));
    } finally {
      setExplaining(false);
    }
  }

  /* ---------------- enemy coach ---------------- */
  const [coachState, setCoachState] = useState<CoachState | null>(null);
  const [coachAttempt, setCoachAttempt] = useState(0);
  const [lastCoach, setLastCoach] = useState<(CoachResponse & { step: "ban" | "pick" }) | null>(null);
  const coachAbort = useRef<AbortController | null>(null);
  const coachBlocked = coachState?.key === turnKey;
  const coachThinking = actor === "coach" && !coachBlocked;

  useEffect(() => {
    if (actor !== "coach" || coachBlocked || !step) return;
    const controller = new AbortController();
    coachAbort.current = controller;
    const key = turnKey;
    fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        locale,
        coachSide,
        style: config.style,
        board: simple,
        coachPool: config.enemyPool,
        opponentPool: config.userPool,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const r = (await res.json()) as CoachResponse;
        // Never accept an unavailable champion or a closed role.
        if (used.has(r.championId) || (step.action === "pick" && (!r.role || !openRoles(state, coachSide, ROLES).includes(r.role)))) {
          throw new Error("invalid coach move");
        }
        dispatch({ type: "act", championId: r.championId, role: r.role, by: "coach", reasoning: r.reasoning });
        setLastCoach({ ...r, step: step.action });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCoachState({ key, status: "error" });
      });
    return () => controller.abort();
    // `state`/`used`/`simple` change only with turnKey here; keyed on the turn to avoid refiring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, turnKey, coachBlocked, coachAttempt]);

  function cancelCoach() {
    coachAbort.current?.abort();
    setCoachState({ key: turnKey, status: "cancelled" });
  }

  function retryCoach() {
    setCoachState(null);
    setCoachAttempt((n) => n + 1);
  }

  /** "Let the rules decide": best deterministic option for the coach's side. */
  async function autoCoach() {
    if (!step) return;
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, side: coachSide, action: step.action, board: simple, ownPool: config.enemyPool, enemyPool: config.userPool }),
      });
      const data = (await res.json()) as SuggestResponse;
      if (step.action === "ban" && data.bans?.[0]) {
        const b = data.bans[0];
        dispatch({ type: "act", championId: b.championId, by: "coach" });
        setLastCoach({ action: "ban", championId: b.championId, reasons: b.reasons, source: "rules", ai: "unavailable", step: "ban" });
      } else if (data.picks) {
        const best = Object.values(data.picks)
          .flatMap((l) => l ?? [])
          .sort((a, b) => b.total - a.total)[0];
        if (best) {
          dispatch({ type: "act", championId: best.championId, role: best.role, by: "coach" });
          setLastCoach({ action: "pick", championId: best.championId, role: best.role, reasons: best.reasons, source: "rules", ai: "unavailable", step: "pick" });
        }
      }
      setCoachState(null);
    } catch {
      setCoachState({ key: turnKey, status: "error" });
    }
  }

  /* ---------------- user actions ---------------- */
  const [pending, setPending] = useState<{ championId: string; role: Role } | null>(null);

  function defaultRole(championId: string): Role {
    const roles = getAttributes(championId)?.roles ?? [];
    return roles.find((r) => userOpenRoles.includes(r)) ?? userOpenRoles[0];
  }

  function choose(championId: string, role?: Role) {
    if (actor !== "user" || !step || used.has(championId)) return;
    if (step.action === "ban") {
      dispatch({ type: "act", championId, by: "user" });
      return;
    }
    setPending({ championId, role: role && userOpenRoles.includes(role) ? role : defaultRole(championId) });
  }

  function confirmPick(role: Role) {
    if (!pending) return;
    dispatch({ type: "act", championId: pending.championId, role, by: "user" });
    setPending(null);
  }

  function undo() {
    coachAbort.current?.abort();
    setPending(null);
    setCoachState(null);
    dispatch({ type: "undo" });
  }

  function restart() {
    coachAbort.current?.abort();
    setPending(null);
    setCoachState(null);
    setLastCoach(null);
    dispatch({ type: "reset" });
  }

  function analyzeThis() {
    saveDraftHandoff({ board });
    router.push("/analisar");
  }

  /* ---------------- derived views ---------------- */
  const sideLabel = (s: DraftSide) => tDraft(`sideShort.${s}`);
  const playerByRole = Object.fromEntries(
    Object.entries(config.userPool ?? {}).map(([r, p]) => [r, p?.player]),
  ) as Partial<Record<Role, string>>;
  const compA = analyzeComp(simple[userSide].picks, simple[coachSide].picks);
  const compB = analyzeComp(simple[coachSide].picks, simple[userSide].picks);
  const lanes = ROLES.flatMap((role) => {
    const mine = simple[userSide].picks.find((p) => p.role === role)?.championId;
    const theirs = simple[coachSide].picks.find((p) => p.role === role)?.championId;
    return mine && theirs ? [{ role, mine, theirs }] : [];
  });
  const [laneOpen, setLaneOpen] = useState<Role | null>(null);
  const openLane = lanes.find((l) => l.role === laneOpen);

  const activeSlot = step ? { side: step.side, kind: step.action, index: step.slot } : null;
  const userActions = state.actions.some((a: TakenAction) => a.by === "user");

  return (
    <div className="space-y-4">
      {/* Turn bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <div className="text-sm">
          {step ? (
            <>
              <p className="font-semibold">{t("turn", { n: step.index + 1, phase: t(`phases.${step.phase}`) })}</p>
              <p className="opacity-80">
                {t("next", { side: sideLabel(step.side), action: t(`actions.${step.action}`) })}{" "}
                {step.side === userSide ? t("you") : t("coach")}
              </p>
            </>
          ) : (
            <p className="font-semibold">{t("done.title")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={undo}
            disabled={!userActions}
            className="rounded border border-black/20 px-3 py-1.5 disabled:opacity-40 dark:border-white/20"
          >
            {t("undo")}
          </button>
          <button type="button" onClick={restart} className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
            {t("restart")}
          </button>
          <button type="button" onClick={onChangeSetup} className="px-2 py-1.5 underline opacity-70">
            {t("newSetup")}
          </button>
        </div>
      </div>

      <DraftBoard
        board={board}
        activeSlot={activeSlot}
        onSlotClick={() => undefined}
        userSide={userSide}
        youLabel={t("you")}
        editableRoles={done}
        editableSides={[userSide]}
        onRoleChange={(side, i, role) => {
          const other = board[side].picks.findIndex((p, j) => j !== i && p.role === role);
          if (other >= 0) dispatch({ type: "swapRoles", side, a: i, b: other });
        }}
      />

      {/* Coach speech */}
      {(coachThinking || coachBlocked || lastCoach) && (
        <section
          className={`rounded-lg border p-3 ${coachSide === "blue" ? "border-sky-600/40 bg-sky-500/5" : "border-rose-600/40 bg-rose-500/5"}`}
          aria-live="polite"
        >
          <p className="mb-1 text-xs font-semibold uppercase opacity-70">{t("coachSays", { side: sideLabel(coachSide) })}</p>
          {coachThinking ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="animate-pulse">{t("coachThinking")}</span>
              <button type="button" onClick={cancelCoach} className="rounded border border-black/20 px-2 py-1 text-xs dark:border-white/20">
                {t("cancel")}
              </button>
            </div>
          ) : coachBlocked ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{coachState?.status === "cancelled" ? t("coachCancelled") : t("coachError")}</span>
              <button type="button" onClick={retryCoach} className="rounded border border-black/20 px-2 py-1 text-xs dark:border-white/20">
                {t("coachRetry")}
              </button>
              <button type="button" onClick={autoCoach} className="rounded border border-black/20 px-2 py-1 text-xs dark:border-white/20">
                {t("coachAuto")}
              </button>
            </div>
          ) : (
            lastCoach && (
              <div className="flex items-start gap-3">
                <ChampionIcon id={lastCoach.championId} size={40} />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {t("coachChose", { action: lastCoach.step, champion: name(lastCoach.championId) })}
                    {lastCoach.role && <span className="opacity-70"> · {tRoles(lastCoach.role)}</span>}
                  </p>
                  {lastCoach.reasoning ? (
                    <p className="mt-0.5">“{lastCoach.reasoning}”</p>
                  ) : (
                    <>
                      <p className="text-xs opacity-70">{t("coachRules")}</p>
                      <ReasonList reasons={lastCoach.reasons} />
                    </>
                  )}
                </div>
              </div>
            )
          )}
        </section>
      )}

      {done && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-600/40 bg-emerald-500/5 p-3">
          <p className="text-sm">{t("done.swapHelp")}</p>
          <button type="button" onClick={analyzeThis} className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background">
            {t("done.analyze")}
          </button>
        </section>
      )}

      <div className={`grid gap-4 ${actor === "user" ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
        <div className={actor === "user" ? "space-y-4" : "hidden"}>
          {actor === "user" && step && (
            <SuggestionsPanel
              key={turnKey}
              action={step.action}
              data={suggest.key === suggestKey ? suggest.data : undefined}
              loading={suggest.key !== suggestKey}
              error={suggest.key === suggestKey && !!suggest.error}
              openRoles={userOpenRoles}
              playerByRole={playerByRole}
              onChoose={choose}
              onExplain={explain}
              explaining={explaining}
            />
          )}
          {actor === "user" && step && (
            <section className="rounded-lg border border-black/10 p-3 dark:border-white/15">
              <p className="mb-2 text-sm font-medium">{step.action === "ban" ? t("yourTurnBan") : t("yourTurnPick")}</p>
              {pending ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <ChampionIcon id={pending.championId} size={40} />
                    <span>{t("pickFor", { champion: name(pending.championId) })}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {userOpenRoles.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => confirmPick(r)}
                        className={`rounded border-2 px-2 py-1 text-xs ${r === pending.role ? "border-amber-500" : "border-black/15 dark:border-white/15"}`}
                      >
                        {playerByRole[r] ? t("playerFor", { role: tRoles(r), player: playerByRole[r]! }) : tRoles(r)}
                      </button>
                    ))}
                    <button type="button" onClick={() => setPending(null)} className="px-2 py-1 text-xs underline opacity-70">
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <ChampionGrid key={turnKey} disabled={used} onSelect={(id) => choose(id)} />
              )}
            </section>
          )}

        </div>

        <div className={actor === "user" ? "space-y-4" : "grid gap-4 md:grid-cols-2"}>
          <section className="rounded-lg border border-black/10 p-3 dark:border-white/15">
            <h3 className="mb-1 font-semibold">{t("compTitle")}</h3>
            <CompRadar
              teams={[
                { label: `${sideLabel(userSide)} ${t("you")}`, analysis: compA },
                { label: sideLabel(coachSide), analysis: compB },
              ]}
            />
            <ul className="mt-2 space-y-1 text-xs">
              {[
                { label: sideLabel(userSide), c: compA },
                { label: sideLabel(coachSide), c: compB },
              ].map(({ label, c }) =>
                c.champions.length ? (
                  <li key={label}>
                    <strong>{label}:</strong> {tComp(`archetypes.${c.archetypes[0].type}`)}
                    {c.weaknesses.length > 0 && <span className="opacity-80"> · {c.weaknesses.map((w) => tComp(`weaknesses.${w}`)).join(" ")}</span>}
                  </li>
                ) : null,
              )}
            </ul>
          </section>

          {lanes.length > 0 && (
            <section className="rounded-lg border border-black/10 p-3 dark:border-white/15">
              <h3 className="mb-1 font-semibold">{t("lanesTitle")}</h3>
              <p className="mb-2 text-xs opacity-70">{t("laneHint")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {lanes.map((l) => (
                  <li key={l.role}>
                    <button
                      type="button"
                      aria-pressed={laneOpen === l.role}
                      onClick={() => setLaneOpen(laneOpen === l.role ? null : l.role)}
                      className="flex items-center gap-1 rounded border border-black/15 px-1.5 py-1 text-xs aria-pressed:border-amber-500 dark:border-white/15"
                    >
                      <span className="font-medium">{tRoles(l.role)}</span>
                      <ChampionIcon id={l.mine} size={20} />
                      <span className="opacity-60">×</span>
                      <ChampionIcon id={l.theirs} size={20} />
                    </button>
                  </li>
                ))}
              </ul>
              {openLane && (
                <div className="mt-3">
                  <MatchupPanel role={openLane.role} a={openLane.mine} b={openLane.theirs} />
                  <button type="button" onClick={() => setLaneOpen(null)} className="mt-1 text-xs underline opacity-70">
                    {t("close")}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
