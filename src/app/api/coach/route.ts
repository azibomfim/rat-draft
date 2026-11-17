import { generateText, Output } from "ai";
import { z } from "zod";
import { buildCoachPrompt, type CoachCandidate } from "@/lib/ai/prompts";
import { getAIModel } from "@/lib/ai/provider";
import { badRequest, dataErrorResponse } from "@/lib/api-response";
import { analyzeComp } from "@/lib/comp/analyze";
import { getChampionIndex } from "@/lib/data/champion-index";
import { getChampions } from "@/lib/data/ddragon";
import { ROLES, type Role } from "@/lib/data/types";
import { openRolesOf, suggestBans, suggestPicks, usedChampions, type SimpleBoard } from "@/lib/draft/scoring";
import { gatherScoringData } from "@/lib/draft/scoring-data";
import { CoachRequestSchema, stepOfBoard, type CoachResponse } from "@/lib/draft/sim-contract";
import { otherSide } from "@/lib/draft/types";

const AI_TIMEOUT_MS = 20_000;
const BAN_CANDIDATES = 8;
const PICK_CANDIDATES_PER_ROLE = 3;

const CoachAnswerSchema = z.object({
  action: z.enum(["ban", "pick"]),
  championId: z.string().min(1).describe("Champion name or id"),
  role: z.enum(ROLES).nullable().describe("Role for picks; null for bans"),
  reasoning: z.string().min(1).max(600),
});

/**
 * POST /api/coach — the enemy coach's next ban/pick. The AI decides from the
 * rule engine's candidates; an invalid answer is retried once and then
 * replaced by the best deterministic candidate.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest([{ message: "invalid_json" }]);
  }
  const parsed = CoachRequestSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const req = parsed.data;
  const board = req.board as SimpleBoard;

  const step = stepOfBoard(board);
  if (!step || step.side !== req.coachSide) return badRequest([{ message: "not_coach_turn" }]);

  try {
    const index = await getChampionIndex();
    const used = usedChampions(board);
    const unknown = [...used].filter((id) => !index.has(id));
    if (unknown.length) return badRequest([{ message: "unknown_champion", champions: unknown }]);

    const side = req.coachSide;
    const data = await gatherScoringData(board, [
      { side, pool: req.coachPool },
      { side: otherSide(side), pool: req.opponentPool },
    ]);
    const openRoles = openRolesOf(board, side);

    // Deterministic candidates (also the fallback).
    let candidates: CoachCandidate[];
    if (step.action === "ban") {
      candidates = suggestBans(data, board, side, req.coachPool, req.opponentPool, req.style)
        .slice(0, BAN_CANDIDATES)
        .map((b) => ({ championId: b.championId, score: b.total, reasons: b.reasons }));
    } else {
      const picks = suggestPicks(data, board, side, req.coachPool, req.style);
      candidates = Object.values(picks)
        .flatMap((list) => (list ?? []).slice(0, PICK_CANDIDATES_PER_ROLE))
        .sort((a, b) => b.total - a.total)
        .map((p) => ({ championId: p.championId, role: p.role, score: p.total, reasons: p.reasons }));
    }
    if (candidates.length === 0) {
      // Extremely unlikely: fall back to any available champion that plays an open role.
      const any = index.ids().find((id) => !used.has(id));
      if (!any) return badRequest([{ message: "no_champion_available" }]);
      candidates = [{ championId: any, role: step.action === "pick" ? openRoles[0] : undefined, score: 0, reasons: [] }];
    }

    const fallback = (ai: CoachResponse["ai"]): CoachResponse => ({
      action: step.action,
      championId: candidates[0].championId,
      ...(step.action === "pick" ? { role: candidates[0].role ?? openRoles[0] } : {}),
      reasons: candidates[0].reasons,
      source: "rules",
      ai,
    });

    const model = getAIModel();
    if (!model) return Response.json(fallback("unavailable"));

    const names = Object.fromEntries((await getChampions(req.locale)).map((c) => [c.id, c.name]));
    const comps = {
      blue: analyzeComp(board.blue.picks, board.red.picks),
      red: analyzeComp(board.red.picks, board.blue.picks),
    };
    const { system, prompt } = buildCoachPrompt({
      locale: req.locale,
      style: req.style,
      coachSide: side,
      step,
      names,
      board,
      comps,
      coachPool: req.coachPool,
      opponentPool: req.opponentPool,
      openRoles,
      candidates,
    });

    /** Returns an error message for the model, or null when the answer is valid. */
    const validate = (a: z.infer<typeof CoachAnswerSchema>): { error: string } | { id: string; role?: Role } => {
      const id = index.resolve(a.championId);
      if (!id) return { error: `"${a.championId}" is not a champion.` };
      if (used.has(id)) return { error: `${names[id] ?? id} is already banned or picked.` };
      if (step.action === "pick") {
        const role = a.role ?? candidates.find((c) => c.championId === id)?.role ?? null;
        if (!role || !openRoles.includes(role)) {
          return { error: `Role "${a.role}" is not open. Open roles: ${openRoles.join(", ")}.` };
        }
        return { id, role };
      }
      return { id };
    };

    let messages = prompt;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { output } = await generateText({
          model,
          system,
          prompt: messages,
          temperature: 0.5,
          abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]),
          output: Output.object({ schema: CoachAnswerSchema }),
        });
        const check = validate(output);
        if ("error" in check) {
          messages = `${prompt}\n\nYour previous answer was invalid: ${check.error} Choose again.`;
          continue;
        }
        const chosen = candidates.find((c) => c.championId === check.id);
        const res: CoachResponse = {
          action: step.action,
          championId: check.id,
          ...(check.role ? { role: check.role } : {}),
          reasoning: output.reasoning.trim(),
          reasons: chosen?.reasons ?? [],
          source: "ai",
          ai: "ok",
        };
        return Response.json(res);
      } catch (err) {
        if (request.signal.aborted) return new Response(null, { status: 499 });
        console.error("[coach] AI error:", err instanceof Error ? err.message : String(err));
        return Response.json(fallback("error"));
      }
    }
    return Response.json(fallback("invalid"));
  } catch (err) {
    return dataErrorResponse(err);
  }
}
