/** Contracts of POST /api/suggest and POST /api/coach (shared by routes and the simulator page). */
import { z } from "zod";
import { ROLES, type Role } from "../data/types";
import { DRAFT_ORDER, type DraftAction, type DraftStep } from "./order";
import type { BanReason, BanSuggestion, PickReason, PickSuggestion, SimpleBoard } from "./scoring";

const id = z.string().trim().min(1).max(40);

const PoolPlayerSchema = z.object({
  player: z.string().trim().min(1).max(40),
  champions: z.record(id, z.number().min(0).max(100)).refine((r) => Object.keys(r).length <= 80, "too_many_champions"),
});

export const TeamPoolSchema = z.object(Object.fromEntries(ROLES.map((r) => [r, PoolPlayerSchema.optional()])) as Record<Role, z.ZodOptional<typeof PoolPlayerSchema>>);

const BoardSideSchema = z.object({
  bans: z.array(id).max(5),
  picks: z.array(z.object({ championId: id, role: z.enum(ROLES) })).max(5),
});

export const BoardSchema = z
  .object({ blue: BoardSideSchema, red: BoardSideSchema })
  .superRefine((b, ctx) => {
    const all = [...b.blue.bans, ...b.red.bans, ...b.blue.picks.map((p) => p.championId), ...b.red.picks.map((p) => p.championId)];
    if (new Set(all).size !== all.length) ctx.addIssue({ code: "custom", message: "duplicate_champion" });
    for (const side of ["blue", "red"] as const) {
      const roles = b[side].picks.map((p) => p.role);
      if (new Set(roles).size !== roles.length) ctx.addIssue({ code: "custom", message: "duplicate_role", path: [side] });
    }
  });

const Side = z.enum(["blue", "red"]);
const Locale = z.enum(["pt", "en"]);

export const SuggestRequestSchema = z.object({
  locale: Locale,
  side: Side,
  action: z.enum(["ban", "pick"]),
  board: BoardSchema,
  ownPool: TeamPoolSchema.optional(),
  enemyPool: TeamPoolSchema.optional(),
  /** Ask the AI for one-line explanations (optional, slower). */
  explain: z.boolean().optional(),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export type AiStatus = "ok" | "unavailable" | "error";

export interface SuggestResponse {
  action: DraftAction;
  bans?: BanSuggestion[];
  picks?: Partial<Record<Role, PickSuggestion[]>>;
  /** championId → one-line AI explanation (only with explain: true). */
  explanations?: Record<string, string>;
  ai?: AiStatus;
}

export const COACH_STYLES = ["meta", "counter", "balanced"] as const;

export const CoachRequestSchema = z.object({
  locale: Locale,
  coachSide: Side,
  style: z.enum(COACH_STYLES),
  board: BoardSchema,
  /** The coach's own players (the "enemy team" from the user's point of view). */
  coachPool: TeamPoolSchema.optional(),
  /** The user's players. */
  opponentPool: TeamPoolSchema.optional(),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

export interface CoachResponse {
  action: DraftAction;
  championId: string;
  role?: Role;
  /** 2–3 sentences in the UI language (AI). Missing when the rule fallback decided. */
  reasoning?: string;
  /** Rule reasons for the chosen champion (used to explain the fallback). */
  reasons: (BanReason | PickReason)[];
  source: "ai" | "rules";
  ai: AiStatus | "invalid";
}

/** The step that a board is at (number of bans + picks so far). */
export function stepOfBoard(board: SimpleBoard): DraftStep | null {
  const n = board.blue.bans.length + board.red.bans.length + board.blue.picks.length + board.red.picks.length;
  return DRAFT_ORDER[n] ?? null;
}
