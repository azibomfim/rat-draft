/**
 * Contract of POST /api/analyze, shared by the route and the page.
 * The response is NDJSON (one JSON event per line) so the rule-based part
 * shows up immediately and the AI text streams right after.
 */
import { z } from "zod";
import type { CompComparison } from "../comp/analyze";
import type { DataErrorInfo, LaneMatchup, Role } from "../data/types";
import { ROLES } from "../data/types";
import type { DraftSide } from "../draft/types";

const championId = z.string().trim().min(1).max(40);

const PickSchema = z.object({
  championId,
  role: z.enum(ROLES),
  player: z
    .object({ gameName: z.string().trim().min(1).max(32), tagLine: z.string().trim().min(1).max(8) })
    .nullable()
    .optional(),
});

const SideSchema = z.object({
  bans: z.array(championId).max(5),
  picks: z.array(PickSchema).length(5),
});

export const AnalyzeRequestSchema = z
  .object({
    locale: z.enum(["pt", "en"]),
    blue: SideSchema,
    red: SideSchema,
    winner: z.enum(["blue", "red"]).nullable().optional(),
  })
  .superRefine((req, ctx) => {
    for (const side of ["blue", "red"] as const) {
      const roles = new Set(req[side].picks.map((p) => p.role));
      if (roles.size !== 5) ctx.addIssue({ code: "custom", path: [side, "picks"], message: "duplicate_role" });
    }
    const all = [...req.blue.bans, ...req.red.bans, ...req.blue.picks.map((p) => p.championId), ...req.red.picks.map((p) => p.championId)];
    if (new Set(all).size !== all.length) ctx.addIssue({ code: "custom", path: [], message: "duplicate_champion" });
  });

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export interface LaneResult {
  role: Role;
  blue: string;
  red: string;
  /** From blue's point of view (championA = blue). */
  matchup?: LaneMatchup;
  error?: DataErrorInfo;
}

export interface ComfortResult {
  side: DraftSide;
  role: Role;
  championId: string;
  player: { gameName: string; tagLine: string };
  /** Undefined when the player has no recorded games on the champion. */
  comfort?: number;
  games?: number;
  winRate?: number;
  error?: DataErrorInfo;
}

export type AnalyzeEvent =
  | { type: "rules"; comparison: CompComparison }
  | { type: "matchups"; lanes: LaneResult[] }
  | { type: "comfort"; picks: ComfortResult[] }
  | { type: "ai-start" }
  | { type: "ai-delta"; text: string }
  | { type: "ai-done" }
  | { type: "ai-unavailable" }
  | { type: "ai-error" }
  | { type: "done" };

/** Reads an NDJSON response body and calls onEvent for each event. */
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: AnalyzeEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as AnalyzeEvent);
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as AnalyzeEvent);
}
