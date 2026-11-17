/**
 * Saved team in localStorage, reused by the Team page, the simulator and the
 * analyzer. Every access is wrapped: storage may be blocked or unavailable.
 */
import { z } from "zod";
import { ROLES, type PlayerResult, type Role } from "./data/types";

const STORAGE_KEY = "rat-draft:team:v1";

export interface SavedPlayer {
  gameName: string;
  tagLine: string;
  tagAssumed?: boolean;
  role: Role | null;
  result: PlayerResult | null;
}

export interface SavedTeam {
  savedAt: string;
  region?: string;
  players: SavedPlayer[];
}

// Light validation: only the shape we rely on; the profile itself is trusted
// because this app is the only writer.
const SavedTeamSchema = z.object({
  savedAt: z.string(),
  region: z.string().optional(),
  players: z
    .array(
      z.object({
        gameName: z.string(),
        tagLine: z.string(),
        tagAssumed: z.boolean().optional(),
        role: z.enum(ROLES).nullable(),
        result: z.object({ ok: z.boolean() }).passthrough().nullable(),
      }),
    )
    .max(5),
});

export function loadTeam(): SavedTeam | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = SavedTeamSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as unknown as SavedTeam) : null;
  } catch {
    return null;
  }
}

export function saveTeam(team: SavedTeam): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(team));
    return true;
  } catch {
    return false;
  }
}

export function clearTeam(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
