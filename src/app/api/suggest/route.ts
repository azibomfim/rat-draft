import { generateText, Output } from "ai";
import { z } from "zod";
import { buildSuggestExplainPrompt, type ExplainItem } from "@/lib/ai/prompts";
import { getAIModel } from "@/lib/ai/provider";
import { badRequest, dataErrorResponse } from "@/lib/api-response";
import { getChampionIndex } from "@/lib/data/champion-index";
import { getChampions } from "@/lib/data/ddragon";
import { suggestBans, suggestPicks, type SimpleBoard } from "@/lib/draft/scoring";
import { gatherScoringData } from "@/lib/draft/scoring-data";
import { SuggestRequestSchema, type SuggestResponse } from "@/lib/draft/sim-contract";
import { otherSide } from "@/lib/draft/types";

const AI_TIMEOUT_MS = 15_000;
const EXPLAIN_PICKS_PER_ROLE = 2;

/** POST /api/suggest — deterministic ban/pick suggestions for the user's turn (+ optional AI lines). */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest([{ message: "invalid_json" }]);
  }
  const parsed = SuggestRequestSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const req = parsed.data;
  const board = req.board as SimpleBoard;

  try {
    const index = await getChampionIndex();
    const all = [...board.blue.bans, ...board.red.bans, ...board.blue.picks, ...board.red.picks].map((x) =>
      typeof x === "string" ? x : x.championId,
    );
    const unknown = all.filter((id) => !index.has(id));
    if (unknown.length) return badRequest([{ message: "unknown_champion", champions: unknown }]);

    const data = await gatherScoringData(board, [
      { side: req.side, pool: req.ownPool },
      { side: otherSide(req.side), pool: req.enemyPool },
    ]);
    const response: SuggestResponse = { action: req.action };
    if (req.action === "ban") response.bans = suggestBans(data, board, req.side, req.ownPool, req.enemyPool);
    else response.picks = suggestPicks(data, board, req.side, req.ownPool);

    if (req.explain) {
      const model = getAIModel();
      if (!model) {
        response.ai = "unavailable";
      } else {
        const items: ExplainItem[] =
          req.action === "ban"
            ? (response.bans ?? []).map((b) => ({ championId: b.championId, role: b.role, label: `score ${b.total}`, reasons: b.reasons }))
            : Object.values(response.picks ?? {}).flatMap((list) =>
                (list ?? []).slice(0, EXPLAIN_PICKS_PER_ROLE).map((p) => ({
                  championId: p.championId,
                  role: p.role,
                  label: `score ${p.total} (comfort ${p.parts.comfort ?? "n/a"}, meta ${p.parts.meta}, counter ${p.parts.counter}, fit ${p.parts.fit})`,
                  reasons: p.reasons,
                })),
              );
        try {
          const names = Object.fromEntries((await getChampions(req.locale)).map((c) => [c.id, c.name]));
          const { system, prompt } = buildSuggestExplainPrompt({ locale: req.locale, action: req.action, side: req.side, names, board, items });
          const { output } = await generateText({
            model,
            system,
            prompt,
            temperature: 0.3,
            abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]),
            output: Output.object({
              schema: z.object({ items: z.array(z.object({ championId: z.string(), text: z.string().max(300) })) }),
            }),
          });
          const allowed = new Set(items.map((i) => i.championId));
          response.explanations = Object.fromEntries(
            output.items
              .map((i) => [index.resolve(i.championId) ?? i.championId, i.text.trim()] as const)
              .filter(([id, text]) => allowed.has(id) && text),
          );
          response.ai = "ok";
        } catch (err) {
          console.error("[suggest] AI error:", err instanceof Error ? err.message : String(err));
          response.ai = "error";
        }
      }
    }
    return Response.json(response);
  } catch (err) {
    return dataErrorResponse(err);
  }
}
