"use client";

import { useTranslations } from "next-intl";
import { ChampionIcon, useChampionName } from "@/components/champions/ChampionData";
import { ROLES, type Role } from "@/lib/data/types";
import { SIDES, type DraftBoardState, type DraftSide, type DraftSlot } from "@/lib/draft/types";

interface Props {
  board: DraftBoardState;
  /** Slot currently being edited/filled (highlighted). */
  activeSlot: DraftSlot | null;
  onSlotClick: (slot: DraftSlot) => void;
  /** Free mode: role selectors and clear buttons. The simulator turns these off. */
  editableRoles?: boolean;
  /** Restrict role selectors to these sides (default: both). */
  editableSides?: DraftSide[];
  /** Side shown as "you" (label only). */
  userSide?: DraftSide;
  youLabel?: string;
  onRoleChange?: (side: DraftSide, index: number, role: Role) => void;
  onClear?: (slot: DraftSlot) => void;
  /** Optional per-pick extra content (e.g. player input). */
  renderPickExtra?: (side: DraftSide, index: number) => React.ReactNode;
}

const SIDE_STYLE: Record<DraftSide, string> = {
  blue: "border-sky-600/50 bg-sky-500/5",
  red: "border-rose-600/50 bg-rose-500/5",
};

const sameSlot = (a: DraftSlot | null, b: DraftSlot) =>
  !!a && a.side === b.side && a.kind === b.kind && a.index === b.index;

/** Two-column draft board: 5 bans + 5 picks per side. Shared by the analyzer and the simulator. */
export function DraftBoard({
  board,
  activeSlot,
  onSlotClick,
  editableRoles,
  editableSides,
  userSide,
  youLabel,
  onRoleChange,
  onClear,
  renderPickExtra,
}: Props) {
  const t = useTranslations("Draft");
  const tRoles = useTranslations("Roles");
  const name = useChampionName();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {SIDES.map((side) => (
        <section key={side} className={`rounded-lg border p-3 ${SIDE_STYLE[side]}`} aria-label={t(`sides.${side}`)}>
          <h3 className="mb-2 font-semibold">
            {t(`sides.${side}`)}
            {userSide === side && youLabel && <span className="ml-1 text-sm font-normal opacity-70">{youLabel}</span>}
          </h3>

          <p className="mb-1 text-xs font-semibold uppercase opacity-70">{t("bans")}</p>
          <ul className="mb-3 flex gap-1.5">
            {board[side].bans.map((id, index) => {
              const slot: DraftSlot = { side, kind: "ban", index };
              const active = sameSlot(activeSlot, slot);
              return (
                <li key={index} className="relative">
                  <button
                    type="button"
                    onClick={() => onSlotClick(slot)}
                    aria-label={id ? t("banSlotFilled", { n: index + 1, champion: name(id) }) : t("banSlot", { n: index + 1 })}
                    aria-pressed={active}
                    className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded border-2 ${active ? "border-amber-500" : "border-transparent"} bg-black/10 dark:bg-white/10`}
                  >
                    {id ? (
                      <span className="grayscale">
                        <ChampionIcon id={id} size={36} />
                      </span>
                    ) : (
                      <span className="text-xs opacity-50">{index + 1}</span>
                    )}
                  </button>
                  {id && onClear && (
                    <button
                      type="button"
                      onClick={() => onClear(slot)}
                      aria-label={t("clearSlot")}
                      className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-black/70 text-[10px] leading-4 text-white"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mb-1 text-xs font-semibold uppercase opacity-70">{t("picks")}</p>
          <ul className="space-y-1.5">
            {board[side].picks.map((pick, index) => {
              const slot: DraftSlot = { side, kind: "pick", index };
              const active = sameSlot(activeSlot, slot);
              return (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSlotClick(slot)}
                    aria-pressed={active}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded border-2 px-1.5 py-1 text-left text-sm ${active ? "border-amber-500" : "border-transparent"} bg-black/5 dark:bg-white/5`}
                  >
                    {pick.championId ? (
                      <ChampionIcon id={pick.championId} size={32} />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded bg-black/10 dark:bg-white/10" />
                    )}
                    <span className="truncate">{pick.championId ? name(pick.championId) : t("emptyPick")}</span>
                  </button>
                  {editableRoles && onRoleChange && (!editableSides || editableSides.includes(side)) ? (
                    <select
                      value={pick.role ?? ""}
                      onChange={(e) => onRoleChange(side, index, e.target.value as Role)}
                      aria-label={t("role")}
                      className="rounded border border-black/20 bg-transparent px-1 py-1 text-xs dark:border-white/20"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {tRoles(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    pick.role && <span className="text-xs opacity-70">{tRoles(pick.role)}</span>
                  )}
                  {pick.championId && onClear && (
                    <button type="button" onClick={() => onClear(slot)} aria-label={t("clearSlot")} className="text-xs opacity-60 hover:opacity-100">
                      ×
                    </button>
                  )}
                  {renderPickExtra?.(side, index)}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
