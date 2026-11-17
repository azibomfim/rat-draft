"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ChampionIcon, useChampionData } from "@/components/champions/ChampionData";
import { getAttributes } from "@/lib/comp/attributes";
import { normalizeChampionKey } from "@/lib/data/champion-id";
import { ROLES, type Role } from "@/lib/data/types";

interface Props {
  /** Champions that cannot be selected (already banned/picked). */
  disabled: Set<string>;
  onSelect: (championId: string) => void;
  /** Pre-selected role filter (e.g. the role of the slot being filled). */
  initialRole?: Role | null;
  /** Shown above the grid, e.g. which slot is being filled. */
  caption?: string;
}

/** Searchable champion grid with a role filter (names in PT and EN). */
export function ChampionGrid({ disabled, onSelect, initialRole = null, caption }: Props) {
  const t = useTranslations("Draft");
  const tRoles = useTranslations("Roles");
  const { names, searchNames } = useChampionData();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | null>(initialRole);

  const ids = useMemo(() => Object.keys(names).sort((a, b) => names[a].localeCompare(names[b])), [names]);
  const q = normalizeChampionKey(query);
  const visible = ids.filter((id) => {
    if (role && !getAttributes(id)?.roles.includes(role)) return false;
    if (!q) return true;
    return (searchNames[id] ?? [names[id]]).some((n) => normalizeChampionKey(n).includes(q)) || normalizeChampionKey(id).includes(q);
  });

  return (
    <div className="flex flex-col gap-2">
      {caption && <p className="text-sm font-medium">{caption}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-40 flex-1 rounded border border-black/20 bg-transparent px-2 py-1 text-sm dark:border-white/20"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const first = visible.find((id) => !disabled.has(id));
              if (first) onSelect(first);
            }
          }}
        />
        <div role="group" aria-label={t("roleFilter")} className="flex flex-wrap gap-1 text-xs">
          <button
            type="button"
            aria-pressed={role === null}
            onClick={() => setRole(null)}
            className="rounded border border-black/20 px-2 py-1 aria-pressed:bg-foreground aria-pressed:text-background dark:border-white/20"
          >
            {t("allRoles")}
          </button>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className="rounded border border-black/20 px-2 py-1 aria-pressed:bg-foreground aria-pressed:text-background dark:border-white/20"
            >
              {tRoles(r)}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm opacity-60">{t("noResults")}</p>
      ) : (
        <ul className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1 overflow-y-auto pr-1">
          {visible.map((id) => {
            const isDisabled = disabled.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelect(id)}
                  title={names[id]}
                  className="flex w-full flex-col items-center gap-0.5 rounded p-1 text-[11px] hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale dark:hover:bg-white/10"
                >
                  <ChampionIcon id={id} size={40} />
                  <span className="w-full truncate text-center">{names[id]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
