import { streamText } from "ai";
import { getAIModel } from "@/lib/ai/provider";
import { buildAnalystPrompt } from "@/lib/ai/prompts";
import { AnalyzeRequestSchema, type AnalyzeEvent, type ComfortResult, type LaneResult } from "@/lib/analysis/contract";
import { badRequest } from "@/lib/api-response";
import { compareComps } from "@/lib/comp/analyze";
import { getChampionIndex } from "@/lib/data/champion-index";
import { getLaneMatchup } from "@/lib/data/champions";
import { getChampions } from "@/lib/data/ddragon";
import { DataSourceError } from "@/lib/data/errors";
import { getDefaultRegion, getPlayers } from "@/lib/data/players";
import { ROLES, type RiotId } from "@/lib/data/types";
import { SIDES, type DraftSide } from "@/lib/draft/types";

const toErrorInfo = (err: unknown) =>
  (err instanceof DataSourceError
    ? err
    : new DataSourceError("opgg", "bad_response", err instanceof Error ? err.message : String(err))
  ).toJSON();

/**
 * POST /api/analyze — full analysis of a finished draft (seção 8.3).
 * Streams NDJSON events: rules → matchups → comfort → AI text deltas → done.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest([{ message: "invalid_json" }]);
  }
  const parsed = AnalyzeRequestSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const req = parsed.data;

  // Every champion must exist (ids are Data Dragon ids).
  let index;
  try {
    index = await getChampionIndex();
  } catch (err) {
    return Response.json({ error: toErrorInfo(err) }, { status: 502 });
  }
  const allIds = SIDES.flatMap((s) => [...req[s].bans, ...req[s].picks.map((p) => p.championId)]);
  const unknown = allIds.filter((id) => !index.has(id));
  if (unknown.length) return badRequest([{ message: "unknown_champion", champions: unknown }]);

  const encoder = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AnalyzeEvent) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };

      // 1) Rules — immediate.
      const picksOf = (side: DraftSide) => req[side].picks.map((p) => ({ championId: p.championId, role: p.role }));
      const comparison = compareComps(picksOf("blue"), picksOf("red"));
      send({ type: "rules", comparison });

      // 2) Lane matchups and 3) comfort, in parallel.
      const byRole = (side: DraftSide) => new Map(req[side].picks.map((p) => [p.role, p.championId]));
      const blueByRole = byRole("blue");
      const redByRole = byRole("red");
      const lanesPromise: Promise<LaneResult[]> = Promise.all(
        ROLES.map(async (role): Promise<LaneResult> => {
          const blue = blueByRole.get(role)!;
          const red = redByRole.get(role)!;
          try {
            return { role, blue, red, matchup: await getLaneMatchup(role, blue, red) };
          } catch (err) {
            return { role, blue, red, error: toErrorInfo(err) };
          }
        }),
      );

      const withPlayer = SIDES.flatMap((side) =>
        req[side].picks.filter((p) => p.player).map((p) => ({ side, ...p, player: p.player as RiotId })),
      );
      const comfortPromise: Promise<ComfortResult[]> = withPlayer.length
        ? getPlayers(
            withPlayer.map((p) => p.player),
            getDefaultRegion(),
          ).then((results) =>
            withPlayer.map((p, i): ComfortResult => {
              const base = { side: p.side, role: p.role, championId: p.championId, player: p.player };
              const r = results[i];
              if (!r.ok) return { ...base, error: r.error };
              const champ = r.profile.champions.find((c) => c.championId === p.championId);
              return champ ? { ...base, comfort: champ.comfort, games: champ.games, winRate: champ.winRate } : base;
            }),
          )
        : Promise.resolve([]);

      const lanes = await lanesPromise;
      send({ type: "matchups", lanes });
      const comfort = await comfortPromise;
      if (comfort.length) send({ type: "comfort", picks: comfort });

      // 4) AI — optional; the rule-based part above always works.
      const model = getAIModel();
      if (!model) {
        send({ type: "ai-unavailable" });
      } else {
        let names: Record<string, string> = {};
        try {
          names = Object.fromEntries((await getChampions(req.locale)).map((c) => [c.id, c.name]));
        } catch {
          // fall back to ids
        }
        const { system, prompt } = buildAnalystPrompt({
          locale: req.locale,
          names,
          draft: {
            blue: { bans: req.blue.bans, picks: picksOf("blue") },
            red: { bans: req.red.bans, picks: picksOf("red") },
          },
          comparison,
          lanes,
          comfort,
          winner: req.winner ?? null,
        });
        let failed = false;
        try {
          send({ type: "ai-start" });
          const result = streamText({
            model,
            system,
            prompt,
            temperature: 0.4,
            abortSignal: signal,
            onError: ({ error }) => {
              failed = true;
              console.error("[analyze] AI stream error:", error instanceof Error ? error.message : String(error));
            },
          });
          for await (const text of result.textStream) send({ type: "ai-delta", text });
        } catch (err) {
          failed = true;
          console.error("[analyze] AI error:", err instanceof Error ? err.message : String(err));
        }
        if (!signal.aborted) send(failed ? { type: "ai-error" } : { type: "ai-done" });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
