"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChampionIndex, useChampionName } from "@/components/champions/ChampionData";
import { ChampionGrid } from "@/components/draft/ChampionGrid";
import { DraftBoard } from "@/components/draft/DraftBoard";
import { readEvents, type AnalyzeRequest } from "@/lib/analysis/contract";
import type { Role } from "@/lib/data/types";
import { takeDraftHandoff } from "@/lib/draft/handoff";
import { parseDraftText } from "@/lib/draft/parse-text";
import {
  DEFAULT_PICK_ROLES,
  emptyBoard,
  SIDES,
  usedChampions,
  type DraftBoardState,
  type DraftSide,
  type DraftSlot,
} from "@/lib/draft/types";
import { parseRiotIds, formatRiotId } from "@/lib/riot-id";
import { loadTeam } from "@/lib/team-storage";
import { AnalysisResults, type AnalysisState } from "./AnalysisResults";

const EMPTY_STATE: AnalysisState = { aiText: "", aiStatus: "idle" };

/** Next empty slot after `from` (bans first, then picks; blue then red). */
function nextEmptySlot(board: DraftBoardState, from: DraftSlot | null): DraftSlot | null {
  const order: DraftSlot[] = [];
  for (const kind of ["pick", "ban"] as const)
    for (const side of SIDES) for (let index = 0; index < 5; index++) order.push({ side, kind, index });
  const start = from ? order.findIndex((s) => s.side === from.side && s.kind === from.kind && s.index === from.index) + 1 : 0;
  for (let i = 0; i < order.length; i++) {
    const s = order[(start + i) % order.length];
    const filled = s.kind === "ban" ? board[s.side].bans[s.index] : board[s.side].picks[s.index].championId;
    if (!filled) return s;
  }
  return null;
}

