import { z } from "zod";
import { badRequest, dataErrorResponse, PUBLIC_DATA_CACHE } from "@/lib/api-response";
import { getChampionMeta, resolveChampionId } from "@/lib/data/champions";
import { DataSourceError } from "@/lib/data/errors";
import { ROLES } from "@/lib/data/types";

const QuerySchema = z.object({
  id: z.string().trim().min(1).max(40),
  role: z.enum(ROLES),
});

/** GET /api/champion?id=Ahri&role=mid → ChampionMeta */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return badRequest(parsed.error.issues);

  try {
    const championId = await resolveChampionId(parsed.data.id);
    if (!championId) throw new DataSourceError("opgg", "not_found", `Unknown champion: ${parsed.data.id}`);
    const meta = await getChampionMeta(championId, parsed.data.role);
    return Response.json(meta, { headers: { "Cache-Control": PUBLIC_DATA_CACHE } });
  } catch (err) {
    return dataErrorResponse(err);
  }
}
