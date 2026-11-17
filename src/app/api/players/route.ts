import { z } from "zod";
import { getDefaultRegion, getPlayers } from "@/lib/data/players";

const MAX_PLAYERS = 5;

const BodySchema = z.object({
  players: z
    .array(
      z.object({
        gameName: z.string().trim().min(1).max(32),
        tagLine: z.string().trim().min(1).max(8),
      }),
    )
    .min(1)
    .max(MAX_PLAYERS),
  region: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,4}\d?$/)
    .optional(),
  /** Skip the 10 min cache (the "Atualizar" button). */
  refresh: z.boolean().optional(),
});

/** POST: Riot IDs → profiles. One failing player never fails the others. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const { players, region, refresh } = parsed.data;
  const results = await getPlayers(players, region ?? getDefaultRegion(), { refresh });
  return Response.json({ results });
}