export function AnalyzePage() {
  const t = useTranslations("Analyze");
  const tDraft = useTranslations("Draft");
  const locale = useLocale() as "pt" | "en";
  const index = useChampionIndex();
  const name = useChampionName();

  const [board, setBoard] = useState<DraftBoardState>(emptyBoard);
  const [activeSlot, setActiveSlot] = useState<DraftSlot | null>({ side: "blue", kind: "pick", index: 0 });
  const [winner, setWinner] = useState<DraftSide | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteNotice, setPasteNotice] = useState<string[]>([]);
  const [showPlayers, setShowPlayers] = useState(false);
  const [playerText, setPlayerText] = useState<Record<string, string>>({});
  const [teamNotice, setTeamNotice] = useState<string | null>(null);
  const [state, setState] = useState<AnalysisState>(EMPTY_STATE);
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [submitted, setSubmitted] = useState<AnalyzeRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Draft handed over by the simulator ("Analisar este draft").
  useEffect(() => {
    const handoff = takeDraftHandoff();
    if (!handoff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage
    setBoard(handoff.board);
    setWinner(handoff.winner ?? null);
    setActiveSlot(null);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const used = useMemo(() => usedChampions(board), [board]);
  const playerKey = (side: DraftSide, i: number) => `${side}-${i}`;

  function setSlot(slot: DraftSlot, championId: string | null) {
    setBoard((prev) => {
      const next: DraftBoardState = structuredClone(prev);
      if (slot.kind === "ban") next[slot.side].bans[slot.index] = championId;
      else next[slot.side].picks[slot.index].championId = championId;
      return next;
    });
  }

  function onSelectChampion(id: string) {
    if (!activeSlot) return;
    const next: DraftBoardState = structuredClone(board);
    if (activeSlot.kind === "ban") next[activeSlot.side].bans[activeSlot.index] = id;
    else next[activeSlot.side].picks[activeSlot.index].championId = id;
    setBoard(next);
    setActiveSlot(nextEmptySlot(next, activeSlot));
  }

  function onRoleChange(side: DraftSide, i: number, role: Role) {
    setBoard((prev) => {
      const next: DraftBoardState = structuredClone(prev);
      // Swap roles so each side keeps one of each.
      const other = next[side].picks.findIndex((p, j) => j !== i && p.role === role);
      if (other >= 0) next[side].picks[other].role = next[side].picks[i].role;
      next[side].picks[i].role = role;
      return next;
    });
  }

  function applyPaste() {
    const parsed = parseDraftText(pasteText, index);
    const notices: string[] = [];
    const sidesFound = Object.keys(parsed.picks).length + Object.keys(parsed.bans).length;
    if (sidesFound === 0) notices.push(t("pasteNothing"));
    if (parsed.unknown.length) notices.push(t("pasteUnknown", { names: parsed.unknown.join(", ") }));
    if (parsed.ignoredLines.length) notices.push(t("pasteIgnored", { lines: parsed.ignoredLines.join(" | ") }));
    setPasteNotice(notices);
    if (sidesFound === 0) return;

    const next: DraftBoardState = structuredClone(board);
    for (const side of SIDES) {
      const picks = parsed.picks[side];
      if (picks) {
        next[side].picks = DEFAULT_PICK_ROLES.map((role, i) => ({ ...next[side].picks[i], championId: picks[i] ?? null, role }));
      }
      const bans = parsed.bans[side];
      if (bans) next[side].bans = Array.from({ length: 5 }, (_, i) => bans[i] ?? null);
    }
    // The same champion cannot appear twice: keep the first occurrence.
    const seen = new Set<string>();
    for (const side of SIDES) {
      next[side].bans = next[side].bans.map((b) => (b && !seen.has(b) ? (seen.add(b), b) : null));
      for (const p of next[side].picks) {
        if (p.championId && seen.has(p.championId)) p.championId = null;
        else if (p.championId) seen.add(p.championId);
      }
    }
    setBoard(next);
    setActiveSlot(nextEmptySlot(next, null));
  }

  function fillFromSavedTeam(side: DraftSide) {
    const team = loadTeam();
    if (!team) {
      setTeamNotice(t("noSavedTeam"));
      return;
    }
    setTeamNotice(null);
    setShowPlayers(true);
    setPlayerText((prev) => {
      const next = { ...prev };
      board[side].picks.forEach((pick, i) => {
        const player = team.players.find((p) => p.role === pick.role);
        if (player) next[playerKey(side, i)] = formatRiotId(player);
      });
      return next;
    });
  }

  function reset() {
    abortRef.current?.abort();
    setBoard(emptyBoard());
    setActiveSlot({ side: "blue", kind: "pick", index: 0 });
    setWinner(null);
    setPlayerText({});
    setState(EMPTY_STATE);
    setSubmitted(null);
    setPasteNotice([]);
  }

  const complete = SIDES.every((s) => board[s].picks.every((p) => p.championId && p.role));
  const rolesOk = SIDES.every((s) => new Set(board[s].picks.map((p) => p.role)).size === 5);

  async function analyze() {
    if (!complete || !rolesOk) return;
    const player = (side: DraftSide, i: number) => {
      if (!showPlayers) return null;
      const id = parseRiotIds(playerText[playerKey(side, i)] ?? "").ids[0];
      return id ? { gameName: id.gameName, tagLine: id.tagLine } : null;
    };
    const body: AnalyzeRequest = {
      locale,
      winner,
      blue: {
        bans: board.blue.bans.filter((b): b is string => !!b),
        picks: board.blue.picks.map((p, i) => ({ championId: p.championId!, role: p.role!, player: player("blue", i) })),
      },
      red: {
        bans: board.red.bans.filter((b): b is string => !!b),
        picks: board.red.picks.map((p, i) => ({ championId: p.championId!, role: p.role!, player: player("red", i) })),
      },
    };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRequestError(false);
    setSubmitted(body);
    setState({ ...EMPTY_STATE, aiStatus: "waiting" });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      let scrolled = false;
      await readEvents(res.body, (e) => {
        setState((prev) => {
          switch (e.type) {
            case "rules":
              return { ...prev, comparison: e.comparison };
            case "matchups":
              return { ...prev, lanes: e.lanes };
            case "comfort":
              return { ...prev, comfort: e.picks };
            case "ai-start":
              return { ...prev, aiStatus: "streaming" };
            case "ai-delta":
              return { ...prev, aiText: prev.aiText + e.text };
            case "ai-done":
              return { ...prev, aiStatus: "done" };
            case "ai-unavailable":
              return { ...prev, aiStatus: "unavailable" };
            case "ai-error":
              return { ...prev, aiStatus: "error" };
            default:
              return prev;
          }
        });
        if (e.type === "rules" && !scrolled) {
          scrolled = true;
          requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        setRequestError(true);
        setState((prev) => (prev.comparison ? { ...prev, aiStatus: prev.aiStatus === "done" ? "done" : "error" } : EMPTY_STATE));
      } else {
        setState((prev) => ({ ...prev, aiStatus: prev.aiText ? "done" : "idle" }));
      }
      void err;
    } finally {
      setRunning(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  const slotCaption = activeSlot
    ? tDraft("filling", {
        slot: tDraft(activeSlot.kind === "ban" ? "slotBan" : "slotPick", {
          side: tDraft(`sideShort.${activeSlot.side}`),
          n: activeSlot.index + 1,
        }),
      })
    : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
        <p className="max-w-3xl opacity-80">{t("intro")}</p>
      </header>

      <details className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <summary className="cursor-pointer font-medium">{t("pasteTitle")}</summary>
        <p className="mt-2 text-xs opacity-70">{t("pasteHelp")}</p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={t("pastePlaceholder")}
          rows={4}
          aria-label={t("pasteTitle")}
          className="mt-2 w-full rounded border border-black/20 bg-transparent p-2 font-mono text-sm dark:border-white/20"
        />
        <button
          type="button"
          onClick={applyPaste}
          disabled={!pasteText.trim()}
          className="mt-1 rounded border border-black/20 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20"
        >
          {t("applyPaste")}
        </button>
        {pasteNotice.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-amber-800 dark:text-amber-200" aria-live="polite">
            {pasteNotice.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </details>

      <DraftBoard
        board={board}
        activeSlot={activeSlot}
        onSlotClick={setActiveSlot}
        editableRoles
        onRoleChange={onRoleChange}
        onClear={(slot) => {
          setSlot(slot, null);
          setActiveSlot(slot);
        }}
        renderPickExtra={
          showPlayers
            ? (side, i) => (
                <input
                  value={playerText[playerKey(side, i)] ?? ""}
                  onChange={(e) => setPlayerText((p) => ({ ...p, [playerKey(side, i)]: e.target.value }))}
                  placeholder={t("playerPlaceholder")}
                  aria-label={`${tDraft(`sideShort.${side}`)} ${board[side].picks[i].championId ? name(board[side].picks[i].championId!) : i + 1} · ${t("playerPlaceholder")}`}
                  className="w-full rounded border border-black/20 bg-transparent px-2 py-0.5 text-xs sm:w-36 dark:border-white/20"
                />
              )
            : undefined
        }
      />

      {activeSlot && (
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
          <ChampionGrid
            key={`${activeSlot.side}-${activeSlot.kind}-${activeSlot.index}`}
            disabled={used}
            onSelect={onSelectChampion}
            initialRole={activeSlot.kind === "pick" ? board[activeSlot.side].picks[activeSlot.index].role : null}
            caption={slotCaption}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showPlayers} onChange={(e) => setShowPlayers(e.target.checked)} />
          {t("playersToggle")}
        </label>
        {showPlayers && (
          <div className="flex flex-wrap gap-2">
            {SIDES.map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => fillFromSavedTeam(side)}
                className="rounded border border-black/20 px-2 py-1 text-xs dark:border-white/20"
              >
                {t("useSavedTeam", { side: tDraft(`sideShort.${side}`) })}
              </button>
            ))}
            {teamNotice && <span className="text-xs text-amber-800 dark:text-amber-200">{teamNotice}</span>}
          </div>
        )}
        <label className="flex flex-wrap items-center gap-2">
          <span>{t("resultLabel")}</span>
          <select
            value={winner ?? ""}
            onChange={(e) => setWinner((e.target.value || null) as DraftSide | null)}
            className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20"
          >
            <option value="">{t("resultNone")}</option>
            {SIDES.map((s) => (
              <option key={s} value={s}>
                {t("resultWin", { side: tDraft(`sideShort.${s}`) })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={analyze}
          disabled={!complete || !rolesOk || running}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {running ? t("analyzing") : t("analyze")}
        </button>
        {running && (
          <button type="button" onClick={cancel} className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            {t("cancel")}
          </button>
        )}
        <button type="button" onClick={reset} className="px-3 py-2 text-sm underline opacity-70">
          {t("reset")}
        </button>
        <span className="text-sm opacity-70" aria-live="polite">
          {!complete ? t("missingPicks") : !rolesOk ? t("duplicateRoles") : ""}
        </span>
      </div>

      {requestError && (
        <p role="alert" className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">
          {t("requestFailed")}
        </p>
      )}

      <div ref={resultsRef}>
        {submitted && (
          <AnalysisResults
            state={state}
            winner={submitted.winner ?? null}
            draft={{
              blue: { bans: submitted.blue.bans, picks: submitted.blue.picks },
              red: { bans: submitted.red.bans, picks: submitted.red.picks },
            }}
          />
        )}
      </div>
    </div>
  );
}
