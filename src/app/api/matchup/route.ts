import { z } from "zod";
import { badRequest, dataErrorResponse, PUBLIC_DATA_CACHE } from "@/lib/api-response";
import { getLaneMatchup, resolveChampionId } from "@/lib/data/champions";
import { DataSourceError } from "@/lib/data/errors";
import { ROLES } from "@/lib/data/types";

const QuerySchema = z.object({
  role: z.enum(ROLES),
  a: z.string().trim().min(1).max(40),
  b: z.string().trim().min(1).max(40),
});

/** GET /api/matchup?role=mid&a=Ahri&b=Syndra → LaneMatchup (from A's point of view) */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return badRequest(parsed.error.issues);

  try {
    const [a, b] = await Promise.all([resolveChampionId(parsed.data.a), resolveChampionId(parsed.data.b)]);
    if (!a || !b) {
      throw new DataSourceError("opgg", "not_found", `Unknown champion: ${!a ? parsed.data.a : parsed.data.b}`);
    }
    if (a === b) return badRequest([{ message: "a and b must be different champions" }]);
    const matchup = await getLaneMatchup(parsed.data.role, a, b);
    return Response.json(matchup, { headers: { "Cache-Control": PUBLIC_DATA_CACHE } });
  } catch (err) {
    return dataErrorResponse(err);
  }
}
